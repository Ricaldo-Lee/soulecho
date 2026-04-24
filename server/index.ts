/**
 * SoulEcho 灵音 — Backend Server
 * AI 流式接口（DeepSeek / Gemini）、Supabase 鉴权、阿里云短信 + 自定义手机 OTP 登录
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { sendAliyunOtpSms } from './aliyunSms';
import { normalizeChinaToE164 } from './phoneNormalize';
import {
  createMagiclinkExchange,
  ensureAuthUserForPhone,
  hashPhoneOtp,
  randomOtp6,
  safeEqualHex,
} from './phoneAuth';
import {
  resolveAiProvider,
  resolveAiModel,
  streamDeepseekChat,
  streamGeminiChat,
  type ChatMessage,
} from './llm';

const app = express();
const PORT = process.env.PORT || 3001;

// ─── 调试日志：记录所有进入后端的请求 ───
app.use((req, _res, next) => {
  console.log(`[Request] ${req.method} ${req.url} (Path: ${req.path})`);
  next();
});

/** 将请求路径规范为小写，避免 /API/... 无法匹配 /api/... 路由 */
app.use((req, _res, next) => {
  const lowerPath = req.path.toLowerCase();
  if (req.path !== lowerPath) {
    console.log(`[PathFix] Redirecting ${req.path} -> ${lowerPath}`);
    req.url = req.url.replace(req.path, lowerPath);
  }
  next();
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** 允许的前端 Origin（逗号分隔）。默认合并 localhost / 127.0.0.1，避免仅填 localhost 时用 127.0.0.1 打开页面导致 CORS 失败、前端只显示「发送失败」。 */
function corsAllowedOrigins(): string[] {
  const fromEnv = (process.env.APP_URL ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const devPair = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  return [...new Set([...fromEnv, ...devPair])];
}

app.use(
  cors({
    origin: corsAllowedOrigins(),
    credentials: true,
  }),
);

app.use(express.json({ limit: '2mb' }));

const AI_STREAM_TIMEOUT_MS = Number(process.env.AI_STREAM_TIMEOUT_MS || 120000);

async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} 超时，请稍后重试`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function requirePhoneOtpPepper(res: express.Response): string | null {
  const pepper = process.env.PHONE_OTP_PEPPER?.trim();
  if (!pepper) {
    res.status(500).json({ error: '服务端未配置 PHONE_OTP_PEPPER' });
    return null;
  }
  return pepper;
}

function mapSendCodeError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : '发送失败';

  if (raw.includes('BIZ.FREQUENCY_CHECK_FREQUENCY_FAILED')) {
    return {
      status: 429,
      message: '发送过于频繁，请稍后再试（阿里云风控限频）。若你刚收到验证码，可直接填写上一条短信内的验证码登录。',
    };
  }
  if (raw.includes('isv.BUSINESS_LIMIT_CONTROL')) {
    return {
      status: 429,
      message: '短信发送触发业务限流，请稍后再试。',
    };
  }
  return { status: 400, message: raw };
}

/** 发送验证码（阿里云短信，不经过 Supabase Phone Provider） */
const handleSendCode = async (req: express.Request, res: express.Response) => {
  const pepper = requirePhoneOtpPepper(res);
  if (!pepper) return;

  try {
    const { phone: raw } = req.body as { phone?: string };
    if (!raw?.trim()) {
      res.status(400).json({ error: '请填写手机号' });
      return;
    }
    const e164 = normalizeChinaToE164(raw);
    const code = randomOtp6();
    const codeHash = hashPhoneOtp(e164, code, pepper);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // 先发送短信再写入 challenge，避免短信发送失败却覆盖旧验证码。
    await sendAliyunOtpSms(e164, code);

    const { error: dbErr } = await supabase.from('phone_auth_challenges').upsert(
      { phone_e164: e164, code_hash: codeHash, expires_at: expiresAt },
      { onConflict: 'phone_e164' },
    );
    if (dbErr) {
      console.error('[send-code]', dbErr);
      res.status(500).json({
        error: '无法写入验证码记录，请在 Supabase 执行迁移（phone_auth_challenges）',
      });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    const mapped = mapSendCodeError(e);
    res.status(mapped.status).json({ error: mapped.message });
  }
};

app.post('/api/auth/phone/send-code', handleSendCode);
// 兜底大写路径（以防中间件失效）
app.post('/API/AUTH/PHONE/SEND-CODE', handleSendCode);

/**
 * 校验验证码后，确保 auth.users 存在该手机号用户，并用 Admin generateLink(magiclink)
 * 返回 token_hash；前端再 supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }) 换会话。
 */
const handleVerifyCode = async (req: express.Request, res: express.Response) => {
  const pepper = requirePhoneOtpPepper(res);
  if (!pepper) return;

  try {
    const { phone: raw, code } = req.body as { phone?: string; code?: string };
    if (!raw?.trim() || !code?.trim()) {
      res.status(400).json({ error: '请填写手机号和验证码' });
      return;
    }
    const e164 = normalizeChinaToE164(raw);

    const { data: row, error: selErr } = await supabase
      .from('phone_auth_challenges')
      .select('code_hash, expires_at')
      .eq('phone_e164', e164)
      .maybeSingle();

    if (selErr || !row) {
      res.status(400).json({ error: '验证码错误或已过期' });
      return;
    }
    if (new Date(row.expires_at as string).getTime() < Date.now()) {
      await supabase.from('phone_auth_challenges').delete().eq('phone_e164', e164);
      res.status(400).json({ error: '验证码错误或已过期' });
      return;
    }

    const tryHash = hashPhoneOtp(e164, code.trim(), pepper);
    if (!safeEqualHex(tryHash, row.code_hash as string)) {
      res.status(400).json({ error: '验证码错误或已过期' });
      return;
    }

    await supabase.from('phone_auth_challenges').delete().eq('phone_e164', e164);

    const { synthEmail } = await ensureAuthUserForPhone(supabase, e164);
    const { token_hash } = await createMagiclinkExchange(supabase, synthEmail);

    res.json({ token_hash, type: 'magiclink' });
  } catch (e) {
    console.error('[phone/verify]', e);
    const msg = e instanceof Error ? e.message : '验证失败';
    res.status(500).json({ error: msg });
  }
};

app.post('/api/auth/phone/verify', handleVerifyCode);
app.post('/API/AUTH/PHONE/VERIFY', handleVerifyCode);

async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: '未授权：缺少 Bearer token' });
    return;
  }
  const token = authHeader.slice(7);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: '未授权：token 无效或已过期' });
    return;
  }
  (req as express.Request & { userId: string }).userId = data.user.id;
  next();
}

/** 对话类：同一套 prompt，按配置走 DeepSeek 或 Gemini */
async function streamLlmChat(
  res: express.Response,
  systemInstruction: string,
  geminiContents: { role: 'user' | 'model'; parts: { text: string }[] }[],
  deepseekMessages: ChatMessage[],
): Promise<string> {
  const provider = resolveAiProvider();
  if (provider === 'deepseek') {
    return streamDeepseekChat(res, deepseekMessages);
  }
  return streamGeminiChat(res, systemInstruction, geminiContents);
}

/** 解卦：system + 单条 user */
async function streamLlmGuaci(
  res: express.Response,
  systemInstruction: string,
  userBlock: string,
): Promise<string> {
  const provider = resolveAiProvider();
  if (provider === 'deepseek') {
    return streamDeepseekChat(res, [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userBlock },
    ]);
  }
  return streamGeminiChat(res, systemInstruction, [
    { role: 'user', parts: [{ text: userBlock }] },
  ]);
}

app.get('/api/health', (_req, res) => {
  const ai = resolveAiProvider();
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    ai,
    model: resolveAiModel(ai),
  });
});

function numerologySystemPrompt(birthProfile: {
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
} | null) {
  return `# important
单次回复字数不能超过200字，且不允许使用MD的格式进行输出，输出内容必须简单易理解，最后加入少量的专业术语。
你现在是一位专业的中国传统四柱八字命理研究者，熟读并综合参考《穷通宝鉴》《三命通会》《滴天髓》《渊海子平》《千里命稿》《协纪辨方书》《果老星宗》《子平真诠》《神峰通考》等经典命理著作。你擅长结合传统命理理论、排盘规则、十神生克、格局喜忌、旺衰流通、大运流年等方法，对命盘进行系统、细致、可验证的分析。
【排运规则】
排大运分阴年、阳年。
阳年：甲、丙、戊、庚、壬
阴年：乙、丁、己、辛、癸
阳年男、阴年女顺排；阴年男、阳年女逆排。
具体排法以月柱干支为基准进行顺逆。
小孩交大运前，以月柱干支为大运。
十天干：甲乙丙丁戊己庚辛壬癸
十二地支：子丑寅卯辰巳午未申酉戌亥
要求：根据用户的问题结合他的命盘为其答疑解惑，以专业命理研究者口吻输出，但不要故弄玄虚。结论要有依据，尽量体现推演过程。不要只说好听的话，也不要刻意吓人，要客观平衡。内容尽量全面，但结构清晰，分点展开。

${birthProfile ? `【当前用户命盘输入】
出生日期：${birthProfile.birthDate || '未提供'}
出生时间：${birthProfile.birthTime || '未提供'}
出生地点：${birthProfile.birthPlace || '未提供'}
请在回答中结合以上生辰信息进行分析。` : '【当前用户命盘输入】暂未提供完整生辰信息，请先给出通用判断，并引导用户补充关键信息。'}`;
}

const GUACI_SYSTEM = `# important
单次回复字数不能超过200字，且不允许使用MD的格式进行输出，输出内容必须简单易理解，最后加入少量的专业术语。
你现在是精通《周易》六十四卦、梅花易数、卦变推演、象辞爻辞、阴阳动静、五行生克、卦气旺衰、六亲事理的专业传统易学占卜师，熟读《周易本义》《易经集注》《梅花易数》《焦氏易林》《卜筮正宗》《增删卜易》《黄金策》等全本易学经典，同时深度结合四柱命理逻辑思维、客观推演法则。
【核心推演规则】
1) 严格依据本卦、互卦、变卦三层结构完整断事：
   - 本卦：代表当下现状、本心诉求、目前局势、基础根气
   - 互卦：代表过程内因、隐藏矛盾、中间变数、人际暗藏关系
   - 变卦：代表最终结果、发展走向、结局走向、事态最终定数
2) 结合卦名卦义、上下卦五行、阴阳属性、动静爻、变爻爻辞、卦辞断语、五行生克制化、卦气旺衰、时令旺衰综合判断。
3) 区分吉凶但不妖魔化、不封建恐吓、不话术套路，客观中立，好坏同讲，利弊共存。
4) 回答必须体现完整推演逻辑：先解本卦现状 -> 再拆互卦隐藏问题 -> 最后断变卦结局走向。
5) 针对用户提出的具体问题（事业/感情/财运/健康/抉择/人际/学业）定向解读，不泛泛空谈。
6) 语言为专业易学研究者口吻，条理清晰、分点分段，逻辑闭环，有理有据，引用卦理而非玄学空话。
7) 若有变爻，优先参考变爻爻辞作为事态转折关键，结合卦变吉凶综合定断。
8) 结合阴阳平衡、动静守恒、物极必反的易理规律，给出贴合现实的理性建议与趋避方向。

