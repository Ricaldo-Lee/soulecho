import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { saveProfile } from '../services/api';
import { cn } from '../lib/utils';

interface BirthSetupProps {
  userId: string | null;
  onComplete: (data: BirthData) => void;
}

export interface BirthData {
  birthDate: string;
  birthTime: string;
  birthPlace: string;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

const YEARS = Array.from({ length: 2026 - 1935 }, (_, i) => 2025 - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

const labelClass = 'mb-2 block font-sans text-[11px] font-medium tracking-[0.18em] text-zinc-500';

const triggerClass = cn(
  'flex w-full items-center justify-between gap-3 rounded-xl border border-white/14 bg-white/[0.08] px-4 py-3.5 font-sans text-[14px] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] outline-none backdrop-blur-xl backdrop-saturate-150 transition-colors',
  'hover:border-white/22 hover:bg-white/[0.1] focus-visible:border-white/28 focus-visible:ring-2 focus-visible:ring-white/15',
);

const panelClass = cn(
  'absolute left-0 right-0 z-50 mt-2 max-h-52 overflow-y-auto rounded-xl border border-white/18 bg-zinc-950/72 py-1.5 shadow-[0_24px_48px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-2xl backdrop-saturate-150',
);

function GlassSelect<T extends string | number>({
  label,
  value,
  options,
  formatOption,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  formatOption: (v: T) => string;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <span className={labelClass}>{label}</span>
      <button
        type="button"
        className={triggerClass}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="min-w-0 truncate text-left">{formatOption(value)}</span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-zinc-500 transition-transform', open && 'rotate-180')}
          strokeWidth={1.75}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={panelClass}
          >
            {options.map((opt) => (
              <li key={String(opt)}>
                <button
                  type="button"
                  role="option"
                  aria-selected={opt === value}
                  className={cn(
                    'flex w-full px-4 py-2.5 text-left font-sans text-[13px] transition-colors',
                    opt === value
                      ? 'bg-white/[0.12] text-amber-100/95'
                      : 'text-zinc-300 hover:bg-white/[0.08] hover:text-white',
                  )}
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                >
                  {formatOption(opt)}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export const BirthSetup: React.FC<BirthSetupProps> = ({ userId, onComplete }) => {
  const [tab, setTab] = useState(0);
  const [year, setYear] = useState(1996);
  const [month, setMonth] = useState(6);
  const [day, setDay] = useState(15);
  const [hour, setHour] = useState(10);
  const [minute, setMinute] = useState(0);
  const [birthPlace, setBirthPlace] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const maxDay = useMemo(() => daysInMonth(year, month), [year, month]);

  useEffect(() => {
    if (day > maxDay) setDay(maxDay);
  }, [maxDay, day]);

  const birthDate = useMemo(() => {
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  }, [year, month, day]);

  const birthTime = useMemo(() => {
    const h = String(hour).padStart(2, '0');
    const mi = String(minute).padStart(2, '0');
    return `${h}:${mi}`;
  }, [hour, minute]);

  const data: BirthData = useMemo(
    () => ({ birthDate, birthTime, birthPlace: birthPlace.trim() }),
    [birthDate, birthTime, birthPlace],
  );

  const tabs = [
    { title: '公历', hint: '年月日，精确到日' },
    { title: '时辰', hint: '时刻决定起运的细部' },
    { title: '出生地', hint: '地域校正真太阳时' },
  ] as const;

  const canAdvance = tab === 0 ? true : tab === 1 ? true : birthPlace.trim().length >= 2;

  const handleFinish = async () => {
    if (!canAdvance) return;
    if (userId) {
      setSaving(true);
      setSaveError('');
      try {
        try {
          await saveProfile(data);
        } catch (firstErr) {
          const msg = firstErr instanceof Error ? firstErr.message : '';
          // 验证码登录后极短时间内 token 可能尚未可用，做一次短延迟重试
          if (msg.includes('未授权') || msg.includes('401')) {
            await sleep(250);
            await saveProfile(data);
          } else {
            throw firstErr;
          }
        }
      } catch (err) {
        console.error('Failed to save birth profile:', err);
        const msg = err instanceof Error ? err.message : '保存失败，请检查网络或重新登录后再试。';
        setSaveError(msg || '保存失败，请检查网络或重新登录后再试。');
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    onComplete(data);
  };

  const goNext = async () => {
    if (tab < 2) setTab((t) => t + 1);
    else await handleFinish();
  };

  const dayOptions = useMemo(
    () => Array.from({ length: maxDay }, (_, i) => i + 1),
    [maxDay],
  );

  return (
    <div className="relative z-10 flex min-h-[100dvh] items-center justify-center p-6 font-sans text-zinc-200">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <div className="mb-10 text-center md:text-left">
          <p className="font-serif text-[13px] font-medium tracking-[0.28em] text-white/55">
            校准命盘
          </p>
          <h2 className="mt-3 font-serif text-[22px] font-medium leading-snug tracking-wide text-white md:text-[24px]">
            请安放你的出生坐标
          </h2>
          <p className="mt-3 max-w-md font-sans text-[13px] leading-relaxed text-zinc-500">
            分三步完成。可随时点选上方步骤回看；信息仅用于排盘与解读。
          </p>
        </div>

        <div
          className={cn(
            'rounded-[1.35rem] border border-white/12 bg-white/[0.05] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl backdrop-saturate-150 md:p-8',
          )}
        >
          <div className="mb-8 flex gap-1 rounded-full bg-zinc-950/50 p-1">
            {tabs.map((t, i) => (
              <button
                key={t.title}
                type="button"
                onClick={() => setTab(i)}
                className={cn(
                  'flex-1 rounded-full px-3 py-2.5 text-center font-sans text-[12px] font-medium tracking-wide transition-all',
                  i === tab
                    ? 'bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                    : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {t.title}
              </button>
            ))}
          </div>

          <p className="mb-6 font-sans text-[12px] text-zinc-500">{tabs[tab].hint}</p>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-5"
            >
              {tab === 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <GlassSelect
                    label="年"
                    value={year}
                    options={YEARS}
                    formatOption={(y) => `${y}`}
                    onChange={setYear}
                  />
                  <GlassSelect
                    label="月"
                    value={month}
                    options={MONTHS}
                    formatOption={(m) => `${m} 月`}
                    onChange={setMonth}
                  />
                  <GlassSelect
                    label="日"
                    value={day}
                    options={dayOptions}
                    formatOption={(d) => `${d} 日`}
                    onChange={setDay}
                  />
                </div>
              )}

              {tab === 1 && (
                <div className="grid grid-cols-2 gap-4">
                  <GlassSelect
                    label="时"
                    value={hour}
                    options={HOURS}
                    formatOption={(h) => `${String(h).padStart(2, '0')} 时`}
                    onChange={setHour}
                  />
                  <GlassSelect
                    label="分"
                    value={minute}
                    options={MINUTES}
                    formatOption={(m) => `${String(m).padStart(2, '0')} 分`}
                    onChange={setMinute}
                  />
                  <p className="col-span-2 font-sans text-[12px] leading-relaxed text-zinc-600">
                    若不确定具体分钟，可保留整点或最接近的刻度；后续可在命盘中微调。
                  </p>
                </div>
              )}

              {tab === 2 && (
                <div>
                  <label className={labelClass} htmlFor="birth-place">
                    城市或地区
                  </label>
                  <input
                    id="birth-place"
                    type="text"
                    value={birthPlace}
                    onChange={(e) => setBirthPlace(e.target.value)}
                    placeholder="例：浙江杭州 · 上城区"
                    className={cn(
                      triggerClass,
                      'cursor-text placeholder:text-zinc-700',
                    )}
                    autoComplete="address-level2"
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex items-center justify-between gap-4 border-t border-white/10 pt-6">
            <div className="min-w-0 font-mono text-[10px] leading-relaxed tracking-wider text-zinc-600">
              <div className="truncate">{birthDate}</div>
              <div className="truncate">{birthTime}</div>
              {saveError && <div className="mt-2 max-w-[220px] text-[10px] text-red-300/85">{saveError}</div>}
            </div>
            <button
              type="button"
              onClick={() => void goNext()}
              disabled={!canAdvance || saving}
              className={cn(
                'shrink-0 rounded-full border border-white/25 bg-white/[0.1] px-7 py-3 font-sans text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md transition-all',
                'hover:border-white/35 hover:bg-white/[0.14]',
                'active:scale-[0.98]',
                'disabled:cursor-not-allowed disabled:opacity-35',
              )}
            >
              {saving ? '保存中…' : tab === 2 ? '完成并进入' : '下一步'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
