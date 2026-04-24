import lunisolar from 'lunisolar';
import takeSound from 'lunisolar/plugins/takeSound';
import char8ex from 'lunisolar/plugins/char8ex';

lunisolar.extend(takeSound);
lunisolar.extend(char8ex);

const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';

export type BirthProfileInput = {
  birthDate: string;
  birthTime: string;
  birthPlace?: string;
};

export function isYangYearStem(stemIndex: number): boolean {
  return stemIndex % 2 === 0;
}

/** 大运顺逆：阳男阴女顺（+1），阴男阳女逆（-1） */
export function daYunStep(sex: 0 | 1, yearStemIndex: number): 1 | -1 {
  const yangYear = isYangYearStem(yearStemIndex);
  const male = sex === 1;
  if ((male && yangYear) || (!male && !yangYear)) return 1;
  return -1;
}

export function sbIndexToName(idx: number): string {
  const i = ((idx % 60) + 60) % 60;
  return STEMS[i % 10] + BRANCHES[i % 12];
}

export function stemElementClass(stem: string): string {
  const m: Record<string, string> = {
    甲: 'text-emerald-400',
    乙: 'text-emerald-300',
    丙: 'text-red-400',
    丁: 'text-red-300',
    戊: 'text-amber-500',
    己: 'text-amber-400',
    庚: 'text-yellow-300',
    辛: 'text-yellow-200',
    壬: 'text-sky-400',
    癸: 'text-sky-300',
  };
  return m[stem] ?? 'text-zinc-200';
}

export function branchElementClass(branch: string): string {
  const w: Record<string, string> = {
    寅: 'text-emerald-400',
    卯: 'text-emerald-300',
    巳: 'text-red-400',
    午: 'text-red-300',
    申: 'text-yellow-300',
    酉: 'text-yellow-200',
    亥: 'text-sky-400',
    子: 'text-sky-300',
    辰: 'text-amber-500',
    戌: 'text-amber-500',
    丑: 'text-amber-400',
    未: 'text-amber-400',
  };
  return w[branch] ?? 'text-zinc-200';
}

function parseBirthLsr(p: BirthProfileInput) {
  const t = p.birthTime?.trim() || '12:00';
  const d = p.birthDate.replace(/-/g, '/');
  return lunisolar(`${d} ${t}`);
}

export function computeAge(birthDate: string): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  const md = today.getMonth() + 1 - m;
  if (md < 0 || (md === 0 && today.getDate() < d)) age--;
  return Math.max(0, age);
}

export type ArchiveColumn = {
  key: string;
  label: string;
  stem: string;
  branch: string;
  mainStar: string;
  hiddenStemLabels: string[];
  hiddenStemClasses: string[];
  hiddenGodLabels: string[];
  naYin: string;
  luckStage: string;
  voidBranches: string;
  gods: string;
};

function formatMissing(pair: [unknown, unknown]): string {
  return String(pair[0]) + String(pair[1]);
}

const TWELVE_STAGES: Record<string, string[]> = {
  甲: ['亥', '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌'],
  乙: ['午', '巳', '辰', '卯', '寅', '丑', '子', '亥', '戌', '酉', '申', '未'],
  丙: ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'],
  丁: ['酉', '申', '未', '午', '巳', '辰', '卯', '寅', '丑', '子', '亥', '戌'],
  戊: ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'],
  己: ['酉', '申', '未', '午', '巳', '辰', '卯', '寅', '丑', '子', '亥', '戌'],
  庚: ['巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑', '寅', '卯', '辰'],
  辛: ['子', '亥', '戌', '酉', '申', '未', '午', '巳', '辰', '卯', '寅', '丑'],
  壬: ['申', '酉', '戌', '亥', '子', '丑', '寅', '卯', '辰', '巳', '午', '未'],
  癸: ['卯', '寅', '丑', '子', '亥', '戌', '酉', '申', '未', '午', '巳', '辰'],
};

const STAGE_NAMES = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养'];

