import summary from "../public/data/summary.json";
import drivers from "../public/data/drivers.json";
import eda from "../public/data/eda.json";

export { summary, drivers, eda };

export type ForecastRow = {
  t: string;
  actual: number;
  model: number;
  baseline: number;
  hr: number;
  workingday: number;
  weather: number;
  tempC: number;
};

export type ModelScore = {
  key: string;
  name: string;
  kind: "baseline" | "model";
  mae: number;
  rmse: number;
  r2: number;
};

export const WEATHER_LABEL: Record<number, string> = {
  1: "Clear",
  2: "Mist or cloud",
  3: "Light rain or snow",
  4: "Heavy rain or snow",
};

export const fmt = (n: number, d = 0) =>
  n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
export const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;
