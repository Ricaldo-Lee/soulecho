import React, { useRef, useEffect } from 'react';

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  color: string;
}

export const ParticleEntity: React.FC<{ active?: boolean; variant?: 'entity' | 'background' }> = ({ active, variant = 'entity' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const animationFrameId = useRef<number>(null);

  const createParticles = (width: number, height: number) => {
    const count = variant === 'background' ? 60 : 100;
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        x: variant === 'background' ? Math.random() * width : width / 2 + (Math.random() - 0.5) * 50,
        y: variant === 'background' ? Math.random() * height : height / 2 + (Math.random() - 0.5) * 50,
        size: variant === 'background' ? Math.random() * 1.5 + 0.5 : Math.random() * 2 + 1,
        speedX: (Math.random() - 0.5) * (variant === 'background' ? 0.2 : 0.5),
        speedY: (Math.random() - 0.5) * (variant === 'background' ? 0.2 : 0.5),
        opacity: Math.random() * 0.3 + 0.1,
        color: `hsla(${248 + Math.random() * 42}, 42%, ${58 + Math.random() * 12}%, 1)`
      });
    }
    particles.current = newParticles;
  };

  const animate = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);

    particles.current.forEach((p, i) => {
      p.x += p.speedX * (active ? 3 : 1);
      p.y += p.speedY * (active ? 3 : 1);

      if (variant === 'entity') {
        const dx = width / 2 - p.x;
        const dy = height / 2 - p.y;
        p.speedX += dx * 0.0001;
        p.speedY += dy * 0.0001;
      } else {
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.opacity;
      ctx.fill();
    });

    animationFrameId.current = requestAnimationFrame(() => animate(ctx, width, height));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
      createParticles(canvas.width, canvas.height);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    animate(ctx, canvas.width, canvas.height);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [active, variant]);

  return (
    <div className={`relative w-full h-full flex items-center justify-center pointer-events-none ${variant === 'background' ? 'absolute inset-0 z-0' : ''}`}>
       {variant === 'entity' && (
         <>
          <div className={`absolute w-36 h-36 rounded-full bg-violet-600/[0.07] blur-[88px] transition-transform duration-1000 ${active ? 'scale-[1.45]' : 'scale-100'}`} />
          <div className={`absolute w-24 h-24 rounded-full border border-violet-200/[0.08] bg-zinc-950/20 backdrop-blur-sm shadow-[inset_0_0_20px_rgba(120,90,180,0.06)] flex items-center justify-center transition-all duration-700 ${active ? 'border-amber-200/18' : 'border-violet-200/[0.08]'}`}>
            <div className="w-12 h-12 rounded-full border border-white/[0.09] flex items-center justify-center">
                <div className={`w-2.5 h-2.5 rounded-full bg-gradient-to-br from-amber-100/90 to-violet-300/50 transition-all duration-300 ${active ? 'shadow-[0_0_22px_rgba(212,175,55,0.45)] scale-110' : 'shadow-[0_0_12px_rgba(180,160,255,0.25)]'}`} />
            </div>
          </div>
         </>
       )}
      <canvas ref={canvasRef} className="z-10" />
    </div>
  );
};
