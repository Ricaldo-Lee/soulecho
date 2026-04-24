import type { GuaciReading } from './guaciDraw';
import { fullPool } from './guaciDraw';

const POOL_KEY = 'soulecho_guaci_pool_v1';
const HIST_KEY = 'soulecho_guaci_history_v1';

export type GuaciHistoryEntry = GuaciReading & {
  at: string;
  benName: string;
  huName: string;
  bianName: string;
};

function parseNumArray(raw: string | null): number[] {
  if (!raw) return fullPool();
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return fullPool();
    return v.filter((x) => typeof x === 'number' && x >= 1 && x <= 64) as number[];
  } catch {
    return fullPool();
  }
}

export function loadPool(): number[] {
  if (typeof localStorage === 'undefined') return fullPool();
  const p = parseNumArray(localStorage.getItem(POOL_KEY));
  return p.length ? p : fullPool();
}

export function savePool(pool: number[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(POOL_KEY, JSON.stringify(pool));
}

export function loadHistory(): GuaciHistoryEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HIST_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as GuaciHistoryEntry[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveHistory(entries: GuaciHistoryEntry[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(HIST_KEY, JSON.stringify(entries.slice(0, 120)));
}

export function removeBenFromPool(pool: number[], benId: number): number[] {
  const next = pool.filter((id) => id !== benId);
  return next.length ? next : fullPool();
}
