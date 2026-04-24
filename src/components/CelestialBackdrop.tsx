import React from 'react';

/** Fixed star positions (%), delays (s), durations (s), sizes (px) — deterministic “field” */
const STAR_FIELD: { left: number; top: number; delay: number; duration: number; size: number }[] = [
  { left: 6, top: 11, delay: 0, duration: 2.8, size: 2 },
  { left: 14, top: 28, delay: 0.4, duration: 3.4, size: 1 },
  { left: 23, top: 8, delay: 0.9, duration: 2.5, size: 2 },
  { left: 31, top: 52, delay: 0.2, duration: 3.9, size: 1 },
  { left: 42, top: 18, delay: 1.1, duration: 2.2, size: 2 },
  { left: 51, top: 63, delay: 0.6, duration: 3.1, size: 1 },
  { left: 58, top: 9, delay: 1.4, duration: 2.6, size: 2 },
  { left: 67, top: 41, delay: 0.3, duration: 3.6, size: 1 },
  { left: 76, top: 22, delay: 0.8, duration: 2.9, size: 2 },
  { left: 84, top: 56, delay: 1.2, duration: 3.2, size: 1 },
  { left: 91, top: 14, delay: 0.5, duration: 2.4, size: 2 },
  { left: 11, top: 72, delay: 1.6, duration: 3.0, size: 1 },
  { left: 19, top: 88, delay: 0.7, duration: 2.7, size: 2 },
  { left: 37, top: 76, delay: 1.0, duration: 3.5, size: 1 },
  { left: 48, top: 91, delay: 0.15, duration: 2.3, size: 1 },
  { left: 62, top: 78, delay: 1.3, duration: 3.7, size: 2 },
  { left: 71, top: 94, delay: 0.45, duration: 2.1, size: 1 },
  { left: 88, top: 71, delay: 1.5, duration: 3.3, size: 1 },
  { left: 95, top: 38, delay: 0.25, duration: 2.85, size: 2 },
  { left: 4, top: 48, delay: 1.7, duration: 3.15, size: 1 },
  { left: 54, top: 33, delay: 0.55, duration: 2.55, size: 1 },
  { left: 29, top: 67, delay: 1.25, duration: 3.45, size: 2 },
];

type CelestialBackdropProps = {
  /** 对话页等场景可关闭流星，保留呼吸光与星点 */
  hideMeteors?: boolean;
};

/**
 * Post-landing atmosphere: stronger breathing glows, meteors TR → BL, twinkling star field.
 */
export function CelestialBackdrop({ hideMeteors = false }: CelestialBackdropProps) {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-zinc-950"
      aria-hidden
    >
      <div
        className="absolute -left-[28%] top-[-18%] h-[105vmin] w-[105vmin] rounded-full bg-[radial-gradient(circle_at_center,rgba(252,252,251,0.14),transparent_58%)] [animation:celestial-drift_20s_ease-in-out_infinite]"
      />
      <div
        className="absolute -right-[24%] bottom-[-28%] h-[118vmin] w-[118vmin] rounded-full bg-[radial-gradient(circle_at_center,rgba(236,236,240,0.12),transparent_56%)] [animation:celestial-drift-reverse_20s_ease-in-out_infinite]"
      />
      <div
        className="absolute left-1/2 top-[44%] h-[72vmin] w-[72vmin] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.075),transparent_56%)] [animation:celestial-drift-center_20s_ease-in-out_infinite_10s]"
      />

      {STAR_FIELD.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            animation: `star-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}

      {!hideMeteors && (
        <>
          <div className="absolute top-[6vh] right-[5vw] h-[1.5px] w-[min(52vw,520px)] rounded-full bg-gradient-to-l from-transparent via-white/85 to-white/30 [animation:meteor-glide-a_16s_linear_infinite]" />
          <div className="absolute top-[14vh] right-[8vw] h-[1.5px] w-[min(46vw,460px)] rounded-full bg-gradient-to-l from-transparent via-white/65 to-white/20 [animation:meteor-glide-b_16s_linear_infinite_5.3s]" />
          <div className="absolute top-[4vh] right-[16vw] h-px w-[min(40vw,400px)] rounded-full bg-gradient-to-l from-transparent via-white/55 to-transparent [animation:meteor-glide-c_16s_linear_infinite_10.6s]" />
        </>
      )}
    </div>
  );
}
