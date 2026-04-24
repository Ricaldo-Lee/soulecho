import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { normalizeChinaToE164 } from '../lib/phone';
import { getApiBaseUrl } from '../lib/apiBase';
import { ArrowLeft, Lock, UserCircle, Smartphone } from 'lucide-react';

interface AuthProps {
  onBack: () => void;
  onSuccess: () => void;
  onVisitor: () => void;
}

function parseFailedResponse(
  text: string,
  status: number,
  fallback: string,
  apiHint: string,
): string {
  const t = text.trim();
  if (!t) {
    return `${fallback}（HTTP ${status}，无响应内容。请确认后端已启动；API=${apiHint}）`;
  }
  try {
    const j = JSON.parse(t) as { error?: string; message?: string };
    return j.error || j.message || t.slice(0, 280) || `${fallback}（HTTP ${status}）`;
  } catch {
    return t.slice(0, 280) || `${fallback}（HTTP ${status}）`;
  }
}

function isLikelyNetworkError(msg: string): boolean {
  return (
    msg === 'Failed to fetch' ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed') ||
    msg.includes('ECONNREFUSED')
  );
}

export const Auth: React.FC<AuthProps> = ({ onBack, onSuccess, onVisitor }) => {
  const API_BASE = getApiBaseUrl();
  const apiHint =
    API_BASE ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}（相对 /api，经 Vite 代理）`
      : '相对 /api');

  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldown]);

  async function upsertPhoneProfile(userId: string, e164: string, sessionEmail: string | undefined) {
    const { data: row } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!row) {
      // 仅确保 profile 行存在；避免依赖可选列（phone/email）在不同环境缺失导致报错
      await supabase.from('user_profiles').insert({
        user_id: userId,
      });
    }
  }

  const sendPhoneOtp = async () => {
    setError('');
    let e164: string;
    try {
      e164 = normalizeChinaToE164(phone);
    } catch (e) {
      setError(e instanceof Error ? e.message : '手机号格式不正确');
      return;
    }
    setLoading(true);
    try {
      const url = `${API_BASE}/api/auth/phone/send-code`.toLowerCase();
      console.log(`[Auth] Sending code to: ${url}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(parseFailedResponse(text, res.status, '发送失败', apiHint));
      }
      setOtpSent(true);
      setCooldown(60);
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : '发送失败';
      if (isLikelyNetworkError(msg)) {
        msg = `无法连接后端（${apiHint}）。请运行 npm run server:dev 启动 3001；开发环境可不设 VITE_API_URL，用相对路径走 Vite 代理。`;
      }
      setError(msg.includes('rate') ? '请求过于频繁，请稍后再试' : msg);
    } finally {
      setLoading(false);
    }
  };

  const verifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    let e164: string;
    try {
      e164 = normalizeChinaToE164(phone);
    } catch (err) {
      setError(err instanceof Error ? err.message : '手机号格式不正确');
      return;
    }
    if (!otpCode.trim()) {
      setError('请输入短信验证码');
      return;
    }
    setLoading(true);
    try {
      const url = `${API_BASE}/api/auth/phone/verify`.toLowerCase();
      console.log(`[Auth] Verifying code at: ${url}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otpCode.trim() }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(parseFailedResponse(text, res.status, '验证失败', apiHint));
      }
      let json: { token_hash?: string };
      try {
        json = JSON.parse(text) as { token_hash?: string };
      } catch {
        throw new Error('服务端返回异常，请稍后重试');
      }
      if (!json.token_hash) throw new Error('登录令牌缺失');

      const { data, error: verr } = await supabase.auth.verifyOtp({
        token_hash: json.token_hash,
        type: 'magiclink',
      });
      if (verr) throw verr;
      if (data.user) {
        await upsertPhoneProfile(data.user.id, e164, data.user.email ?? undefined);
      }
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '验证失败';
      setError(msg.includes('expired') || msg.includes('invalid') ? '验证码错误或已过期' : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden p-6 font-sans text-zinc-300">
      <motion.button
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={onBack}
        className="absolute left-8 top-8 z-20 flex items-center gap-2 text-[10px] font-light uppercase tracking-widest text-zinc-600 transition-colors hover:text-zinc-300"
        type="button"
        id="back-btn"
      >
        <ArrowLeft size={14} />
        返 回 首 页
      </motion.button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 w-full max-w-sm space-y-8"
      >
        <div className="space-y-3 text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex size-10 items-center justify-center rounded-sm border border-zinc-700">
              <div className="size-1.5 rotate-45 bg-white" />
            </div>
          </div>
          <h2 className="text-sm font-light uppercase tracking-[0.5em] text-white">手 机 号 登 录</h2>
          <p className="text-[11px] font-light uppercase tracking-widest text-zinc-600">
            验证码将经阿里云短信送达
          </p>
        </div>

        <form
          onSubmit={
            otpSent
              ? verifyPhoneOtp
              : (ev) => {
                  ev.preventDefault();
                  void sendPhoneOtp();
                }
          }
          className="space-y-4"
        >
          <div className="relative">
            <Smartphone className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-700" />
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="11 位手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={otpSent}
              className="w-full rounded-xl border border-white/5 bg-[#0A0A0A] py-4 pl-12 pr-4 text-[11px] tracking-widest text-zinc-300 placeholder:text-zinc-800 focus:border-white/10 focus:outline-none disabled:opacity-50"
            />
          </div>
          {otpSent && (
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-700" />
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="短信验证码"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="w-full rounded-xl border border-white/5 bg-[#0A0A0A] py-4 pl-12 pr-4 text-[11px] tracking-widest text-zinc-300 placeholder:text-zinc-800 focus:border-white/10 focus:outline-none"
              />
            </div>
          )}
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-[9px] uppercase tracking-widest text-red-900/60"
            >
              {error}
            </motion.p>
          )}
          {!otpSent ? (
            <button
              type="submit"
              disabled={loading || cooldown > 0}
              className="w-full rounded-xl bg-white py-4 text-[11px] font-medium uppercase tracking-[0.2em] text-black transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
              id="auth-submit-btn"
            >
              {loading ? '发送中…' : cooldown > 0 ? `${cooldown}s` : '获取验证码'}
            </button>
          ) : (
            <>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-white py-4 text-[11px] font-medium uppercase tracking-[0.2em] text-black transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
              >
                {loading ? '验证中…' : '验证并进入'}
              </button>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void sendPhoneOtp()}
                  disabled={loading || cooldown > 0}
                  className="text-[9px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
                >
                  {cooldown > 0 ? `${cooldown} 秒后可重发验证码` : '重新获取验证码'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtpCode('');
                    setCooldown(0);
                  }}
                  className="text-[9px] uppercase tracking-widest text-zinc-600 hover:text-zinc-400"
                >
                  修改手机号
                </button>
              </div>
            </>
          )}
        </form>

        <div className="flex items-center gap-4 py-2 opacity-20">
          <div className="h-px flex-1 bg-white/20" />
          <span className="text-[8px] uppercase tracking-[0.5em] text-zinc-500">或者</span>
          <div className="h-px flex-1 bg-white/20" />
        </div>

        <button
          type="button"
          onClick={onVisitor}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/5 py-4 text-[11px] font-light uppercase tracking-[0.2em] text-zinc-400 transition-all hover:bg-white/5"
          id="visitor-btn"
        >
          <UserCircle size={14} />
          以游客身份匿名体验
        </button>
      </motion.div>
    </div>
  );
};
