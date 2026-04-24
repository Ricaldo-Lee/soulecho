import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export function synthEmailFromE164(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  return `${digits}@phone.soulecho.invalid`;
}

export function hashPhoneOtp(phoneE164: string, code: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}|${phoneE164}|${code}`, 'utf8').digest('hex');
}

export function randomOtp6(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export async function ensureAuthUserForPhone(
  supabase: SupabaseClient,
  e164: string,
): Promise<{ synthEmail: string }> {
  const synthEmail = synthEmailFromE164(e164);

  const { data: existingId, error: rpcErr } = await supabase.rpc('lookup_auth_user_by_phone', {
    p_phone: e164,
  });
  if (rpcErr) throw rpcErr;

  if (existingId) {
    const uid = String(existingId);
    const { data: userWrap } = await supabase.auth.admin.getUserById(uid);
    const email = userWrap?.user?.email;
    if (!email || email !== synthEmail) {
      const { error: upErr } = await supabase.auth.admin.updateUserById(uid, {
        email: synthEmail,
        email_confirm: true,
        phone_confirm: true,
        phone: e164,
      });
      if (upErr) throw upErr;
    }
    return { synthEmail };
  }

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: synthEmail,
    phone: e164,
    email_confirm: true,
    phone_confirm: true,
  });
  if (!createErr && created.user) {
    return { synthEmail };
  }

  const em = createErr?.message?.toLowerCase() ?? '';
  if (
    em.includes('already') ||
    em.includes('registered') ||
    em.includes('exists') ||
    em.includes('duplicate')
  ) {
    const { data: id2 } = await supabase.rpc('lookup_auth_user_by_phone', { p_phone: e164 });
    if (id2) {
      const uid = String(id2);
      const { error: upErr } = await supabase.auth.admin.updateUserById(uid, {
        email: synthEmail,
        email_confirm: true,
        phone_confirm: true,
        phone: e164,
      });
      if (upErr) throw upErr;
      return { synthEmail };
    }

    // 已存在同邮箱用户但 phone 可能为空：这属于“二次登录”，可直接走 magiclink 登录。
    // 这里不再强制走 createUser，避免把“登录”误判为“注册冲突”。
    return { synthEmail };
  }

  throw createErr ?? new Error('无法创建或关联用户');
}

export async function createMagiclinkExchange(
  supabase: SupabaseClient,
  synthEmail: string,
): Promise<{ token_hash: string }> {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: synthEmail,
  });
  if (error) throw error;
  const th = data?.properties?.hashed_token;
  if (!th) throw new Error('未拿到登录令牌（generateLink），请检查 Supabase Auth');
  return { token_hash: th };
}
