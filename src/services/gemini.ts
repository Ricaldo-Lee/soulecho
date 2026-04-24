import { GoogleGenAI } from "@google/genai";

let genAI: GoogleGenAI | null = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("检测到秘钥尚未配置。请在 AI Studio 的设置中配置 GEMINI_API_KEY 以开启命理感应功能。");
    }
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

export async function getNumerologyReading(
  prompt: string, 
  history: { role: string, content: string }[], 
  birthProfile: any,
  onChunk: (chunk: string) => void
) {
  const systemInstruction = `你是一位专业的中国传统四柱八字命理研究者，名字叫"灵音"。
你熟读并综合参考《穷通宝鉴》《三命通会》《滴天髓》《渊海子平》《千里命稿》《协纪辨方书》《果老星宗》《子平真诠》《神峰通考》等经典命理著作。

${birthProfile ? `当前咨询者的生辰信息：
- 出生日期：${birthProfile.birthDate}
- 出生时间：${birthProfile.birthTime}
- 出生地点：${birthProfile.birthPlace}
请务必结合传统命理理论、排盘规则、十神生克、格局喜忌、旺衰流通、大运流年进行深度分析。` : '当前用户未提供详细生辰信息，请以通用的命理智慧进行引导。'}

【排运核心规则】
1. 阳年：甲丙戊庚壬；阴年：乙丁己辛癸。
2. 阳年男、阴年女顺排；阴年男、阳年女逆排（以月柱为基准）。
3. 交大运前以月柱为大运。
4. 包含十天干（甲-癸）与十二地支（子-亥）。

【回复规则】
1. 话术通俗易懂，严禁输出大段文字。
2. 内容必须分点展开，结论要有依据，体现推演过程。
3. 每一段话严格控制在100字以内，若超过则分段发出。
4. 保持客观平衡，不故弄玄虚，不刻意吓人，也不只说好话。
5. 展现出深厚的八字研究功底。`;

  const contents = [
    ...history.map((h) => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }],
    })),
    { role: 'user' as const, parts: [{ text: prompt }] },
  ];

  try {
    const stream = await getGenAI().models.generateContentStream({
      model: 'gemini-2.0-flash',
      contents,
      config: { systemInstruction },
    });
    let fullText = '';
    for await (const chunk of stream) {
      const chunkText = chunk.text ?? '';
      fullText += chunkText;
      onChunk(chunkText);
    }
    return fullText;
  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
}

/** 问卦三爻成卦后的综合解读（流式） */
export async function getGuaciInterpretation(
  question: string,
  payload: string,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const systemInstruction = `你是「灵音」，精通《周易》义理与象数。请根据用户所占问题与给出的本卦、互卦、变卦及卦爻辞，作综合审读：卦象关联、动静、宜忌与心态建议。语气克制、有经典依据，避免恐吓式断语。请分段输出，每段不超过120字。`;

  const contents = [
    {
      role: 'user' as const,
      parts: [{ text: `【所问】\n${question}\n\n【卦象与辞】\n${payload}` }],
    },
  ];

  try {
    const stream = await getGenAI().models.generateContentStream({
      model: 'gemini-2.0-flash',
      contents,
      config: { systemInstruction },
    });
    let fullText = '';
    for await (const chunk of stream) {
      const chunkText = chunk.text ?? '';
      fullText += chunkText;
      onChunk(chunkText);
    }
    return fullText;
  } catch (error) {
    console.error('Guaci interpretation:', error);
    throw error;
  }
}