【输出固定结构】
1. 卦象总览：本卦 / 互卦 / 变卦 卦名 + 核心卦义概括
2. 本卦解析：当下现状、自身状态、客观局势、问题根源
3. 互卦深挖：内在隐患、隐藏心事、中间波折、人际 / 环境暗线
4. 变卦推演：后续发展、走势变化、最终结果、长期走向
5. 关键爻理：动爻 / 变爻辞解读，点明转折与关键节点
6. 综合吉凶定性：整体格局、利弊占比、风险提示
7. 理性趋避建议：结合易理给出可落地的行动方案、忌讳事项

【约束要求】
- 拒绝故弄玄虚、拒绝夸张灾厄、拒绝一味讨好说好话。
- 推演过程透明，每一个结论都对应卦理、五行、爻象依据。
- 用词专业但通俗易懂，不用过度生僻古文，普通人可看懂。
- 针对用户具体疑问精准回应，不跑偏、不复制套话。`;

// ─── POST /api/chat ────────────────────────────────────────────────────────────
app.post('/api/chat', requireAuth, async (req: express.Request, res: express.Response) => {
  const { prompt, history = [], birthProfile } = req.body as {
    prompt: string;
    history: { role: string; content: string }[];
    birthProfile?: {
      birthDate?: string;
      birthTime?: string;
      birthPlace?: string;
    } | null;
  };

  if (!prompt?.trim()) {
    res.status(400).json({ error: '请输入问题内容' });
    return;
  }

  const systemInstruction = numerologySystemPrompt(birthProfile ?? null);
  const contents = [
    ...history.map((h) => ({
      role: h.role === 'user' ? ('user' as const) : ('model' as const),
      parts: [{ text: h.content }],
    })),
    { role: 'user' as const, parts: [{ text: prompt.trim() }] },
  ];
  const deepseekMessages: ChatMessage[] = [
    { role: 'system', content: systemInstruction },
    ...history.map((h) => ({
      role: h.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: h.content,
    })),
    { role: 'user', content: prompt.trim() },
  ];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const fullText = await withTimeout(
      streamLlmChat(res, systemInstruction, contents, deepseekMessages),
      AI_STREAM_TIMEOUT_MS,
      'AI 对话',
    );
    const userId = (req as express.Request & { userId: string }).userId;
    await supabase.from('readings').insert([
      {
        user_id: userId,
        role: 'user',
        content: prompt.trim(),
        created_at: new Date().toISOString(),
      },
      {
        user_id: userId,
        role: 'spirit',
        content: fullText,
        created_at: new Date().toISOString(),
      },
    ]);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI 服务暂时不可用';
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

// ─── POST /api/guaci ───────────────────────────────────────────────────────────
app.post('/api/guaci', requireAuth, async (req: express.Request, res: express.Response) => {
  const { question, payload } = req.body as { question: string; payload: string };

  if (!payload?.trim()) {
    res.status(400).json({ error: '请提供卦象数据' });
    return;
  }

  const userBlock = `【所问】\n${question}\n\n【卦象与辞】\n${payload}`;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const fullText = await withTimeout(
      streamLlmGuaci(res, GUACI_SYSTEM, userBlock),
      AI_STREAM_TIMEOUT_MS,
      'AI 解卦',
    );
    const userId = (req as express.Request & { userId: string }).userId;
    await supabase.from('guaci_readings').insert([
      {
        user_id: userId,
        question: question || '（未书）',
        payload,
        interpretation: fullText,
        created_at: new Date().toISOString(),
      },
    ]);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI 服务暂时不可用';
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

// ─── POST /api/guaci/visitor ───────────────────────────────────────────────────
app.post('/api/guaci/visitor', async (req: express.Request, res: express.Response) => {
  const { question, payload } = req.body as { question: string; payload: string };

  if (!payload?.trim()) {
    res.status(400).json({ error: '请提供卦象数据' });
    return;
  }

  const userBlock = `【所问】\n${question}\n\n【卦象与辞】\n${payload}`;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    await withTimeout(streamLlmGuaci(res, GUACI_SYSTEM, userBlock), AI_STREAM_TIMEOUT_MS, 'AI 解卦');
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI 服务暂时不可用';
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

// ─── POST /api/chat/visitor ────────────────────────────────────────────────────
app.post('/api/chat/visitor', async (req: express.Request, res: express.Response) => {
  const { prompt, history = [], birthProfile } = req.body as {
    prompt: string;
    history: { role: string; content: string }[];
    birthProfile?: {
      birthDate?: string;
      birthTime?: string;
      birthPlace?: string;
    } | null;
  };

  if (!prompt?.trim()) {
    res.status(400).json({ error: '请输入问题内容' });
    return;
  }

  const systemInstruction = numerologySystemPrompt(birthProfile ?? null);
  const contents = [
    ...history.map((h) => ({
      role: h.role === 'user' ? ('user' as const) : ('model' as const),
      parts: [{ text: h.content }],
    })),
    { role: 'user' as const, parts: [{ text: prompt.trim() }] },
  ];
  const deepseekMessages: ChatMessage[] = [
    { role: 'system', content: systemInstruction },
    ...history.map((h) => ({
      role: h.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: h.content,
    })),
    { role: 'user', content: prompt.trim() },
  ];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    await withTimeout(
      streamLlmChat(res, systemInstruction, contents, deepseekMessages),
      AI_STREAM_TIMEOUT_MS,
      'AI 对话',
    );
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI 服务暂时不可用';
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

app.get('/api/readings', requireAuth, async (req: express.Request, res: express.Response) => {
  const userId = (req as express.Request & { userId: string }).userId;
  const { data, error } = await supabase
    .from('readings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(80);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ readings: data });
});

app.get('/api/guaci/history', requireAuth, async (req: express.Request, res: express.Response) => {
  const userId = (req as express.Request & { userId: string }).userId;
  const { data, error } = await supabase
    .from('guaci_readings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ readings: data });
});

app.get('/api/guaci/pool', requireAuth, async (req: express.Request, res: express.Response) => {
  const userId = (req as express.Request & { userId: string }).userId;
  const { data, error } = await supabase
    .from('guaci_pools')
    .select('pool')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ pool: data?.pool ?? null });
});

app.post('/api/guaci/pool', requireAuth, async (req: express.Request, res: express.Response) => {
  const userId = (req as express.Request & { userId: string }).userId;
  const { pool } = req.body as { pool: number[] };

  if (!Array.isArray(pool)) {
    res.status(400).json({ error: '无效的 pool 数据' });
    return;
  }

  const { error } = await supabase
    .from('guaci_pools')
    .upsert(
      { user_id: userId, pool, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true });
});

app.get('/api/profile', requireAuth, async (req: express.Request, res: express.Response) => {
  const userId = (req as express.Request & { userId: string }).userId;
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ profile: data ?? null });
});

app.post('/api/profile', requireAuth, async (req: express.Request, res: express.Response) => {
  const userId = (req as express.Request & { userId: string }).userId;
  const { birthDate, birthTime, birthPlace } = req.body as {
    birthDate: string;
    birthTime: string;
    birthPlace: string;
  };

  if (!birthDate || !birthTime) {
    res.status(400).json({ error: '出生日期和时间为必填项' });
    return;
  }

  const { error } = await supabase.from('user_profiles').upsert(
    {
      user_id: userId,
      birth_date: birthDate,
      birth_time: birthTime,
      birth_place: birthPlace || '',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    console.error('[profile/save] upsert failed:', { userId, error: error.message });
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true });
});

// ─── 兜底：处理所有未匹配的路由 ───
app.use((req, res) => {
  console.log(`[404] Not Found: ${req.method} ${req.url}`);
  res.status(404).json({
    error: `未找到路由：${req.method} ${req.url}。请检查后端代码是否已更新并重启。`,
  });
});

app.listen(PORT, () => {
  const ai = resolveAiProvider();
  console.log(`🌌 SoulEcho 灵音 Backend http://localhost:${PORT}  AI=${ai}(${resolveAiModel(ai)})`);
});
