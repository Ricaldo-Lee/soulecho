/**
 * Supabase client for frontend use.
 * Uses anon key — safe for browser.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY 未配置，部分功能将不可用。'
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    // 按产品要求：刷新页面后不保留登录态，需重新验证码登录
    persistSession: false,
    // 保持当前页面内会话稳定，避免在线使用中 token 过期后被动掉线
    autoRefreshToken: true,
  },
});

/** 获取当前用户的 Bearer token（用于调用后端 API） */
export async function getBearerToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
