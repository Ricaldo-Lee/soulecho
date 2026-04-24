/** 与 src/lib/phone.ts 保持一致，供服务端校验手机号 */
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
