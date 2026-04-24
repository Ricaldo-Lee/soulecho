import {
  CanvasTexture,
  LinearFilter,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';

const loader = new TextureLoader();
loader.setCrossOrigin('anonymous');

function placeholderTexture(id: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 768;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1a1814';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(212,196,168,0.35)';
  g.lineWidth = 3;
  g.strokeRect(24, 24, c.width - 48, c.height - 48);
  g.fillStyle = 'rgba(245,240,230,0.9)';
  g.font = 'bold 120px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(id), c.width / 2, c.height / 2 - 40);
  g.font = '24px sans-serif';
  g.fillStyle = 'rgba(200,190,175,0.55)';
  g.fillText('卦象贴图未加载', c.width / 2, c.height / 2 + 60);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

/** 牌背图（易经卡面）；可换为 env 覆盖 */
export const GUACI_CARD_BACK_URL =
  (import.meta.env.VITE_GUACI_CARD_BACK_URL as string | undefined) ||
  'https://i.postimg.cc/gJjxGPLn/yi-jing-ka-pian-removebg-preview.png';

function backTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 768;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, c.width, c.height);
  grd.addColorStop(0, '#0c0a08');
  grd.addColorStop(0.5, '#15120f');
  grd.addColorStop(1, '#0a0908');
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    g.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`;
    g.fillRect(x, y, 1, 1);
  }
  g.strokeStyle = 'rgba(180,160,130,0.22)';
  g.lineWidth = 2;
  for (let n = 0; n < 12; n++) {
    const y = 80 + n * 52;
    g.beginPath();
    g.moveTo(60, y);
    g.lineTo(c.width - 60, y);
    g.stroke();
  }
  g.font = '18px serif';
  g.fillStyle = 'rgba(200,185,160,0.25)';
  g.textAlign = 'center';
  g.fillText('易 · 灵音', c.width / 2, c.height - 48);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

let cachedBack: CanvasTexture | null = null;

export function getBackTexture(): CanvasTexture {
  if (!cachedBack) cachedBack = backTexture();
  return cachedBack;
}

let cachedUrlBack: Texture | null = null;
let urlBackPromise: Promise<Texture> | null = null;

/** 异步加载高清牌背；失败时回退为程序生成的牌背 */
export function loadCardBackTexture(): Promise<Texture> {
  if (cachedUrlBack) return Promise.resolve(cachedUrlBack);
  if (urlBackPromise) return urlBackPromise;
  urlBackPromise = new Promise((resolve) => {
    loader.load(
      GUACI_CARD_BACK_URL,
      (tex) => {
        tex.colorSpace = SRGBColorSpace;
        tex.minFilter = LinearFilter;
        tex.magFilter = LinearFilter;
        tex.generateMipmaps = true;
        cachedUrlBack = tex;
        resolve(tex);
      },
      undefined,
      () => {
        const fb = getBackTexture();
        cachedUrlBack = fb;
        resolve(fb);
      },
    );
  });
  return urlBackPromise;
}

/**
 * 正面：VITE_GUACI_CARD_URL 支持 `{id}` 占位；或 VITE_GUACI_CARD_BASE + `/64/{id}.png`。
 * 本地可放 public/guaci/1.png … 并设 VITE_GUACI_CARD_URL=/guaci/{id}.png
 */
export function resolveFrontUrl(hexId: number): string {
  const tpl =
    import.meta.env.VITE_GUACI_CARD_URL as string | undefined;
  if (tpl) return tpl.replace(/\{id\}/g, String(hexId));
  const base = (import.meta.env.VITE_GUACI_CARD_BASE as string | undefined) || '';
  if (base) return `${base.replace(/\/$/, '')}/${hexId}.png`;
  return `/guaci/${hexId}.png`;
}

export function loadFrontTexture(hexId: number, onDone: (t: Texture) => void) {
  const url = resolveFrontUrl(hexId);
  loader.load(
    url,
    (tex) => {
      tex.colorSpace = SRGBColorSpace;
      tex.minFilter = LinearFilter;
      tex.magFilter = LinearFilter;
      onDone(tex);
    },
    undefined,
    () => {
      onDone(placeholderTexture(hexId));
    },
  );
}
