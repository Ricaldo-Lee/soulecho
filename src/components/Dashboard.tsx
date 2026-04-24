import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { getNumerologyReading, getReadings, getProfile, type ReadingRecord } from '../services/api';
import { ParticleEntity } from './ParticleEntity';
import { Send, LogOut, Menu, X, ChevronLeft, ScrollText, Archive, History } from 'lucide-react';
import { BaziArchivePanel } from './BaziArchivePanel';
import type { BirthProfileInput } from '../lib/baziArchive';
import { cn } from '../lib/utils';
import { maskPhoneForDisplay } from '../lib/phone';

interface DashboardProps {
  onLogout: () => void;
  visitorProfile: BirthProfileInput | null;
  onOpenGuaci?: () => void;
}

type DrawerPanel = 'root' | 'archive' | 'history';

function getSpiritHintsFromQuestion(lastUserText: string): string[] {
  const t = lastUserText.trim();
  const out: string[] = [];
  if (/事业|工作|职|升迁|生意|项目|同事/.test(t)) {
    out.push('事业气势更利于进攻还是沉淀？', '近期有没有容易被忽略的贵人信号？');
  }
  if (/财|富|投资|金钱|薪资|收入/.test(t)) {
    out.push('财气更像涓流还是一波进账？', '需要规避哪种冲动的财务动作？');
  }
  if (/婚|恋|缘|桃花|伴|感情|复合/.test(t)) {
    out.push('缘分要求你修的是边界还是柔软？', '相处节奏宜快还是宜慢？');
  }
  if (/健康|身体|病|调养|睡眠|焦虑/.test(t)) {
    out.push('体质偏性要先补还是先清？', '作息与节气怎样咬合更顺？');
  }
  if (/家|宅|父母|子女|亲人/.test(t)) {
    out.push('家宅气场要先安定哪一层关系？');
  }
  if (/学业|考试|进修/.test(t)) {
    out.push('这段时间静读还是实践更有利于进境？');
  }
  const fallback = [
    '同一命题换个更尖锐的问法会看见什么？',
    '若只做一处微调，盘面最欢迎你动哪一角？',
    '还有哪条被你忽略的隐性动线？',
    '当下的犹豫本身在提示什么？',
  ];
  for (const f of fallback) {
    if (out.length >= 4) break;
    if (!out.includes(f)) out.push(f);
  }
  return [...new Set(out)].slice(0, 4);
}

// Convert API reading records to display messages
function recordToMessage(r: ReadingRecord) {
  return {
    id: r.id,
    role: r.role,
    content: r.content,
    timestamp: r.created_at,
  };
}

