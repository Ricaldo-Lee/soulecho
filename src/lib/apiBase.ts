/**
 * 后端 API 根地址。
 * - 若设置 VITE_API_URL：直连该地址（注意与后端 CORS / 部署一致）。
 * - 开发环境未设置时：使用相对路径（空字符串），请求走 Vite dev server 的 /api 代理到 3001，避免误打到仅含静态资源的端口。
 */
export function getApiBaseUrl(): string {
  const v = import.meta.env.VITE_API_URL?.trim();
  if (v) return v.replace(/\/$/, '');
  if (import.meta.env.DEV) return '';
  return '';
}
