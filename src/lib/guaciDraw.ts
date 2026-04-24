import {
  findHexagramIdByLines,
  flipLines,
  getHexagramById,
  mutualLines,
  randomChangingLines,
  type SixLines,
} from '../data/kingWenHexagrams';

export type GuaciReading = {
  question: string;
  benId: number;
  huId: number;
  bianId: number;
  changingLines: number[];
  benLines: SixLines;
};

export function buildReading(question: string, benId: number): GuaciReading {
  const ben = getHexagramById(benId);
  const changing = randomChangingLines();
  const benLines = ben.lines as SixLines;
  const bianLines = flipLines(benLines, changing);
  const huLines = mutualLines(benLines);
  return {
    question,
    benId,
    huId: findHexagramIdByLines(huLines),
    bianId: findHexagramIdByLines(bianLines),
    changingLines: changing,
    benLines,
  };
}

export function fullPool(): number[] {
  return Array.from({ length: 64 }, (_, i) => i + 1);
}

export function pickBenFromPool(pool: number[]): number {
  if (pool.length === 0) return 1 + Math.floor(Math.random() * 64);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 三槽位自选：变爻取本卦与变卦爻线差异 */
export function readingFromSlots(
  question: string,
  benId: number,
  huId: number,
  bianId: number,
): GuaciReading {
  const ben = getHexagramById(benId);
  const bianLines = getHexagramById(bianId).lines as SixLines;
  const benLines = ben.lines as SixLines;
  const changing: number[] = [];
  for (let i = 0; i < 6; i++) {
    if (benLines[i] !== bianLines[i]) changing.push(i);
  }
  return {
    question,
    benId,
    huId,
    bianId,
    changingLines: changing,
    benLines,
  };
}
