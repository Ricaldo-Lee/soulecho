/** 中国大陆手机号 → E.164，供 Supabase Phone Auth */
export function normalizeChinaToE164(raw: string): string {
  const trimmed = raw.trim().replace(/\s/g, '');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+86${digits}`;
  }
  if (digits.length === 13 && digits.startsWith('86')) {
    return `+${digits}`;
  }
  if (trimmed.startsWith('+')) {
    const d = trimmed.slice(1).replace(/\D/g, '');
    if (d.length >= 11) return `+${d}`;
  }
  throw new Error('请输入正确的中国大陆 11 位手机号');
}

/** E.164 手机号脱敏展示，如 +86 138****8000 */
export function maskPhoneForDisplay(e164: string | null | undefined): string {
  if (!e164?.trim()) return '';
  const d = e164.replace(/\D/g, '');
  if (d.length >= 11 && d.startsWith('86')) {
    const mobile = d.slice(2);
    if (mobile.length === 11) {
      return `+86 ${mobile.slice(0, 3)}****${mobile.slice(-4)}`;
    }
  }
  if (d.length === 11 && d.startsWith('1')) {
    return `+86 ${d.slice(0, 3)}****${d.slice(-4)}`;
  }
  return e164.trim();
}
