/**
 * 对话 / 解卦 流式输出：支持 DeepSeek（OpenAI 兼容）与 Gemini
 */
import type { Response } from 'express';

export type AiProvider = 'deepseek' | 'gemini';

export function resolveAiProvider(): AiProvider {
  const p = (process.env.AI_PROVIDER || '').toLowerCase().trim();
  if (p === 'gemini') return 'gemini';
  if (p === 'deepseek') return 'deepseek';
  if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
  return 'gemini';
}

export function resolveAiModel(provider: AiProvider = resolveAiProvider()): string {
  if (provider === 'deepseek') {
    return process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  }
  return process.env.GEMINI_MODEL || 'gemini-2.0-flash';
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function streamDeepseekChat(res: Response, messages: ChatMessage[]): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error('未配置 DEEPSEEK_API_KEY');
  }
  const model = resolveAiModel('deepseek');
  const base = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com';

  const apiRes = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
  });

  if (!apiRes.ok) {
    const t = await apiRes.text();
    throw new Error(`DeepSeek 请求失败 ${apiRes.status}: ${t.slice(0, 500)}`);
  }

  const reader = apiRes.body?.getReader();
  if (!reader) throw new Error('DeepSeek 无响应体');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
        };
        const text = json.choices?.[0]?.delta?.content ?? '';
        if (text) {
          fullText += text;
          res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
        }
      } catch {
        /* 忽略非 JSON 行 */
      }
    }
  }

  return fullText;
}

type GeminiContent = {
  role: 'user' | 'model';
  parts: { text: string }[];
};

export async function streamGeminiChat(
  res: Response,
  systemInstruction: string,
  contents: GeminiContent[],
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('未配置 GEMINI_API_KEY');
  }
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const { GoogleGenAI } = await import('@google/genai');
  const genAI = new GoogleGenAI({ apiKey });

  const stream = await genAI.models.generateContentStream({
    model,
    contents,
    config: { systemInstruction },
  });

  let fullText = '';
  for await (const chunk of stream) {
    const text = chunk.text ?? '';
    fullText += text;
    if (text) {
      res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
    }
  }
  return fullText;
}
