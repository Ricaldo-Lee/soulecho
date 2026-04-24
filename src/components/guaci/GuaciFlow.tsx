import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Camera, MousePointer2, ScrollText } from 'lucide-react';
import { getHexagramById } from '../../data/kingWenHexagrams';
import { readingFromSlots, type GuaciReading } from '../../lib/guaciDraw';
import {
  loadHistory,
  loadPool,
  removeBenFromPool,
  saveHistory,
  savePool,
  type GuaciHistoryEntry,
} from '../../lib/guaciStore';
import { getGuaciInterpretation, getGuaciPool, saveGuaciPool } from '../../services/api';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import { GuaciThreeScene, type GestureHud } from './GuaciThreeScene';

type Props = {
  onBack: () => void;
};

type Slots = [number | null, number | null, number | null];

function ReadingBlock({
  title,
  id,
  changingSet,
  isBen,
}: {
  title: string;
  id: number;
  changingSet: Set<number>;
  isBen: boolean;
}) {
  const h = getHexagramById(id);
  return (
    <div className="rounded-xl border border-white/12 bg-black/35 p-4 backdrop-blur-md">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-serif text-[13px] text-amber-100/90">{title}</span>
        <span className="font-serif text-[15px] text-white">
          {h.name}
          <span className="ml-2 font-mono text-[10px] text-zinc-500">#{id}</span>
        </span>
      </div>
      <p className="mb-3 font-sans text-[12px] leading-relaxed text-zinc-300">{h.guaCi}</p>
      <ul className="space-y-1.5 border-t border-white/10 pt-3">
        {h.yao.map((y, idx) => {
          const isChanging = isBen && changingSet.has(idx);
          return (
            <li
              key={idx}
              className={cn(
                'font-sans text-[11px] leading-relaxed',
                isChanging ? 'text-amber-200/95' : 'text-zinc-400',
              )}
            >
              <span className="text-zinc-600">{idx + 1}爻：</span>
              {y.text}
              <span className="mt-0.5 block text-[10px] text-zinc-500">断：{y.fortune}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SlotLabel({ label, id }: { label: string; id: number | null }) {
  return (
    <div className="flex min-w-[5.5rem] flex-col items-center gap-1 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2">
      <span className="font-serif text-[11px] text-amber-200/80">{label}</span>
      <span className="font-mono text-[10px] text-zinc-500">
        {id != null ? `#${id} ${getHexagramById(id).name}` : '待置卦'}
      </span>
    </div>
  );
}

function RitualOrbitLoader() {
  const orbits = [
    { r: 44, dur: 14, ccw: false, dash: '6 10' },
    { r: 72, dur: 22, ccw: true, dash: '4 14' },
    { r: 100, dur: 31, ccw: false, dash: '2 18' },
  ] as const;
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative grid size-[min(72vw,300px)] place-items-center">
        <div
          className="pointer-events-none absolute inset-0 rounded-full opacity-[0.35]"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(212,175,55,0.12) 0%, transparent 62%)',
          }}
        />
        <svg
          className="col-start-1 row-start-1 size-full text-amber-200/55"
          viewBox="0 0 200 200"
          fill="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="orbit-trail-a" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(212,175,55,0)" />
              <stop offset="45%" stopColor="rgba(252,240,200,0.55)" />
              <stop offset="100%" stopColor="rgba(212,175,55,0.15)" />
            </linearGradient>
            <linearGradient id="orbit-trail-b" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(180,160,255,0)" />
              <stop offset="50%" stopColor="rgba(200,190,255,0.35)" />
              <stop offset="100%" stopColor="rgba(120,100,200,0.12)" />
            </linearGradient>
          </defs>
          {orbits.map((o, i) => (
            <motion.g
              key={i}
              style={{ transformOrigin: '100px 100px' }}
              initial={{ rotate: 0 }}
              animate={{ rotate: o.ccw ? -360 : 360 }}
              transition={{ duration: o.dur, repeat: Infinity, ease: 'linear' }}
            >
              <circle
                cx="100"
                cy="100"
                r={o.r}
                stroke={i % 2 === 0 ? 'url(#orbit-trail-a)' : 'url(#orbit-trail-b)'}
                strokeWidth={i === 2 ? 0.85 : 1.15}
                strokeDasharray={o.dash}
                strokeLinecap="round"
              />
            </motion.g>
          ))}
        </svg>
        <motion.div
          className="col-start-1 row-start-1 flex size-[4.5rem] items-center justify-center rounded-full border border-amber-400/25 bg-black/35 shadow-[inset_0_0_32px_rgba(212,175,55,0.08)] backdrop-blur-sm"
          animate={{ scale: [1, 1.04, 1], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span className="font-serif text-[17px] tracking-[0.42em] text-amber-100/88">斗</span>
        </motion.div>
      </div>
      <motion.p
        className="relative mt-12 font-serif text-[11px] tracking-[0.62em] text-amber-100/72"
        animate={{ opacity: [0.55, 0.95, 0.55] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        星 轨 交 织
      </motion.p>
      <p className="relative mt-6 max-w-[19rem] text-center font-serif text-[10px] leading-loose tracking-[0.38em] text-zinc-500">
        卦象循周天而行，与心念共振
        <span className="inline-block w-6 animate-pulse text-amber-600/75">……</span>
      </p>
    </div>
  );
}

function buildPayloadText(r: GuaciReading): string {
  const ben = getHexagramById(r.benId);
  const hu = getHexagramById(r.huId);
  const bian = getHexagramById(r.bianId);
  const yaoLines = (name: string, h: ReturnType<typeof getHexagramById>) =>
    h.yao.map((y, i) => `  ${i + 1}爻：${y.text}（${y.fortune}）`).join('\n');
  return [
    `【本卦】${ben.name}（${r.benId}）`,
    `卦辞：${ben.guaCi}`,
    yaoLines('本', ben),
    '',
    `【互卦】${hu.name}（${r.huId}）`,
    `卦辞：${hu.guaCi}`,
    yaoLines('互', hu),
    '',
    `【变卦】${bian.name}（${r.bianId}）`,
    `卦辞：${bian.guaCi}`,
    yaoLines('变', bian),
    '',
    `【变爻位置】（自下而上第几爻，0 起）：${r.changingLines.length ? r.changingLines.map((x) => x + 1).join('、') : '无差异或自选'}`,
  ].join('\n');
}

export const GuaciFlow: React.FC<Props> = ({ onBack }) => {
  const [step, setStep] = useState<
    'question' | 'draw' | 'drawComplete' | 'ritualLoading' | 'interpret'
  >('question');
  const [question, setQuestion] = useState('');
  const [pool, setPool] = useState<number[]>(() => loadPool());
  const [history, setHistory] = useState<GuaciHistoryEntry[]>(() => loadHistory());
  const [deckShuffle, setDeckShuffle] = useState(1);
  const [slots, setSlots] = useState<Slots>([null, null, null]);
  const [inputMode, setInputMode] = useState<'hands' | 'mouse'>('hands');
  const [hud, setHud] = useState<{ g: GestureHud; allow: boolean }>({ g: 'NONE', allow: false });
  const [deckSpread, setDeckSpread] = useState(false);
  const [resultSnapshot, setResultSnapshot] = useState<GuaciReading | null>(null);
  const [interpretText, setInterpretText] = useState('');
  const [interpretLoading, setInterpretLoading] = useState(false);
  const [interpretError, setInterpretError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const poolRef = useRef(pool);
  poolRef.current = pool;
  const committedRef = useRef(false);
  const interpretStartedRef = useRef(false);

  // Check auth + sync pool from Supabase for logged-in users
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setIsLoggedIn(true);
        // Load pool from server
        getGuaciPool().then((serverPool) => {
          if (serverPool) {
            setPool(serverPool);
            poolRef.current = serverPool;
          }
        });
      }
    });
  }, []);

  const stripActive = inputMode === 'mouse' || deckSpread;

  const goDraw = () => {
    setSlots([null, null, null]);
    setResultSnapshot(null);
    setInterpretText('');
    setInterpretError(null);
    interpretStartedRef.current = false;
    setDeckSpread(false);
    setDeckShuffle((s) => s + 1);
    setStep('draw');
    committedRef.current = false;
  };

  const onCameraFailed = useCallback(() => {
    setInputMode('mouse');
  }, []);

  const onPickCard = useCallback((hexId: number) => {
    setSlots((prev) => {
      const i = prev.findIndex((x) => x === null);
      if (i < 0) return prev;
      if (prev.some((x) => x === hexId)) return prev;
      const next: Slots = [prev[0], prev[1], prev[2]];
      next[i] = hexId;
      return next;
    });
  }, []);

  useEffect(() => {
    const [a, b, c] = slots;
    if (a == null || b == null || c == null) {
      committedRef.current = false;
      return;
    }
    if (committedRef.current) return;
    committedRef.current = true;

    const r = readingFromSlots(question.trim() || '（未书）', a, b, c);
    setResultSnapshot(r);

    const ben = getHexagramById(a);
    const hu = getHexagramById(b);
    const bian = getHexagramById(c);
    const entry: GuaciHistoryEntry = {
      ...r,
      at: new Date().toISOString(),
      benName: ben.name,
      huName: hu.name,
      bianName: bian.name,
    };

    let nextPool = poolRef.current;
    for (const id of [a, b, c]) {
      nextPool = removeBenFromPool(nextPool, id);
    }
    poolRef.current = nextPool;
    setPool(nextPool);
    // Save pool: to server if logged in, otherwise localStorage
    if (isLoggedIn) {
      saveGuaciPool(nextPool).catch(console.error);
    } else {
      savePool(nextPool);
    }

    setHistory((prev) => {
      const hist = [entry, ...prev];
      saveHistory(hist);
      return hist;
    });

    setStep('drawComplete');
  }, [slots, question]);

  useEffect(() => {
    if (step !== 'ritualLoading') return;
    const id = window.setTimeout(() => setStep('interpret'), 4600);
    return () => clearTimeout(id);
  }, [step]);

  useEffect(() => {
    if (step !== 'interpret' || !resultSnapshot || interpretStartedRef.current) return;
    interpretStartedRef.current = true;
    const payload = buildPayloadText(resultSnapshot);
    const q = question.trim() || '（未书）';

    setInterpretLoading(true);
    setInterpretText('');
    setInterpretError(null);

    getGuaciInterpretation(q, payload, (chunk) => {
      setInterpretText((prev) => prev + chunk);
    }, !isLoggedIn)
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : '解读暂不可用';
        setInterpretError(msg);
        setInterpretText(
          `（灵音暂无法调用云端解读。以下为卦象原文摘要，可自行参详。）\n\n${payload.slice(0, 2000)}`,
        );
      })
      .finally(() => setInterpretLoading(false));
  }, [step, resultSnapshot, question, isLoggedIn]);

  const changingSet = resultSnapshot
    ? new Set<number>(resultSnapshot.changingLines)
    : new Set<number>();

  return (
    <div className="relative z-10 flex min-h-[100dvh] flex-col bg-transparent text-zinc-100">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-4 md:px-8">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 rounded-lg px-2 py-2 font-sans text-[12px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          返回
        </button>
        <span className="flex items-center gap-2 font-serif text-[11px] uppercase tracking-[0.25em] text-zinc-500">
          <ScrollText className="size-4" />
          问卦
        </span>
        <div className="w-16" />
      </header>

      <AnimatePresence mode="wait">
        {step === 'question' && (
          <motion.main
            key="q"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-24"
          >
            <p className="mb-6 text-center font-serif text-[15px] leading-relaxed text-zinc-200">
              请在心里想着一个问题
            </p>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="可选：将意念化为只言片语…"
              rows={4}
              className="mb-6 select-text rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 font-sans text-[14px] text-zinc-100 outline-none ring-0 placeholder:text-zinc-600 focus:border-white/25"
            />
            <button
              type="button"
              onClick={goDraw}
              className="rounded-2xl border border-amber-500/35 bg-amber-500/15 py-3.5 font-sans text-[14px] font-medium text-amber-100 transition-colors hover:bg-amber-500/25"
            >
              问卦
            </button>
          </motion.main>
        )}

        {(step === 'draw' || step === 'drawComplete') && (
          <motion.div
            key="draw"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex min-h-0 flex-1 flex-col px-3 pb-6 md:px-6"
          >
            <div className="relative flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-black/20 md:min-h-[560px]">
              <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
                <span className="font-sans text-[10px] uppercase tracking-wider text-zinc-500">
                  操作
                </span>
                <button
                  type="button"
                  onClick={() => setInputMode('hands')}
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-sans text-[11px] transition-colors',
                    inputMode === 'hands'
                      ? 'bg-white/15 text-white'
                      : 'text-zinc-500 hover:bg-white/10',
                  )}
                >
                  <Camera className="size-3.5" />
                  手势
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('mouse')}
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-sans text-[11px] transition-colors',
                    inputMode === 'mouse'
                      ? 'bg-white/15 text-white'
                      : 'text-zinc-500 hover:bg-white/10',
                  )}
                >
                  <MousePointer2 className="size-3.5" />
                  鼠标
                </button>
                <span className="ml-auto font-mono text-[10px] text-zinc-600">
                  {inputMode === 'hands'
                    ? !stripActive
                      ? `手势 ${hud.g} · 张掌展开牌带`
                      : `手势 ${hud.g} · 左右扫移牌带 / 握拳选牌 · 定点2秒选牌`
                    : '拖拽移带 · 点击选牌 · 定点2秒选牌'}
                </span>
              </div>

              <div className="flex shrink-0 justify-center gap-3 border-b border-white/8 px-3 py-3">
                <SlotLabel label="本卦" id={slots[0]} />
                <SlotLabel label="互卦" id={slots[1]} />
                <SlotLabel label="变卦" id={slots[2]} />
              </div>

              <div className="relative min-h-0 flex-1">
                <GuaciThreeScene
                  key={deckShuffle}
                  deckShuffle={deckShuffle}
                  stripActive={stripActive}
                  slots={slots}
                  inputMode={inputMode}
                  onCameraFailed={onCameraFailed}
                  onRequestSpread={() => setDeckSpread(true)}
                  onPickCard={onPickCard}
                  onGestureHud={(g, allow) => setHud({ g, allow })}
                />
                {step === 'drawComplete' && (
                  <div className="pointer-events-auto absolute inset-0 z-30 flex flex-col items-center justify-end bg-gradient-to-t from-black/92 via-black/55 to-black/10 pb-8 pt-20 md:pb-12">
                    <p className="mb-5 max-w-xs text-center font-serif text-[13px] leading-relaxed tracking-[0.18em] text-amber-100/85">
                      心中默念问题三遍
                    </p>
                    <button
                      type="button"
                      onClick={() => setStep('ritualLoading')}
                      className="rounded-2xl border border-amber-400/45 bg-gradient-to-b from-amber-500/25 to-amber-950/40 px-10 py-3.5 font-serif text-[15px] tracking-[0.35em] text-amber-50 shadow-[0_0_28px_rgba(212,175,55,0.25)] transition-all hover:border-amber-300/55 hover:shadow-[0_0_40px_rgba(212,175,55,0.35)] active:scale-[0.98]"
                    >
                      开始问卦
                    </button>
                  </div>
                )}
              </div>

              <p className="px-3 py-2 font-sans text-[10px] leading-relaxed text-zinc-500">
                起手为牌堆，画面下方有提示；<strong className="text-zinc-400">张开手掌</strong>
                后牌堆会<strong className="text-zinc-400">动画展开</strong>
                为横向牌带。展开后<strong className="text-zinc-400">张掌左右扫</strong>
                可慢移牌带，<strong className="text-zinc-400">握拳</strong>
                或<strong className="text-zinc-400">光标停留约 2 秒</strong>
                在光标处选牌。鼠标模式自动展带，拖拽移带、点击选牌。
              </p>
            </div>
          </motion.div>
        )}

        {step === 'interpret' && resultSnapshot && (
          <motion.div
            key="interpret"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-6 md:px-8"
          >
            <div>
              <h2 className="mb-2 font-serif text-[13px] text-amber-200/85">所问</h2>
              <p className="font-sans text-[14px] leading-relaxed text-zinc-200">
                {question.trim() || '（未书）'}
              </p>
            </div>

            <div>
              <h2 className="mb-3 font-serif text-[13px] text-amber-200/85">灵音解读</h2>
              {interpretLoading && !interpretText && (
                <p className="font-sans text-[12px] text-zinc-500">正在结合卦象与问题推演…</p>
              )}
              {interpretError && (
                <p className="mb-2 font-sans text-[11px] text-amber-200/70">{interpretError}</p>
              )}
              <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-5 font-sans text-[13px] leading-relaxed text-zinc-200 whitespace-pre-wrap">
                {interpretText || (interpretLoading ? '…' : '')}
              </div>
            </div>

            <div className="space-y-3 pb-12">
              <h2 className="font-serif text-[13px] text-amber-200/85">卦爻原文</h2>
              <ReadingBlock
                title="本卦"
                id={resultSnapshot.benId}
                changingSet={changingSet}
                isBen
              />
              <ReadingBlock
                title="互卦"
                id={resultSnapshot.huId}
                changingSet={new Set<number>()}
                isBen={false}
              />
              <ReadingBlock
                title="变卦"
                id={resultSnapshot.bianId}
                changingSet={new Set<number>()}
                isBen={false}
              />
            </div>

            <button
              type="button"
              onClick={() => {
                committedRef.current = false;
                interpretStartedRef.current = false;
                setResultSnapshot(null);
                setInterpretText('');
                setInterpretError(null);
                setStep('question');
              }}
              className="mb-10 rounded-2xl border border-white/18 bg-white/[0.08] py-3 font-sans text-[13px] text-zinc-200 transition-colors hover:bg-white/14"
            >
              再问一卦
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {step === 'ritualLoading' && (
          <motion.div
            key="ritual"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55 }}
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden bg-[#030208]"
          >
            <div
              className="absolute inset-0 opacity-45"
              style={{
                background:
                  'radial-gradient(ellipse 85% 55% at 50% 38%, rgba(90, 70, 120, 0.22) 0%, transparent 58%), radial-gradient(ellipse 100% 70% at 50% 100%, rgba(45, 32, 18, 0.42) 0%, transparent 48%)',
              }}
            />
            <motion.div
              className="absolute inset-[-45%] opacity-[0.09]"
              style={{
                background:
                  'conic-gradient(from 210deg at 50% 50%, transparent 0deg, rgba(212, 175, 55, 0.35) 55deg, transparent 110deg, transparent 200deg, rgba(140, 120, 200, 0.25) 260deg, transparent 320deg)',
              }}
              animate={{ rotate: -360 }}
              transition={{ duration: 48, repeat: Infinity, ease: 'linear' }}
            />
            <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%220.1%22/%3E%3C/svg%3E')] opacity-25 mix-blend-overlay" />

            <RitualOrbitLoader />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
