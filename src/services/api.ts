/**
 * API service — all backend communication goes through here.
 * Uses streaming SSE for AI responses.
 */
import { getBearerToken } from '../lib/supabase';
import { getApiBaseUrl } from '../lib/apiBase';

const BASE_URL = getApiBaseUrl();

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function authedHeaders(): Promise<HeadersInit> {
  const token = await getBearerToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Consume an SSE stream from a POST endpoint.
 * Calls onChunk for each text chunk, returns full text.
 */
async function streamPost(
  path: string,
  body: unknown,
  onChunk: (chunk: string) => void,
  useAuth: boolean = true,
): Promise<string> {
  const streamTimeoutMs = Number(import.meta.env.VITE_STREAM_TIMEOUT_MS || 120000);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), streamTimeoutMs);
  const headers = useAuth
    ? await authedHeaders()
    : { 'Content-Type': 'application/json' };

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`.toLowerCase(), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('请求超时：AI 连接中断，请重试');
    }
    throw e;
  }

  try {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `请求失败 (${res.status})`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('不支持流式响应');

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return fullText;
        try {
          const parsed = JSON.parse(data) as { chunk?: string; error?: string };
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.chunk) {
            fullText += parsed.chunk;
            onChunk(parsed.chunk);
          }
        } catch (e) {
          if (e instanceof Error && e.message !== data) throw e;
        }
      }
    }

    return fullText;
  } finally {
    window.clearTimeout(timeout);
  }
}

// ─── Chat (Numerology) API ─────────────────────────────────────────────────────

export async function getNumerologyReading(
  prompt: string,
  history: { role: string; content: string }[],
  birthProfile: { birthDate?: string; birthTime?: string; birthPlace?: string } | null,
  onChunk: (chunk: string) => void,
  isVisitor: boolean = false,
): Promise<string> {
  const path = isVisitor ? '/api/chat/visitor' : '/api/chat';
  return streamPost(path, { prompt, history, birthProfile }, onChunk, !isVisitor);
}

// ─── Guaci API ─────────────────────────────────────────────────────────────────

export async function getGuaciInterpretation(
  question: string,
  payload: string,
  onChunk: (chunk: string) => void,
  isVisitor: boolean = false,
): Promise<string> {
  const path = isVisitor ? '/api/guaci/visitor' : '/api/guaci';
  return streamPost(path, { question, payload }, onChunk, !isVisitor);
}

// ─── Readings (chat history) ──────────────────────────────────────────────────

export interface ReadingRecord {
  id: string;
  user_id: string;
  role: 'user' | 'spirit';
  content: string;
  created_at: string;
}

export async function getReadings(): Promise<ReadingRecord[]> {
  const headers = await authedHeaders();
  const res = await fetch(`${BASE_URL}/api/readings`.toLowerCase(), { headers });
  if (!res.ok) throw new Error('获取对话记录失败');
  const data = await res.json();
  return data.readings as ReadingRecord[];
}

// ─── User profile ──────────────────────────────────────────────────────────────

export interface BirthProfileRecord {
  user_id: string;
  birth_date: string;
  birth_time: string;
  birth_place: string;
  phone?: string | null;
  email?: string | null;
  display_name?: string | null;
}

export async function getProfile(): Promise<BirthProfileRecord | null> {
  const headers = await authedHeaders();
  const timeoutMs = Number(import.meta.env.VITE_PROFILE_TIMEOUT_MS || 10000);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/api/profile`.toLowerCase(), {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.profile;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function saveProfile(profile: {
  birthDate: string;
  birthTime: string;
  birthPlace: string;
}): Promise<void> {
  const headers = await authedHeaders();
  const res = await fetch(`${BASE_URL}/api/profile`.toLowerCase(), {
    method: 'POST',
    headers,
    body: JSON.stringify(profile),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || '保存档案失败');
  }
}

// ─── Guaci pool ────────────────────────────────────────────────────────────────

export async function getGuaciPool(): Promise<number[] | null> {
  const headers = await authedHeaders();
  const res = await fetch(`${BASE_URL}/api/guaci/pool`.toLowerCase(), { headers });
  if (!res.ok) return null;
  const data = await res.json();
  return data.pool;
}

export async function saveGuaciPool(pool: number[]): Promise<void> {
  const headers = await authedHeaders();
  await fetch(`${BASE_URL}/api/guaci/pool`.toLowerCase(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ pool }),
  });
}

// ─── Guaci history ─────────────────────────────────────────────────────────────

export interface GuaciRecord {
  id: string;
  user_id: string;
  question: string;
  payload: string;
  interpretation: string;
  created_at: string;
}

export async function getGuaciHistory(): Promise<GuaciRecord[]> {
  const headers = await authedHeaders();
  const res = await fetch(`${BASE_URL}/api/guaci/history`.toLowerCase(), { headers });
  if (!res.ok) return [];
  const data = await res.json();
  return data.readings as GuaciRecord[];
}
