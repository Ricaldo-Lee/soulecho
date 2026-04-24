import React, { useMemo, useState } from 'react';
import {
  type BirthProfileInput,
  branchElementClass,
  buildBaziArchiveModel,
  stemElementClass,
} from '../lib/baziArchive';
import { cn } from '../lib/utils';
import { MapPin, Calendar } from 'lucide-react';

type Props = {
  profile: BirthProfileInput | null;
  userLabel: string;
  birthPlace?: string;
};

export const BaziArchivePanel: React.FC<Props> = ({ profile, userLabel, birthPlace }) => {
  const [sex, setSex] = useState<0 | 1>(1);
  const model = useMemo(() => buildBaziArchiveModel(profile, sex), [profile, sex]);

  if (!profile?.birthDate) {
    return (
      <div className="rounded-2xl border border-white/15 bg-white/[0.08] p-6 text-center backdrop-blur-xl">
        <p className="font-sans text-[13px] leading-relaxed text-zinc-400">
          暂无生辰档案。请先完成出生信息录入后再查看命盘。
        </p>
      </div>
    );
  }

  if (!model) return null;

  return (
    <div className="flex max-h-[78dvh] flex-col gap-4 overflow-hidden md:max-h-[640px]">
      <div className="shrink-0 rounded-2xl border border-white/18 bg-white/[0.12] p-4 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-sans text-[17px] font-medium text-white">{userLabel}</span>
            <span className="rounded-full border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 font-sans text-[11px] text-amber-100/90">
              {model.sexLabel}
            </span>
          </div>
          <div className="flex rounded-full border border-white/12 bg-zinc-950/30 p-0.5">
            <button
              type="button"
              onClick={() => setSex(1)}
              className={cn(
                'rounded-full px-3 py-1 font-sans text-[11px] transition-colors',
                sex === 1 ? 'bg-white/15 text-white' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              乾造
            </button>
            <button
              type="button"
              onClick={() => setSex(0)}
              className={cn(
                'rounded-full px-3 py-1 font-sans text-[11px] transition-colors',
                sex === 0 ? 'bg-white/15 text-white' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              坤造
            </button>
          </div>
        </div>
        <div className="mt-3 space-y-2 font-sans text-[12px] leading-relaxed text-zinc-300">
          <div className="flex flex-wrap items-start gap-2">
            <Calendar className="mt-0.5 size-3.5 shrink-0 text-zinc-500" />
            <span>
              <span className="text-zinc-500">阳历</span> {model.solarLabel}
              <span className="ml-2 text-zinc-500">（{model.age} 岁）</span>
            </span>
          </div>
          <div className="flex flex-wrap items-start gap-2 pl-0">
            <span className="ml-5 text-zinc-400">阴历 {model.lunarLabel}</span>
          </div>
          {birthPlace ? (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-zinc-500" />
              <span className="text-zinc-400">{birthPlace}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto rounded-2xl border border-white/18 bg-white/[0.08] backdrop-blur-xl">
        <table className="w-full min-w-[720px] border-collapse text-left font-sans text-[11px]">
          <thead>
            <tr className="border-b border-white/10">
              {model.columns.map((c) => (
                <th
                  key={c.key}
                  className="px-2 py-2.5 text-center font-medium tracking-wide text-zinc-300"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-zinc-400">
            <tr className="border-b border-white/[0.06]">
              {model.columns.map((c) => (
                <td key={`m-${c.key}`} className="px-2 py-2 text-center text-[10px] text-amber-200/85">
                  {c.mainStar}
                </td>
              ))}
            </tr>
            <tr className="border-b border-white/[0.06]">
              {model.columns.map((c) => (
                <td key={`s-${c.key}`} className="px-2 py-2 text-center">
                  <span className={cn('text-xl font-semibold md:text-2xl', stemElementClass(c.stem))}>
                    {c.stem}
                  </span>
                </td>
              ))}
            </tr>
            <tr className="border-b border-white/[0.06]">
              {model.columns.map((c) => (
                <td key={`b-${c.key}`} className="px-2 py-2 text-center">
                  <span className={cn('text-xl font-semibold md:text-2xl', branchElementClass(c.branch))}>
                    {c.branch}
                  </span>
                </td>
              ))}
            </tr>
            <tr className="border-b border-white/[0.06] align-top">
              {model.columns.map((c) => (
                <td key={`h-${c.key}`} className="px-2 py-2 text-center text-[10px] leading-snug">
                  {c.hiddenStemLabels.length === 0 ? (
                    <span className="text-zinc-600">—</span>
                  ) : (
                    <div className="flex flex-col items-center gap-0.5">
                      {c.hiddenStemLabels.map((hs, i) => (
                        <span key={i} className={cn(stemElementClass(hs))}>
                          {hs}
                          {c.hiddenGodLabels[i] ? (
                            <span className="text-zinc-500">·{c.hiddenGodLabels[i]}</span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
              ))}
            </tr>
            <tr className="border-b border-white/[0.06]">
              {model.columns.map((c) => (
                <td key={`n-${c.key}`} className="px-2 py-2 text-center text-[10px] text-zinc-400">
                  {c.naYin}
                </td>
              ))}
            </tr>
            <tr className="border-b border-white/[0.06]">
              {model.columns.map((c) => (
                <td key={`k-${c.key}`} className="px-2 py-2 text-center text-[10px]">
                  {c.luckStage}
                </td>
              ))}
            </tr>
            <tr className="border-b border-white/[0.06]">
              {model.columns.map((c) => (
                <td key={`v-${c.key}`} className="px-2 py-2 text-center text-[10px] text-zinc-500">
                  {c.voidBranches}
                </td>
              ))}
            </tr>
            <tr>
              {model.columns.map((c) => (
                <td key={`g-${c.key}`} className="px-2 py-2 text-center text-[9px] leading-snug text-amber-200/70">
                  {c.gods || '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="shrink-0 rounded-xl border border-white/12 bg-white/[0.06] p-3 backdrop-blur-md">
        <p className="font-sans text-[10px] font-medium tracking-wide text-zinc-500">{model.luckMeta}</p>
        <p className="mt-2 font-serif text-[12px] leading-relaxed text-zinc-300">{model.fortuneHint}</p>
      </div>
    </div>
  );
};