function stageForDayMaster(dayStem: string, branch: string): string {
  const row = TWELVE_STAGES[dayStem];
  if (!row) return '—';
  const idx = row.indexOf(branch);
  if (idx < 0) return '—';
  return STAGE_NAMES[idx] ?? '—';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pillarToColumn(p: any, key: string, label: string, dayStem: string, pillarGods: any[]): ArchiveColumn {
  const stem = p.stem.toString();
  const branch = p.branch.toString();
  const hidden: string[] = (p.branch.hiddenStems || []).map((h: { toString(): string }) => h.toString());
  const hiddenCls = hidden.map((ch) => stemElementClass(ch));
  const hiddenGodLabels: string[] = (p.branchTenGod || []).map((g: { toString(): string }) => g.toString());
  const godStr = (pillarGods || [])
    .slice(0, 6)
    .map((g: { toString(): string }) => g.toString())
    .join(' ');

  return {
    key,
    label,
    stem,
    branch,
    mainStar: p.stemTenGod.toString(),
    hiddenStemLabels: hidden,
    hiddenStemClasses: hiddenCls,
    hiddenGodLabels,
    naYin: p.takeSound,
    luckStage: stageForDayMaster(dayStem, branch),
    voidBranches: formatMissing(p.missing),
    gods: godStr,
  };
}

function splitStemBranch(gz: string): { stem: string; branch: string } {
  if (gz.length < 2) return { stem: '—', branch: '—' };
  return { stem: gz[0], branch: gz[1] };
}

function syntheticColumn(
  key: string,
  label: string,
  gz: string,
  dayStem: string,
  mainStar: string,
): ArchiveColumn {
  const { stem, branch } = splitStemBranch(gz);
  return {
    key,
    label,
    stem,
    branch,
    mainStar,
    hiddenStemLabels: [],
    hiddenStemClasses: [],
    hiddenGodLabels: [],
    naYin: '—',
    luckStage: stageForDayMaster(dayStem, branch),
    voidBranches: '—',
    gods: '—',
  };
}

export type BaziArchiveModel = {
  solarLabel: string;
  lunarLabel: string;
  age: number;
  sexLabel: string;
  dayStem: string;
  columns: ArchiveColumn[];
  luckMeta: string;
  fortuneHint: string;
};

function buildFortuneHint(dayStem: string, liuStem: string): string {
  const di = STEMS.indexOf(dayStem);
  const li = STEMS.indexOf(liuStem);
  if (di < 0 || li < 0) return '流年天干与日干的关系可作性情、际遇之参考；流月、流日随节气与干支更替，宜结合全盘与大运详断。';
  const sameEl = Math.floor(di / 2) === Math.floor(li / 2);
  const diffYinYang = di % 2 !== li % 2;
  if (di === li) return '流年伏吟日干，多见旧事重提、心境反复，宜守不宜攻。';
  if (sameEl && diffYinYang) return '流年比劫透干，主同辈、合作与竞争并见，注意财务与人际边界。';
  return '流年与日干五行相荡；流月以节气换柱，流日以干支纪日连续递进。以下为纲要提示，非定论。';
}

export function buildBaziArchiveModel(
  profile: BirthProfileInput | null,
  sex: 0 | 1,
): BaziArchiveModel | null {
  if (!profile?.birthDate) return null;

  const lsr = parseBirthLsr(profile);
  const ex = lsr.char8ex(sex);
  const dayStem = ex.day.stem.toString();

  const now = lunisolar();
  const ny = now.char8.year;
  const nm = now.char8.month;
  const nd = now.char8.day;

  const monthIdx = ex.month.value;
  const step = daYunStep(sex, ex.year.stem.value);
  const luckIdx = (monthIdx + step + 60) % 60;
  const luckPillar = sbIndexToName(luckIdx);

  const plist = [ex.year, ex.month, ex.day, ex.hour];
  const labels = ['年柱', '月柱', '日柱', '时柱'];
  const keys = ['y', 'm', 'd', 'h'];
  const godCols = [ex.gods.year, ex.gods.month, ex.gods.day, ex.gods.hour];

  const four = keys.map((key, i) => pillarToColumn(plist[i], key, labels[i], dayStem, godCols[i]));

  const extra = [
    syntheticColumn('luck', '大运', luckPillar, dayStem, '大运'),
    syntheticColumn('ln', '流年', ny.stem.toString() + ny.branch.toString(), dayStem, '流年'),
    syntheticColumn('ly', '流月', nm.stem.toString() + nm.branch.toString(), dayStem, '流月'),
    syntheticColumn('lr', '流日', nd.stem.toString() + nd.branch.toString(), dayStem, '流日'),
  ];

  const solarLabel = `${lsr.format('YYYY年M月D日')} ${lsr.format('HH:mm')}`;
  const lunarLabel = `${lsr.lunar.toString()}`;

  return {
    solarLabel,
    lunarLabel,
    age: computeAge(profile.birthDate),
    sexLabel: ex.sex,
    dayStem,
    columns: [...four, ...extra],
    luckMeta: `大运自月柱${step > 0 ? '顺' : '逆'}推首步（未计精确起运岁数与节气时刻）。`,
    fortuneHint: buildFortuneHint(dayStem, ny.stem.toString()),
  };
}