export const Dashboard: React.FC<DashboardProps> = ({ onLogout, visitorProfile, onOpenGuaci }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [visitorMessages, setVisitorMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [profile, setProfile] = useState<BirthProfileInput | null>(visitorProfile);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPanel, setDrawerPanel] = useState<DrawerPanel>('root');

  const [authUser, setAuthUser] = useState<{
    id: string;
    email?: string | null;
    phone?: string | null;
    displayName?: string;
  } | null>(null);

  useEffect(() => {
    const sync = (u: { id: string; email?: string | null; phone?: string | null; user_metadata?: Record<string, unknown> } | null) => {
      if (!u) {
        setAuthUser(null);
        return;
      }
      const dn = u.user_metadata?.display_name;
      setAuthUser({
        id: u.id,
        email: u.email,
        phone: u.phone,
        displayName: typeof dn === 'string' ? dn : undefined,
      });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      sync(session?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      sync(session?.user ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const userLabel =
    authUser?.displayName ||
    (authUser?.phone ? maskPhoneForDisplay(authUser.phone) : '') ||
    authUser?.email?.split('@')[0] ||
    '访客';

  // Load profile and message history for logged-in users
  useEffect(() => {
    if (!authUser) return;

    // Load birth profile from backend
    getProfile().then((p) => {
      if (p?.birth_date) {
        setProfile({
          birthDate: p.birth_date,
          birthTime: p.birth_time,
          birthPlace: p.birth_place,
        });
      }
    });

    // Load chat history from backend
    getReadings().then((records) => {
      const msgs = records.map(recordToMessage);
      setMessages(msgs);
      setTimeout(
        () => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }),
        100,
      );
    });
  }, [authUser]);

  useEffect(() => {
    setProfile(visitorProfile);
  }, [visitorProfile]);

  const isLoggedIn = !!authUser;

  const handleSend = async (text: string) => {
    if (!text.trim() || isProcessing) return;

    const userMsg = text.trim();
    setInput('');
    setIsProcessing(true);

    const currentMessages = isLoggedIn ? messages : visitorMessages;

    // Optimistically add user message to UI
    const userMsgObj = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: userMsg,
      timestamp: new Date().toISOString(),
    };

    if (!isLoggedIn) {
      setVisitorMessages((prev) => [...prev, userMsgObj]);
    } else {
      setMessages((prev) => [...prev, userMsgObj]);
    }

    let fullResponse = '';
    const history = currentMessages.map((m) => ({ role: m.role, content: m.content }));

    // Add streaming placeholder
    const streamingMsg = { id: 'streaming', role: 'spirit', content: '', isStreaming: true };
    if (!isLoggedIn) {
      setVisitorMessages((prev) => [...prev, streamingMsg]);
    } else {
      setMessages((prev) => [...prev, streamingMsg]);
    }

    try {
      const resultText = await getNumerologyReading(
        userMsg,
        history,
        profile,
        (chunk) => {
          fullResponse += chunk;
          const updateStreaming = (prev: any[]) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'spirit' && last.isStreaming) last.content = fullResponse;
            return next;
          };
          if (!isLoggedIn) {
            setVisitorMessages(updateStreaming);
          } else {
            setMessages(updateStreaming);
          }
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' });
        },
        !isLoggedIn,
      );

      // Replace streaming placeholder with final message
      if (isLoggedIn) {
        // Reload from server to get proper IDs
        setMessages((prev) => {
          const next = prev.filter((m) => !m.isStreaming);
          next.push({
            id: `server-${Date.now()}`,
            role: 'spirit',
            content: resultText,
            timestamp: new Date().toISOString(),
          });
          return next;
        });
      } else {
        setVisitorMessages((prev) => {
          const next = prev.filter((m) => !m.isStreaming);
          next.push({ id: `v-${Date.now()}`, role: 'spirit', content: resultText, timestamp: new Date().toISOString() });
          return next;
        });
      }
    } catch (err) {
      console.error(err);
      if (!isLoggedIn) {
        setVisitorMessages((prev) => prev.filter((m) => !m.isStreaming));
      } else {
        setMessages((prev) => prev.filter((m) => !m.isStreaming));
      }
    } finally {
      setIsProcessing(false);
      setTimeout(
        () => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }),
        100,
      );
    }
  };

  const displayMessages = isLoggedIn ? messages : visitorMessages;

  const lastUserContent = useMemo(() => {
    const u = [...displayMessages]
      .reverse()
      .find((m) => m.role === 'user' && m.content && !m.isStreaming);
    return typeof u?.content === 'string' ? u.content.trim() : '';
  }, [displayMessages]);

  const spiritHints = useMemo(() => {
    if (!lastUserContent || isProcessing) return [];
    const heardBack = displayMessages.some(
      (m) => m.role === 'spirit' && typeof m.content === 'string' && m.content.trim().length > 0,
    );
    if (!heardBack) return [];
    return getSpiritHintsFromQuestion(lastUserContent);
  }, [lastUserContent, isProcessing, displayMessages]);

  const historyItems = [...displayMessages]
    .filter((m) => m.content && !m.isStreaming)
    .map((m, idx) => ({
      ...m,
      _sort: m.timestamp ? new Date(m.timestamp).getTime() : idx,
    }))
    .sort((a, b) => b._sort - a._sort);

  const openDrawer = (panel: DrawerPanel) => {
    setDrawerPanel(panel);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => setDrawerPanel('root'), 280);
  };

  return (
    <div className="relative z-10 flex min-h-[100dvh] flex-col overflow-hidden bg-transparent font-sans text-zinc-200">
      <AnimatePresence>
        {drawerOpen && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-label="关闭菜单"
            className="fixed inset-0 z-[55] bg-black/45 backdrop-blur-[2px]"
            onClick={closeDrawer}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drawerOpen && (
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-0 top-0 z-[60] flex h-full w-[min(100vw,22rem)] flex-col border-r border-white/15 bg-zinc-900/75 py-6 pl-5 pr-4 shadow-[8px_0_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl"
          >
            <div className="mb-6 flex items-center justify-between pr-1">
              {drawerPanel !== 'root' ? (
                <button
                  type="button"
                  onClick={() => setDrawerPanel('root')}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-sans text-[12px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <ChevronLeft className="size-4" />
                  返回
                </button>
              ) : (
                <span className="font-sans text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                  菜单
                </span>
              )}
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="关闭"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {drawerPanel === 'root' && (
                <nav className="flex flex-col gap-1 font-sans">
                  <button
                    type="button"
                    onClick={() => {
                      onOpenGuaci?.();
                      closeDrawer();
                    }}
                    className="flex items-center gap-3 rounded-xl px-3 py-3.5 text-left text-[14px] text-zinc-200 transition-colors hover:bg-white/12"
                  >
                    <ScrollText className="size-4 text-zinc-400" />
                    问卦
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawerPanel('archive')}
                    className="flex items-center gap-3 rounded-xl px-3 py-3.5 text-left text-[14px] text-zinc-200 transition-colors hover:bg-white/12"
                  >
                    <Archive className="size-4 text-zinc-400" />
                    档案
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawerPanel('history')}
                    className="flex items-center gap-3 rounded-xl px-3 py-3.5 text-left text-[14px] text-zinc-200 transition-colors hover:bg-white/12"
                  >
                    <History className="size-4 text-zinc-400" />
                    历史
                  </button>
                </nav>
              )}

              {drawerPanel === 'archive' && (
                <BaziArchivePanel
                  profile={profile}
                  userLabel={userLabel}
                  birthPlace={profile?.birthPlace}
                />
              )}

              {drawerPanel === 'history' && (
                <div className="space-y-2 pr-1">
                  <h3 className="mb-3 font-serif text-[16px] text-white">对话历史</h3>
                  {historyItems.length === 0 ? (
                    <p className="font-sans text-[12px] text-zinc-500">暂无已保存的对话。</p>
                  ) : (
                    <ul className="space-y-2">
                      {historyItems.map((m, idx) => (
                        <li
                          key={m.id || `${idx}-${m.role}`}
                          className="rounded-xl border border-white/10 bg-white/[0.06] p-3"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                'font-sans text-[10px] uppercase tracking-wider',
                                m.role === 'user' ? 'text-sky-300/90' : 'text-amber-200/80',
                              )}
                            >
                              {m.role === 'user' ? '我' : '灵音'}
                            </span>
                            {m.timestamp ? (
                              <span className="font-mono text-[9px] text-zinc-600">
                                {new Date(m.timestamp).toLocaleString('zh-CN', {
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            ) : null}
                          </div>
                          <p className="line-clamp-4 font-sans text-[11px] leading-relaxed text-zinc-300">
                            {m.content}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <header className="absolute top-0 z-50 flex h-20 w-full items-center justify-between border-b border-white/12 bg-white/[0.08] px-4 backdrop-blur-xl md:px-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => openDrawer('root')}
            className="flex size-10 items-center justify-center rounded-full border border-white/18 bg-white/[0.1] text-zinc-200 transition-colors hover:bg-white/18 hover:text-white"
            aria-label="打开菜单"
          >
            <Menu className="size-[18px]" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-sm border border-zinc-600/80 bg-white/5">
              <div className="size-1 rotate-45 bg-white" />
            </div>
            <span className="hidden font-serif text-[10px] font-light uppercase tracking-[0.35em] text-white sm:inline">
              SoulEcho / 灵音
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 md:gap-6">
          <div className="hidden flex-col items-end gap-0.5 md:flex">
            <span className="font-sans text-[8px] uppercase tracking-widest text-zinc-500">
              协议 v1.0.2
            </span>
            <span className="max-w-[200px] truncate font-sans text-[9px] tracking-wide text-zinc-500">
              {authUser
                ? authUser.phone
                  ? maskPhoneForDisplay(authUser.phone)
                  : authUser.email || '已登录'
                : '访客会话'}
            </span>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-full border border-white/18 bg-white/[0.08] px-4 py-1.5 font-sans text-[9px] uppercase tracking-widest text-zinc-200 transition-colors hover:border-white/30 hover:bg-white/16 hover:text-white"
            id="logout-btn"
          >
            {authUser ? '退出' : '注销访客'}
          </button>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center pt-10">
        <div className="relative mb-8 flex w-full items-center justify-center">
          <div className="absolute h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1),transparent_68%)] blur-[90px]" />
          <div className="absolute h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle_at_center,rgba(228,228,231,0.07),transparent_70%)] blur-[72px]" />

          <div className="relative z-20 before:pointer-events-none before:absolute before:inset-[-28%] before:rounded-full before:bg-[radial-gradient(circle_at_center,rgba(25,18,48,0.55),transparent_68%)] before:opacity-90">
            <ParticleEntity active={isProcessing} />
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="size-40 rounded-full border border-violet-200/10 shadow-[0_0_48px_rgba(120,90,200,0.12)]" />
              <div className="absolute left-1/2 top-1/2 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-violet-200/[0.07] opacity-35" />
            </div>
          </div>

          <div className="absolute left-[calc(50%+180px)] hidden w-48 opacity-50 lg:block">
            <h2 className="mb-2 font-serif text-[10px] uppercase tracking-[0.3em] text-white/80">
              序言 / PROLOGUE
            </h2>
            <p className="font-sans text-[12px] font-light leading-relaxed text-zinc-400">
              探索星辰与命理的交汇之处。
              <br />
              于虚静中叩问未来。
            </p>
          </div>
        </div>

        <div className="z-30 flex w-full max-w-xl flex-col items-center px-6 md:px-10">
          <div
            ref={scrollRef}
            className="custom-scrollbar mb-8 h-[220px] w-full space-y-6 overflow-y-auto px-3 pt-4"
          >
            <AnimatePresence>
              {displayMessages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex min-h-[100px] items-center justify-center py-10"
                  aria-hidden
                >
                  <span className="font-serif text-[22px] leading-none tracking-[0.65em] text-zinc-700/80">
                    ···
                  </span>
                </motion.div>
              )}
              {displayMessages.map((m, idx) => (
                <motion.div
                  key={m.id || idx}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[88%] px-5 py-4 text-[13px] leading-relaxed',
                      m.role === 'user'
                        ? 'rounded-[1.25rem] border border-white/16 bg-white/[0.09] font-sans tracking-wide text-zinc-100/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_20px_48px_rgba(0,0,0,0.38)] backdrop-blur-md'
                        : 'rounded-[1.4rem] border border-amber-400/16 bg-gradient-to-b from-white/[0.08] to-zinc-950/50 font-serif tracking-[0.03em] text-amber-50/[0.93] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_26px_60px_rgba(0,0,0,0.45)] backdrop-blur-md',
                    )}
                  >
                    {m.content}
                  </div>
                </motion.div>
              ))}
              {isProcessing && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-[1.25rem] border border-violet-200/12 bg-zinc-950/40 px-5 py-4 backdrop-blur-md">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-200/35 opacity-60" />
                      <span className="relative inline-flex size-2 rounded-full bg-amber-200/55" />
                    </span>
                    <span className="font-serif text-[10px] tracking-[0.42em] text-zinc-500">
                      灵体推演中
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {spiritHints.length > 0 && (
            <div className="mb-8 flex flex-wrap justify-center gap-2.5">
              {spiritHints.map((s, i) => (
                <button
                  key={`${s}-${i}`}
                  type="button"
                  onClick={() => handleSend(s)}
                  disabled={isProcessing}
                  className="max-w-[min(100%,20rem)] rounded-full border border-amber-400/14 bg-white/[0.06] px-4 py-2 font-serif text-[11px] font-normal leading-snug tracking-wide text-amber-100/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors hover:border-amber-300/25 hover:bg-white/10 hover:text-amber-50 disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="group relative w-full">
            <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-violet-200/12 via-white/10 to-amber-200/10 opacity-50 blur transition-opacity group-focus-within:opacity-70" />
            <div className="relative flex items-center gap-3 rounded-2xl border border-white/14 bg-zinc-950/55 p-2 pl-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-violet-200/15 bg-violet-950/30 text-[10px] text-zinc-400">
                叩
              </div>
              <input
                type="text"
                placeholder={isProcessing ? '正在感应…' : '在此输入您想探索的命理问题…'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend(input);
                }}
                disabled={isProcessing}
                className="min-w-0 flex-1 border-none bg-transparent py-3 font-sans text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
              />
              <button
                type="button"
                onClick={() => handleSend(input)}
                disabled={!input.trim() || isProcessing}
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-zinc-900 transition-transform active:scale-95 disabled:opacity-25"
                id="send-msg-btn"
              >
                <Send size={18} strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-2 font-sans text-[8px] font-light uppercase tracking-[0.35em] text-zinc-500">
            <span className="size-1 animate-pulse rounded-full bg-white/70 shadow-[0_0_8px_rgba(255,255,255,0.35)]" />
            连接正常 · 意念同步中
          </div>
        </div>
      </main>

      <div className="pointer-events-none absolute bottom-8 left-6 hidden font-sans text-[8px] uppercase tracking-[0.45em] text-zinc-600 vertical-rl md:block">
        {authUser ? 'ROOT' : 'GUEST'}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.12);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};
