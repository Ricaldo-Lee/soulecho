import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

const HERO_VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260217_030345_246c0224-10a4-422c-b324-070b7c0eceda.mp4';

interface LandingPageProps {
  onEnter: () => void;
}

function LiquidGlassButton({
  children,
  onClick,
  variant,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant: 'frost-dark' | 'frost-light';
  className?: string;
}) {
  const light = variant === 'frost-light';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative isolate overflow-hidden rounded-full px-[29px] py-[11px] text-center font-sans text-[14px] font-medium',
        'border backdrop-blur-2xl backdrop-saturate-150',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_4px_24px_rgba(0,0,0,0.14)]',
        'transition-[transform,background-color,border-color,box-shadow,filter] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'hover:scale-[1.03] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_12px_40px_rgba(255,255,255,0.12)] hover:brightness-110',
        'active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
        light
          ? 'border-white/40 bg-white/[0.22] text-zinc-900 hover:border-white/70 hover:bg-white/[0.42] hover:text-zinc-950'
          : 'border-white/22 bg-white/[0.08] text-white hover:border-white/45 hover:bg-white/[0.2] hover:text-white',
        className,
      )}
    >
      <span
        className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/75 to-transparent opacity-90"
        aria-hidden
      />
      <span className="relative">{children}</span>
    </button>
  );
}

function LiquidGlassBadge({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'relative isolate inline-flex items-center gap-2 overflow-hidden rounded-[20px] px-3 py-1.5 font-sans',
        'border border-white/25 bg-white/[0.08] backdrop-blur-xl backdrop-saturate-150',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]',
      )}
    >
      <span
        className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-80"
        aria-hidden
      />
      <span className="relative flex items-center gap-2">{children}</span>
    </div>
  );
}

function NavLink({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="group flex items-center gap-[14px] rounded-lg px-2 py-1.5 font-sans text-[14px] font-medium text-white/88 transition-[color,background-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.02] hover:bg-white/14 hover:text-white hover:shadow-[0_0_24px_rgba(255,255,255,0.14)]"
    >
      <span>{label}</span>
      <ChevronDown
        className="size-[14px] shrink-0 text-white/80 transition-colors group-hover:text-white"
        strokeWidth={1.75}
      />
    </button>
  );
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnter }) => {
  return (
    <div className="fixed inset-0 overflow-hidden bg-zinc-950 font-sans">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={HERO_VIDEO_SRC}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
      <div className="absolute inset-0 bg-black/50" aria-hidden />

      <div className="relative z-10 flex min-h-[100dvh] flex-col">
        <header className="flex w-full shrink-0 items-center justify-between px-6 py-[20px] md:px-[120px]">
          <div className="flex min-w-0 items-center gap-[30px]">
            <div
              className="flex h-[25px] w-[187px] shrink-0 items-center font-sans text-[13px] font-medium tracking-[0.12em] text-white md:text-[14px]"
              aria-label="SOULECHO 灵音"
            >
              <span className="truncate">SOULECHO / 灵音</span>
            </div>
            <nav className="hidden items-center gap-[30px] md:flex" aria-label="主导航">
              <NavLink label="序章" />
              <NavLink label="探索" />
              <NavLink label="特性" />
              <NavLink label="资源" />
            </nav>
          </div>
          <LiquidGlassButton variant="frost-dark" onClick={onEnter}>
            手机号登录
          </LiquidGlassButton>
        </header>

        <main className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
          <div
            className="pointer-events-none absolute inset-y-10 right-6 hidden w-px bg-gradient-to-b from-transparent via-white/12 to-transparent md:right-[min(8vw,6rem)] md:block lg:right-[12vw]"
            aria-hidden
          />
          <div className="flex w-full max-w-[min(44rem,92vw)] flex-col items-center px-6 pb-[96px] pt-16 text-center md:pb-28 md:pt-0">
            <LiquidGlassBadge>
              <span className="size-[4px] shrink-0 rounded-full bg-white" />
              <span className="text-[12px] font-medium tracking-[0.2em] text-white/65">
                PROLOGUE · 序章
              </span>
            </LiquidGlassBadge>

            <div className="mt-10 w-full max-w-[34rem] md:mt-12">
              <h1
                className="mx-auto max-w-[613px] font-serif text-[36px] font-medium leading-[1.28] tracking-wide md:text-[56px]"
                style={{
                  background:
                    'linear-gradient(144.5deg, #ffffff 28%, rgba(0, 0, 0, 0) 115%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                在这嘈杂的世界
                <br />
                静候灵魂的回音
              </h1>
              <p className="mx-auto mt-8 max-w-[36rem] font-serif text-[15px] font-normal leading-[1.75] text-white/68 md:mt-9 md:max-w-[38rem] md:text-[15px]">
                以生辰为经纬，借星象作注脚。无哗众之词，只保留可被凝视的秩序。
              </p>
            </div>

            <div className="mt-12 md:mt-14">
              <LiquidGlassButton variant="frost-light" onClick={onEnter}>
                开始探索
              </LiquidGlassButton>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
