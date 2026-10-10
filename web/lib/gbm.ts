import model from "../public/data/model.json";

type Node = { v: number } | { f: number; t: number; d: string; l: boolean; L: Node; R: Node };
const trees = model.trees as unknown as Node[];
export const FEATURES = model.features as string[];

function walk(node: Node, x: number[]): number {
  let n = node;
  while (!("v" in n)) {
    const val = x[n.f];
    n = Number.isNaN(val) ? (n.l ? n.L : n.R) : val <= n.t ? n.L : n.R;
  }
  return n.v;
}

/** Scores one feature row (ordered as FEATURES) with the exported LightGBM trees. */
export function predictRow(x: number[]): number {
  let sum = 0;
  for (const t of trees) sum += walk(t, x);
  return Math.max(0, sum);
}

export type Scenario = {
  hr: number;
  workingday: 0 | 1;
  holiday?: 0 | 1;
  weekday?: number;
  month: number;
  year?: 0 | 1;
  weather: 1 | 2 | 3 | 4;
  tempC: number;
  hum: number; // percent
  wind: number; // km/h-ish, 0-67
};

// Most common `season` code per month in hour.csv (codes follow the source data, not the README labels).
export function season(month: number): number {
  return Math.min(4, Math.floor((month - 1) / 3) + 1);
}

export function predictScenario(s: Scenario): number {
  const weekday = s.weekday ?? (s.workingday ? 3 : 6);
  const row: Record<string, number> = {
    yr: s.year ?? 1,
    mnth: s.month,
    hr: s.hr,
    weekday,
    workingday: s.workingday,
    holiday: s.holiday ?? 0,
    season: season(s.month),
    weathersit: s.weather,
    temp: s.tempC / 41,
    hum: s.hum / 100,
    windspeed: s.wind / 67,
  };
  return predictRow(FEATURES.map((f) => row[f]));
}

export function predictDay(s: Omit<Scenario, "hr">): number[] {
  return Array.from({ length: 24 }, (_, hr) => Math.round(predictScenario({ ...s, hr })));
}
