import React, { useEffect, useRef } from 'react';
import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Clock,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  LinearFilter,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Raycaster,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { HEXAGRAM_NAMES } from '../../data/kingWenHexagrams';
import { loadCardBackTexture } from './guaciTextures';

const HAND_VER = '0.4.1675469240';
const MP_HANDS_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${HAND_VER}`;

export type GestureHud =
  | 'NONE'
  | 'OPEN'
  | 'PINCH'
  | 'FIST'
  | 'POINT'
  | 'SWIPE_H';

type Props = {
  inputMode: 'hands' | 'mouse';
  deckShuffle: number;
  /** 为 false 时为牌堆；张掌展开后为 true，牌带无限循环 */
  stripActive: boolean;
  slots: [number | null, number | null, number | null];
  onCameraFailed?: () => void;
  onGestureHud?: (g: GestureHud, allow: boolean) => void;
  /** 手势模式下检测到稳定张掌，请父层将 stripActive 置 true */
  onRequestSpread?: () => void;
  onPickCard: (hexId: number) => void;
};

/** 再放大约 2 倍（相对上一版） */
const CARD_W = 3.52;
const CARD_H = 5.12;
const CARD_GAP = 0.56;
const SPACING = CARD_W + CARD_GAP;
const LOOP_LEN = 64 * SPACING;

/** 张掌左右扫 → 推动牌带（以掌心水平位移驱动，与光标一致） */
const HAND_STRIP_SWIPE_GAIN = 3.35;
/** 掌心映射到整页视口：跟手系数（越大越贴手） */
const HAND_VIEWPORT_FOLLOW = 0.94;
const H_SWIPE_DOMINANCE = 0.00205;
/** 主划动后短窗内：反向且位移小于此值视为「回手复位」，不推带（避免左右来回抖） */
const STRIP_REPOSITION_MAX_DX = 0.017;
const STRIP_RETURN_GUARD_MS = 280;
const STRIP_SIGNIFICANT_DX = 0.0042;
/** 光标停留在同一卦牌上达此时长则自动选中（秒） */
const DWELL_PICK_SEC = 2;

/** 提高射线命中：在光标附近多点采样 */
const PICK_NDC_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.03, 0],
  [-0.03, 0],
  [0, 0.02],
  [0.022, 0.014],
  [-0.022, 0.014],
];
const _pickNdc = new Vector2();

/** 槽位更靠画面上方（世界坐标 y 更高） */
const SLOT_POS = [
  new Vector3(-4.85, 4.65, -0.52),
  new Vector3(0, 4.65, -0.52),
  new Vector3(4.85, 4.65, -0.52),
];

const SLOT_CARD_SCALE = 0.84;
const SPREAD_MORPH_DURATION = 1.12;

type SpreadMorphState = {
  group: Group;
  from: Vector3;
  fromRot: { z: number; y: number };
  toX: number;
};

const TABLE_PLANE = new Plane(new Vector3(0, 1, 0), -0.05);
const _hit = new Vector3();

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledIds(seed: number): number[] {
  const a = Array.from({ length: 64 }, (_, i) => i + 1);
  const rnd = mulberry32(seed);
  for (let i = 63; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeLabelTexture(hexId: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 3072;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1c1914';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(200,180,140,0.35)';
  g.lineWidth = 32;
  g.strokeRect(96, 96, c.width - 192, c.height - 192);
  g.fillStyle = 'rgba(235,220,195,0.92)';
  g.font = 'bold 768px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(HEXAGRAM_NAMES[hexId - 1], c.width / 2, c.height / 2 - 192);
  g.font = '224px monospace';
  g.fillStyle = 'rgba(160,150,130,0.7)';
  g.fillText(`${hexId}`, c.width / 2, c.height / 2 + 576);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

/** 张掌：略放宽，便于触发 */
function classifyGesture(lm: { x: number; y: number }[]): GestureHud {
  const dist = (a: number, b: number) => {
    const dx = lm[a].x - lm[b].x;
    const dy = lm[a].y - lm[b].y;
    return Math.hypot(dx, dy);
  };
  if (dist(4, 8) < 0.058) return 'PINCH';
  const ext = (tip: number, pip: number) => lm[tip].y < lm[pip].y - 0.028;
  const idx = ext(8, 6);
  const mid = ext(12, 10);
  const ring = ext(16, 14);
  const pink = ext(20, 18);
  const extendedCount = [idx, mid, ring, pink].filter(Boolean).length;
  if (idx && !mid) return 'POINT';
  if (extendedCount >= 2) return 'OPEN';
  if (extendedCount <= 1) return 'FIST';
  return 'NONE';
}

function createDeckCard(hexId: number, backMap: Texture): Group {
  const g = new Group();
  g.userData.hexId = hexId;
  g.userData.deckCard = true;
  const geo = new PlaneGeometry(CARD_W, CARD_H);
  const backMat = new MeshStandardMaterial({
    map: backMap,
    roughness: 0.9,
    metalness: 0.04,
  });
  const back = new Mesh(geo, backMat);
  back.position.z = -0.004;
  const frontTex = makeLabelTexture(hexId);
  const frontMat = new MeshStandardMaterial({
    map: frontTex,
    roughness: 0.85,
    metalness: 0.02,
  });
  const front = new Mesh(geo.clone(), frontMat);
  front.position.z = 0.004;
  front.rotation.y = Math.PI;
  g.add(back);
  g.add(front);
  return g;
}

function disposeGroup(g: Group) {
  g.traverse((ch) => {
    if (ch instanceof Mesh) {
      ch.geometry.dispose();
      const m = ch.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m.dispose();
    }
  });
}

function clearDeckRoot(deckRoot: Group) {
  while (deckRoot.children.length) {
    const ch = deckRoot.children[0];
    deckRoot.remove(ch);
    if (ch instanceof Group) disposeGroup(ch);
  }
}

function buildPile(
  deckRoot: Group,
  order: number[],
  cardByHex: Map<number, Group>,
  backMap: Texture,
) {
  clearDeckRoot(deckRoot);
  cardByHex.clear();
  for (let i = 0; i < 64; i++) {
    const id = order[i];
    const card = createDeckCard(id, backMap);
    const t = i / 63;
    card.position.set((Math.random() - 0.5) * 0.18, 0.05 + t * 0.07, -t * 0.07);
    card.rotation.z = (t - 0.5) * 0.1;
    card.rotation.y = (Math.random() - 0.5) * 0.06;
    deckRoot.add(card);
    cardByHex.set(id, card);
  }
}

function buildStrip(
  deckRoot: Group,
  order: number[],
  cardByHex: Map<number, Group>,
  backMap: Texture,
) {
  clearDeckRoot(deckRoot);
  cardByHex.clear();
  for (let copy = 0; copy < 2; copy++) {
    for (let i = 0; i < 64; i++) {
      const id = order[i];
      const card = createDeckCard(id, backMap);
      card.position.x = copy * LOOP_LEN + (i - 31.5) * SPACING;
      card.position.y = 0;
      card.position.z = 0;
      card.rotation.z = 0;
      card.rotation.y = 0;
      deckRoot.add(card);
      if (!cardByHex.has(id)) cardByHex.set(id, card);
    }
  }
}

type FlyAnim = {
  group: Group;
  from: Vector3;
  to: Vector3;
  t: number;
  flip0: number;
  slotIndex: number;
};

type Burst = { pts: Points; t: number };

type SceneCtx = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  raycaster: Raycaster;
  pointerNdc: Vector2;
  cursorNdcSmooth: Vector2;
  canvasEl: HTMLCanvasElement;
  /** 光标在浏览器视口中的像素位置（用于整页移动与射线） */
  cursorScreen: { x: number; y: number };
  dwellHexId: number | null;
  dwellT: number;
  wasFist: boolean;
  /** 连续识别为握拳的帧数（抑制扫带过程误触） */
  fistStableFrames: number;
  /** 左右扫带后的时间戳，此前忽略握拳选牌 */
  stripSwipeSuppressUntil: number;
  /** 上一帧掌心水平位置（与光标同源），用于推带 delta */
  prevPalmStripX: number | null;
  /** 最近一次有效推带方向 ±1，配合回手抑制 */
  stripLastScrollSign: number;
  /** 回手抑制截止时间（performance.now） */
  stripReturnGuardUntil: number;
  deckRoot: Group;
  cardByHex: Map<number, Group>;
  slotAnchors: Group[];
  flyAnims: FlyAnim[];
  bursts: Burst[];
  scrollX: number;
  scrollVel: number;
  raf: number;
  prevWristX: number | null;
  prevWristY: number | null;
  prevPalmY: number | null;
  pickCooldown: number;
  lastMouseX: number | null;
  isDragging: boolean;
  clock: Clock;
  stripMode: boolean;
  deckOrder: number[];
  openStableFrames: number;
  spreadSignalSent: boolean;
  cardBackTexture: Texture;
  scrollFrozen: boolean;
  spreadMorphT: number | null;
  spreadMorphStates: SpreadMorphState[] | null;
};

function screenToCanvasNdc(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  out: Vector2,
) {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  out.x = MathUtils.clamp(((clientX - rect.left) / w) * 2 - 1, -1.5, 1.5);
  out.y = MathUtils.clamp(-((clientY - rect.top) / h) * 2 + 1, -1.5, 1.5);
}

function applyViewportCursor(
  ctx: SceneCtx,
  targetScreenX: number,
  targetScreenY: number,
  el: HTMLDivElement,
  follow: number,
) {
  ctx.cursorScreen.x += (targetScreenX - ctx.cursorScreen.x) * follow;
  ctx.cursorScreen.y += (targetScreenY - ctx.cursorScreen.y) * follow;
  el.style.position = 'fixed';
  el.style.left = `${ctx.cursorScreen.x}px`;
  el.style.top = `${ctx.cursorScreen.y}px`;
  el.style.transform = 'translate(-50%, -50%)';
  el.style.zIndex = '9999';
  el.style.opacity = '1';
  screenToCanvasNdc(ctx.cursorScreen.x, ctx.cursorScreen.y, ctx.canvasEl, ctx.pointerNdc);
  ctx.cursorNdcSmooth.copy(ctx.pointerNdc);
}

function resetStripCursor(ctx: SceneCtx, el: HTMLDivElement | null) {
  const cx = typeof window !== 'undefined' ? window.innerWidth * 0.5 : 0;
  const cy = typeof window !== 'undefined' ? window.innerHeight * 0.5 : 0;
  ctx.cursorScreen.x = cx;
  ctx.cursorScreen.y = cy;
  if (el) {
    el.style.position = 'fixed';
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    el.style.transform = 'translate(-50%, -50%)';
    el.style.zIndex = '9999';
    el.style.opacity = '1';
  }
  screenToCanvasNdc(cx, cy, ctx.canvasEl, ctx.pointerNdc);
  ctx.cursorNdcSmooth.copy(ctx.pointerNdc);
}

function updateDwellRing(cursorEl: HTMLDivElement | null, progress: number) {
  if (!cursorEl) return;
  const circle = cursorEl.querySelector('[data-dwell-arc]');
  if (circle instanceof SVGCircleElement) {
    const len = 138;
    circle.setAttribute('stroke-dashoffset', String(len * (1 - Math.min(1, progress))));
    const svg = circle.closest('[data-dwell-svg]');
    if (svg instanceof SVGElement) svg.style.opacity = progress > 0.02 ? '1' : '0';
  }
}

function initSpreadMorph(ctx: SceneCtx) {
  if (ctx.spreadMorphStates !== null) return;
  const states: SpreadMorphState[] = [];
  let i = 0;
  for (const ch of ctx.deckRoot.children) {
    if (!(ch instanceof Group) || !ch.userData.deckCard) continue;
    delete ch.userData.pileBase;
    const toX = (i - 31.5) * SPACING;
    states.push({
      group: ch,
      from: ch.position.clone(),
      fromRot: { z: ch.rotation.z, y: ch.rotation.y },
      toX,
    });
    i++;
  }
  if (states.length === 0) return;
  ctx.spreadMorphStates = states;
  ctx.spreadMorphT = 0;
}

function resetStripSwipeBaseline(ctx: SceneCtx) {
  ctx.prevPalmStripX = null;
  ctx.stripLastScrollSign = 0;
  ctx.stripReturnGuardUntil = 0;
}

function finishSpreadMorph(ctx: SceneCtx, cursorEl: HTMLDivElement | null) {
  const deckCards = ctx.deckRoot.children.filter(
    (ch) => ch instanceof Group && ch.userData.deckCard,
  ) as Group[];
  for (let i = 0; i < 64 && i < deckCards.length; i++) {
    const ch = deckCards[i];
    const dup = ch.clone(true);
    dup.position.x += LOOP_LEN;
    ctx.deckRoot.add(dup);
  }
  ctx.spreadMorphStates = null;
  ctx.spreadMorphT = null;
  ctx.stripMode = true;
  ctx.scrollX = -LOOP_LEN * 0.25;
  ctx.scrollVel = 0.0032;
  resetStripSwipeBaseline(ctx);
  resetStripCursor(ctx, cursorEl);
}

function hideHexEverywhere(deckRoot: Group, hexId: number) {
  deckRoot.children.forEach((ch) => {
    if (ch.userData.hexId === hexId && ch.userData.deckCard) ch.visible = false;
  });
}

function spawnBurst(ctx: SceneCtx, at: Vector3) {
  const n = 140;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const c = new Color();
  for (let i = 0; i < n; i++) {
    const r = 0.02 + Math.random() * 0.14;
    const th = Math.random() * Math.PI * 2;
    const ph = (Math.random() - 0.5) * 0.5;
    pos[i * 3] = at.x + Math.cos(th) * r;
    pos[i * 3 + 1] = at.y + Math.sin(ph) * 0.12;
    pos[i * 3 + 2] = at.z + Math.sin(th) * r * 0.6;
    c.setHSL(0.1 + Math.random() * 0.05, 0.88, 0.48 + Math.random() * 0.28);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(pos, 3));
  geom.setAttribute('color', new BufferAttribute(col, 3));
  const mat = new PointsMaterial({
    size: 0.15,
    vertexColors: true,
    transparent: true,
    opacity: 0.98,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const pts = new Points(geom, mat);
  ctx.scene.add(pts);
  ctx.bursts.push({ pts, t: 0 });
}

function attemptPick(
  ctx: SceneCtx,
  slots: [number | null, number | null, number | null],
  onPick: (id: number) => void,
) {
  if (!ctx.stripMode) return;
  if (ctx.scrollFrozen) return;
  if (slots[0] != null && slots[1] != null && slots[2] != null) return;
  if (ctx.pickCooldown > 0) return;

  const tryHit = (): Group | null => {
    for (const [ox, oy] of PICK_NDC_OFFSETS) {
      _pickNdc.set(ctx.pointerNdc.x + ox, ctx.pointerNdc.y + oy);
      ctx.raycaster.setFromCamera(_pickNdc, ctx.camera);
      const hits = ctx.raycaster.intersectObjects(ctx.deckRoot.children, true);
      for (const h of hits) {
        let o = h.object;
        while (o.parent && o.parent !== ctx.deckRoot) o = o.parent;
        const hexId = o.userData.hexId as number | undefined;
        if (hexId == null || !o.userData.deckCard || !o.visible) continue;
        const placed = new Set([slots[0], slots[1], slots[2]].filter((x): x is number => x != null));
        if (placed.has(hexId)) continue;
        return o as Group;
      }
    }
    return null;
  };

  const o = tryHit();
  if (!o) return;
  const hexId = o.userData.hexId as number;
  const slotIndex = slots.findIndex((x) => x === null);
  if (slotIndex < 0) return;

  const w = new Vector3();
  o.getWorldPosition(w);
  hideHexEverywhere(ctx.deckRoot, hexId);

  ctx.scrollFrozen = true;
  ctx.scrollVel = 0;

  spawnBurst(ctx, w);
  spawnBurst(ctx, w);
  const fly = createDeckCard(hexId, ctx.cardBackTexture);
  fly.position.copy(w);
  ctx.scene.add(fly);
  ctx.flyAnims.push({
    group: fly,
    from: w.clone(),
    to: SLOT_POS[slotIndex].clone(),
    t: 0,
    flip0: fly.rotation.y,
    slotIndex,
  });
  onPick(hexId);
  ctx.pickCooldown = 0.44;
  ctx.dwellT = 0;
  ctx.dwellHexId = null;
}

export const GuaciThreeScene: React.FC<Props> = ({
  inputMode,
  deckShuffle,
  stripActive,
  slots,
  onCameraFailed,
  onGestureHud,
  onRequestSpread,
  onPickCard,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sceneRef = useRef<SceneCtx | null>(null);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const onPickCardRef = useRef(onPickCard);
  onPickCardRef.current = onPickCard;
  const onGestureHudRef = useRef(onGestureHud);
  onGestureHudRef.current = onGestureHud;
  const onCameraFailedRef = useRef(onCameraFailed);
  onCameraFailedRef.current = onCameraFailed;
  const onRequestSpreadRef = useRef(onRequestSpread);
  onRequestSpreadRef.current = onRequestSpread;
  const inputModeRef = useRef(inputMode);
  inputModeRef.current = inputMode;
  const cameraStartedRef = useRef(false);
  const cursorRef = useRef<HTMLDivElement>(null);
  const stripActiveRef = useRef(stripActive);
  stripActiveRef.current = stripActive;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let disposed = false;
    let ctx: SceneCtx | null = null;
    let resizeFn: (() => void) | null = null;

    const abortPartial = (
      deckRoot: Group,
      slotAnchors: Group[],
      scene: Scene,
      renderer: WebGLRenderer,
      wrapEl: HTMLElement,
    ) => {
      deckRoot.traverse((ch) => {
        if (ch instanceof Mesh) {
          ch.geometry.dispose();
          const m = ch.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
      slotAnchors.forEach((a) =>
        a.traverse((ch) => {
          if (ch instanceof Mesh && ch.geometry) {
            ch.geometry.dispose();
            const m = ch.material;
            if (Array.isArray(m)) m.forEach((x) => x.dispose());
            else m.dispose();
          }
        }),
      );
      renderer.dispose();
      if (wrapEl.contains(renderer.domElement)) wrapEl.removeChild(renderer.domElement);
    };

    (async () => {
      const backTex = await loadCardBackTexture();
      if (disposed) return;

      const w = wrapRef.current;
      if (!w) return;

      const order = shuffledIds(deckShuffle);
      const scene = new Scene();
      scene.add(new AmbientLight(0xffffff, 0.5));
      const key = new DirectionalLight(0xfff0e6, 1.05);
      key.position.set(2, 5, 6);
      scene.add(key);
      const fill = new DirectionalLight(0xc8d4ff, 0.32);
      fill.position.set(-4, 2, 5);
      scene.add(fill);

    const camera = new PerspectiveCamera(26, 1, 0.1, 260);
    camera.position.set(0, 1.75, 42);
    camera.lookAt(0, 2.15, -0.58);

      const renderer = new WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      w.appendChild(renderer.domElement);

      const deckRoot = new Group();
      deckRoot.position.set(0, 0.03, -0.68);
      const cardByHex = new Map<number, Group>();
      buildPile(deckRoot, order, cardByHex, backTex);
      scene.add(deckRoot);

      const slotAnchors: Group[] = [];
      for (let s = 0; s < 3; s++) {
        const ring = new Mesh(
          new RingGeometry(1.08, 1.42, 48),
          new MeshBasicMaterial({
            color: 0xc4b89a,
            transparent: true,
            opacity: 0.35,
            side: DoubleSide,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        const anchor = new Group();
        anchor.position.copy(SLOT_POS[s]);
        anchor.add(ring);
        scene.add(anchor);
        slotAnchors.push(anchor);
      }

      const raycaster = new Raycaster();
      const pointerNdc = new Vector2(0, 0);
      const cursorNdcSmooth = new Vector2(0, 0);
      const canvasEl = renderer.domElement as HTMLCanvasElement;
      const iw = typeof window !== 'undefined' ? window.innerWidth : 1;
      const ih = typeof window !== 'undefined' ? window.innerHeight : 1;

      const ctxObj: SceneCtx = {
        renderer,
        scene,
        camera,
        raycaster,
        pointerNdc,
        cursorNdcSmooth,
        canvasEl,
        cursorScreen: { x: iw * 0.5, y: ih * 0.5 },
        dwellHexId: null,
        dwellT: 0,
        wasFist: false,
        fistStableFrames: 0,
        stripSwipeSuppressUntil: 0,
        prevPalmStripX: null,
        stripLastScrollSign: 0,
        stripReturnGuardUntil: 0,
        deckRoot,
        cardByHex,
        slotAnchors,
        flyAnims: [],
        bursts: [],
        scrollX: -LOOP_LEN * 0.25,
        scrollVel: 0.0032,
        raf: 0,
        prevWristX: null,
        prevWristY: null,
        prevPalmY: null,
        pickCooldown: 0,
        lastMouseX: null,
        isDragging: false,
        clock: new Clock(),
        stripMode: false,
        deckOrder: order,
        openStableFrames: 0,
        spreadSignalSent: false,
        cardBackTexture: backTex,
        scrollFrozen: false,
        spreadMorphT: null,
        spreadMorphStates: null,
      };

      if (disposed) {
        abortPartial(deckRoot, slotAnchors, scene, renderer, w);
        return;
      }

      ctx = ctxObj;
      sceneRef.current = ctxObj;

      resizeFn = () => {
        if (!wrapRef.current) return;
        const ww = wrapRef.current.clientWidth;
        const hh = wrapRef.current.clientHeight;
        camera.aspect = ww / Math.max(1, hh);
        camera.updateProjectionMatrix();
        renderer.setSize(ww, hh);
      };
      resizeFn();
      window.addEventListener('resize', resizeFn);

      if (stripActiveRef.current) {
        buildStrip(ctxObj.deckRoot, ctxObj.deckOrder, ctxObj.cardByHex, ctxObj.cardBackTexture);
        ctxObj.stripMode = true;
        ctxObj.scrollX = -LOOP_LEN * 0.25;
        ctxObj.scrollVel = 0.0032;
        ctxObj.openStableFrames = 0;
        ctxObj.spreadSignalSent = true;
        resetStripSwipeBaseline(ctxObj);
        resetStripCursor(ctxObj, cursorRef.current);
      }

      let ambientT = 0;

      const tick = () => {
        const c = sceneRef.current;
        if (!c) return;
        const dt = c.clock.getDelta();
        ambientT += dt;
        c.pickCooldown = Math.max(0, c.pickCooldown - dt);

        if (c.spreadMorphT !== null && c.spreadMorphStates) {
          c.spreadMorphT += dt / SPREAD_MORPH_DURATION;
          const u = Math.min(1, c.spreadMorphT);
          const t = 1 - Math.pow(1 - u, 3);
          for (const s of c.spreadMorphStates) {
            const cg = s.group;
            cg.position.x = MathUtils.lerp(s.from.x, s.toX, t);
            cg.position.y = MathUtils.lerp(s.from.y, 0, t);
            cg.position.z = MathUtils.lerp(s.from.z, 0, t);
            cg.rotation.z = MathUtils.lerp(s.fromRot.z, 0, t);
            cg.rotation.y = MathUtils.lerp(s.fromRot.y, 0, t);
          }
          if (u >= 1) {
            finishSpreadMorph(c, cursorRef.current);
          }
        } else if (c.stripMode) {
          if (!c.scrollFrozen) {
            c.scrollVel += Math.sin(ambientT * 0.12) * 0.00007;
            c.scrollVel *= 0.995;
            c.scrollX += c.scrollVel * (dt * 60);
            while (c.scrollX <= -LOOP_LEN) c.scrollX += LOOP_LEN;
            while (c.scrollX > 0) c.scrollX -= LOOP_LEN;
          }
          c.deckRoot.position.x = c.scrollX;
        } else {
          c.deckRoot.children.forEach((card, i) => {
            if (!(card instanceof Group) || !card.userData.deckCard) return;
            if (!card.userData.pileBase) {
              card.userData.pileBase = {
                x: card.position.x,
                y: card.position.y,
                z: card.position.z,
                rz: card.rotation.z,
                ry: card.rotation.y,
              };
            }
            const b = card.userData.pileBase as {
              x: number;
              y: number;
              z: number;
              rz: number;
              ry: number;
            };
            const ph = ambientT * 0.95 + i * 0.04;
            const t = i / 63;
            const bob = Math.sin(ambientT * 0.55 + i * 0.11) * 0.034;
            const swayX = Math.sin(ambientT * 0.36 + i * 0.13) * 0.024;
            const swayZ = Math.sin(ambientT * 0.42 + i * 0.09) * 0.018;
            card.position.set(b.x + swayX, b.y + bob, b.z + swayZ);
            card.rotation.z = b.rz + Math.sin(ph) * 0.038;
            card.rotation.y = b.ry + Math.sin(ambientT * 0.48 + i * 0.07) * 0.045;
          });
        }

        const placed = new Set(
          [slotsRef.current[0], slotsRef.current[1], slotsRef.current[2]].filter(
            (x): x is number => x != null,
          ),
        );
        c.deckRoot.children.forEach((ch) => {
          if (ch.userData.deckCard) {
            ch.visible = !placed.has(ch.userData.hexId);
          }
        });

        let dwellP = 0;
        if (c.stripMode && c.pickCooldown <= 0) {
          const [s0, s1, s2] = slotsRef.current;
          const slotsFull = s0 != null && s1 != null && s2 != null;
          if (slotsFull) {
            c.dwellHexId = null;
            c.dwellT = 0;
          } else if (!c.scrollFrozen) {
            /** 仅在手势/惯性仍较快时暂停停留计时，避免与微弱漂移抢判 */
            const scrollBusy = Math.abs(c.scrollVel) > 0.042;
            if (scrollBusy) {
              c.dwellHexId = null;
              c.dwellT = 0;
            } else {
              screenToCanvasNdc(c.cursorScreen.x, c.cursorScreen.y, c.canvasEl, c.pointerNdc);
              c.raycaster.setFromCamera(c.pointerNdc, c.camera);
              const hitList = c.raycaster.intersectObjects(c.deckRoot.children, true);
              let hexUnder: number | null = null;
              for (const h of hitList) {
                let o = h.object;
                while (o.parent && o.parent !== c.deckRoot) o = o.parent;
                const hid = o.userData.hexId as number | undefined;
                if (hid == null || !o.userData.deckCard || !o.visible) continue;
                if (placed.has(hid)) continue;
                hexUnder = hid;
                break;
              }
              if (hexUnder === c.dwellHexId) {
                c.dwellT += dt;
              } else {
                c.dwellHexId = hexUnder;
                c.dwellT = 0;
              }
              if (c.dwellHexId != null && c.dwellT >= DWELL_PICK_SEC) {
                attemptPick(c, slotsRef.current, onPickCardRef.current);
              }
              dwellP =
                c.dwellHexId != null && c.dwellT > 0 ? Math.min(1, c.dwellT / DWELL_PICK_SEC) : 0;
            }
          }
        } else if (!c.stripMode) {
          c.dwellHexId = null;
          c.dwellT = 0;
        }
        if (c.scrollFrozen) dwellP = 0;
        updateDwellRing(cursorRef.current, dwellP);

        for (let i = c.flyAnims.length - 1; i >= 0; i--) {
          const f = c.flyAnims[i];
          f.t += dt * 0.95;
          const k = Math.min(1, f.t);
          const e = 1 - Math.pow(1 - k, 3);
          f.group.position.lerpVectors(f.from, f.to, e);
          f.group.rotation.y = f.flip0 + Math.PI * e;
          f.group.scale.setScalar(MathUtils.lerp(1, SLOT_CARD_SCALE, e));
          if (k >= 1) {
            const anchor = c.slotAnchors[f.slotIndex];
            const land = new Vector3();
            f.group.getWorldPosition(land);
            c.scene.remove(f.group);
            f.group.position.set(0, 0.06, 0);
            f.group.rotation.set(-0.35, Math.PI, 0);
            f.group.scale.setScalar(SLOT_CARD_SCALE);
            f.group.userData.slotCard = true;
            f.group.userData.deckCard = false;
            anchor.add(f.group);
            spawnBurst(c, land);
            spawnBurst(c, land);
            c.scrollFrozen = false;
            c.flyAnims.splice(i, 1);
          }
        }

        for (let i = c.bursts.length - 1; i >= 0; i--) {
          const b = c.bursts[i];
          b.t += dt;
          const g = b.pts.geometry;
          const posA = g.attributes.position as BufferAttribute;
          const n = posA.count;
          for (let j = 0; j < n; j++) {
            posA.setY(j, posA.getY(j) + dt * (0.35 + Math.random() * 0.15));
            posA.setX(j, posA.getX(j) + (Math.random() - 0.5) * 0.018);
          }
          posA.needsUpdate = true;
          (b.pts.material as PointsMaterial).opacity = Math.max(0, 0.98 - b.t * 1.05);
          if (b.t > 1.05) {
            c.scene.remove(b.pts);
            g.dispose();
            (b.pts.material as PointsMaterial).dispose();
            c.bursts.splice(i, 1);
          }
        }

        c.renderer.render(c.scene, c.camera);
        c.raf = requestAnimationFrame(tick);
      };
      tick();
    })();

    return () => {
      disposed = true;
      sceneRef.current = null;
      if (resizeFn) window.removeEventListener('resize', resizeFn);
      if (ctx) {
        cancelAnimationFrame(ctx.raf);
        ctx.deckRoot.traverse((ch) => {
          if (ch instanceof Mesh) {
            ch.geometry.dispose();
            const m = ch.material;
            if (Array.isArray(m)) m.forEach((x) => x.dispose());
            else m.dispose();
          }
        });
        ctx.slotAnchors.forEach((a) =>
          a.traverse((ch) => {
            if (ch instanceof Mesh && ch.geometry) {
              ch.geometry.dispose();
              const m = ch.material;
              if (Array.isArray(m)) m.forEach((x) => x.dispose());
              else m.dispose();
            }
          }),
        );
        ctx.flyAnims.forEach((f) => {
          disposeGroup(f.group);
          ctx.scene.remove(f.group);
        });
        ctx.slotAnchors.forEach((a) => {
          while (a.children.length > 1) {
            const ch = a.children[a.children.length - 1];
            if (ch instanceof Group && ch.userData.slotCard) {
              a.remove(ch);
              disposeGroup(ch);
            } else break;
          }
        });
        ctx.bursts.forEach((b) => {
          b.pts.geometry.dispose();
          (b.pts.material as PointsMaterial).dispose();
        });
        ctx.renderer.dispose();
        if (wrap.contains(ctx.renderer.domElement)) wrap.removeChild(ctx.renderer.domElement);
      }
    };
  }, [deckShuffle]);

  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !stripActive || ctx.stripMode) return;
    if (inputModeRef.current === 'mouse') {
      buildStrip(ctx.deckRoot, ctx.deckOrder, ctx.cardByHex, ctx.cardBackTexture);
      ctx.stripMode = true;
      ctx.scrollX = -LOOP_LEN * 0.25;
      ctx.scrollVel = 0.0032;
      ctx.openStableFrames = 0;
      ctx.spreadSignalSent = true;
      resetStripSwipeBaseline(ctx);
      resetStripCursor(ctx, cursorRef.current);
      return;
    }
    if (ctx.spreadMorphStates !== null) return;
    initSpreadMorph(ctx);
  }, [stripActive, deckShuffle]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const cursorEl = cursorRef.current;
    if (!wrap || !cursorEl) return;

    const onWinMove = (e: PointerEvent) => {
      const ctx = sceneRef.current;
      if (!ctx || inputModeRef.current !== 'mouse') return;
      applyViewportCursor(ctx, e.clientX, e.clientY, cursorEl, 1);
      if (
        ctx.lastMouseX != null &&
        ctx.isDragging &&
        ctx.stripMode &&
        !ctx.scrollFrozen
      ) {
        const dx = e.clientX - ctx.lastMouseX;
        ctx.scrollVel += dx * 0.00004;
      }
      ctx.lastMouseX = e.clientX;
    };

    const onDown = (e: PointerEvent) => {
      if (inputModeRef.current !== 'mouse') return;
      const ctx = sceneRef.current;
      if (!ctx) return;
      ctx.isDragging = true;
      ctx.lastMouseX = e.clientX;
      applyViewportCursor(ctx, e.clientX, e.clientY, cursorEl, 1);
    };

    const onUp = () => {
      const ctx = sceneRef.current;
      if (!ctx) return;
      ctx.isDragging = false;
      ctx.lastMouseX = null;
    };

    const onClick = (e: MouseEvent) => {
      if (inputModeRef.current !== 'mouse') return;
      const ctx = sceneRef.current;
      if (!ctx || !ctx.stripMode) return;
      if (!(e.target instanceof Node) || !wrap.contains(e.target)) return;
      applyViewportCursor(ctx, e.clientX, e.clientY, cursorEl, 1);
      attemptPick(ctx, slotsRef.current, onPickCardRef.current);
    };

    window.addEventListener('pointermove', onWinMove);
    wrap.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    wrap.addEventListener('click', onClick);

    return () => {
      window.removeEventListener('pointermove', onWinMove);
      wrap.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      wrap.removeEventListener('click', onClick);
    };
  }, [deckShuffle]);

  useEffect(() => {
    if (inputMode !== 'hands') {
      wrapRef.current?.removeAttribute('data-gesture');
      return;
    }
    const video = videoRef.current;
    const cursorEl = cursorRef.current;
    if (!video || cameraStartedRef.current) return;

    let cam: { stop: () => void } | null = null;
    let handsInst: { close: () => void } | null = null;

    const run = async () => {
      try {
        const [{ Hands }, { Camera }] = await Promise.all([
          import('@mediapipe/hands'),
          import('@mediapipe/camera_utils'),
        ]);
        const hands = new Hands({ locateFile: (f) => `${MP_HANDS_CDN}/${f}` });
        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.55,
          minTrackingConfidence: 0.48,
        });

        hands.onResults((res) => {
          const ctx = sceneRef.current;
          const wrap = wrapRef.current;
          if (!ctx || !wrap || !cursorEl) return;

          if (res.multiHandLandmarks?.[0]) {
            const lm = res.multiHandLandmarks[0];
            const g = classifyGesture(lm);
            const mirror = true;
            const wristX = mirror ? 1 - lm[0].x : lm[0].x;
            const palmCx = mirror
              ? 1 - (lm[0].x + lm[5].x + lm[9].x) / 3
              : (lm[0].x + lm[5].x + lm[9].x) / 3;
            const palmCy = (lm[0].y + lm[5].y + lm[9].y) / 3;
            const dy = ctx.prevPalmY != null ? palmCy - ctx.prevPalmY : 0;
            const dxStrip =
              ctx.prevPalmStripX != null ? palmCx - ctx.prevPalmStripX : 0;

            if (ctx.stripMode) {
              let hudG: GestureHud = g;
              if (!ctx.scrollFrozen && g === 'OPEN') {
                const hDom =
                  Math.abs(dxStrip) > Math.abs(dy) * 1.06 &&
                  Math.abs(dxStrip) > H_SWIPE_DOMINANCE;
                if (hDom) {
                  const now = performance.now();
                  let effDx = dxStrip;
                  if (
                    now < ctx.stripReturnGuardUntil &&
                    ctx.stripLastScrollSign !== 0 &&
                    Math.sign(dxStrip) !== ctx.stripLastScrollSign &&
                    Math.abs(dxStrip) < STRIP_REPOSITION_MAX_DX
                  ) {
                    effDx = 0;
                  }
                  if (effDx !== 0) {
                    ctx.scrollVel += effDx * HAND_STRIP_SWIPE_GAIN;
                    if (Math.abs(effDx) > H_SWIPE_DOMINANCE * 0.92) {
                      ctx.stripSwipeSuppressUntil = now + 300;
                    }
                    if (Math.abs(effDx) >= STRIP_SIGNIFICANT_DX) {
                      ctx.stripLastScrollSign = Math.sign(effDx);
                      ctx.stripReturnGuardUntil = now + STRIP_RETURN_GUARD_MS;
                    }
                    hudG = 'SWIPE_H';
                  }
                }
              }
              const fisting = g === 'FIST';
              if (fisting) {
                ctx.fistStableFrames = Math.min(ctx.fistStableFrames + 1, 90);
              } else {
                ctx.fistStableFrames = 0;
              }
              const swipeOk = performance.now() >= ctx.stripSwipeSuppressUntil;
              const FIST_FRAMES_NEED = 6;
              if (
                fisting &&
                swipeOk &&
                !ctx.scrollFrozen &&
                ctx.fistStableFrames === FIST_FRAMES_NEED
              ) {
                attemptPick(ctx, slotsRef.current, onPickCardRef.current);
              }
              ctx.wasFist = fisting;

              ctx.prevPalmStripX = palmCx;
              ctx.prevWristX = wristX;
              ctx.prevWristY = lm[0].y;
              ctx.prevPalmY = palmCy;

              wrap.dataset.gesture = g;
              onGestureHudRef.current?.(hudG, ctx.stripMode);
            } else {
              ctx.wasFist = false;
              ctx.fistStableFrames = 0;
              ctx.prevPalmStripX = null;
              ctx.prevWristX = wristX;
              ctx.prevWristY = lm[0].y;
              ctx.prevPalmY = palmCy;

              if (!ctx.stripMode && !ctx.spreadSignalSent) {
                if (g === 'OPEN') {
                  ctx.openStableFrames += 1;
                  if (ctx.openStableFrames >= 6) {
                    ctx.spreadSignalSent = true;
                    onRequestSpreadRef.current?.();
                  }
                } else {
                  ctx.openStableFrames = 0;
                }
              }

              wrap.dataset.gesture = g;
              onGestureHudRef.current?.(g, ctx.stripMode);
            }

            const sx = palmCx * window.innerWidth;
            const sy = palmCy * window.innerHeight;
            applyViewportCursor(ctx, sx, sy, cursorEl, HAND_VIEWPORT_FOLLOW);
          } else {
            const ctx = sceneRef.current;
            if (ctx) {
              ctx.prevWristX = null;
              ctx.prevWristY = null;
              ctx.prevPalmY = null;
              ctx.prevPalmStripX = null;
              ctx.stripLastScrollSign = 0;
              ctx.stripReturnGuardUntil = 0;
              ctx.wasFist = false;
              ctx.fistStableFrames = 0;
              ctx.dwellHexId = null;
              ctx.dwellT = 0;
            }
            cursorEl.style.opacity = '0';
            updateDwellRing(cursorEl, 0);
            wrapRef.current?.removeAttribute('data-gesture');
            onGestureHudRef.current?.('NONE', false);
          }
        });

        handsInst = hands;
        const camera = new Camera(video, {
          onFrame: async () => {
            await hands.send({ image: video });
          },
          width: 640,
          height: 480,
        });
        await camera.start();
        cam = camera;
        cameraStartedRef.current = true;
      } catch (e) {
        console.warn('Guaci MediaPipe:', e);
        onCameraFailedRef.current?.();
      }
    };

    run();
    return () => {
      cam?.stop();
      handsInst?.close();
      cameraStartedRef.current = false;
    };
  }, [inputMode]);

  return (
    <>
      <video
        ref={videoRef}
        className="pointer-events-none fixed -left-[9999px] top-0 h-1 w-1 opacity-0"
        playsInline
        muted
      />
      <div
        ref={cursorRef}
        className="pointer-events-none fixed left-0 top-0 z-[9999] opacity-0"
        aria-hidden
      >
        <div className="relative -translate-x-1/2 -translate-y-1/2">
          <svg
            data-dwell-svg
            className="pointer-events-none absolute left-1/2 top-1/2 size-[52px] -translate-x-1/2 -translate-y-1/2 -rotate-90 opacity-0 transition-opacity duration-150"
            viewBox="0 0 52 52"
          >
            <circle
              data-dwell-arc
              cx="26"
              cy="26"
              r="22"
              fill="none"
              stroke="rgba(212,175,55,0.92)"
              strokeWidth="3"
              strokeDasharray="138"
              strokeDashoffset="138"
              strokeLinecap="round"
            />
          </svg>
          <div className="size-5 rounded-full border-2 border-white/90 shadow-[0_0_14px_rgba(255,255,255,0.38)]" />
          <div className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        </div>
      </div>
      <div ref={wrapRef} className="relative h-full min-h-[420px] w-full flex-1 md:min-h-[520px]">
        {inputMode === 'hands' && !stripActive && (
          <p className="pointer-events-none absolute bottom-5 left-0 right-0 z-10 animate-pulse px-4 text-center font-serif text-[14px] tracking-[0.12em] text-amber-100/95 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
            张开手掌开始抽牌
          </p>
        )}
      </div>
    </>
  );
};
