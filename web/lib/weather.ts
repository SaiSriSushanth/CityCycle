import { predictScenario } from "./gbm";

// Capital Bikeshare (the source of the training data) serves Washington, D.C.
const LAT = process.env.CITYCYCLE_LAT || "38.9072";
const LON = process.env.CITYCYCLE_LON || "-77.0369";
const TZ = "America/New_York";

export type LiveHour = {
  t: string; // local time, YYYY-MM-DDTHH:00
  hr: number;
  workingday: 0 | 1;
  holiday: 0 | 1;
  weekday: number;
  month: number;
  weather: 1 | 2 | 3 | 4;
  code: number; // raw WMO weather code
  tempC: number;
  hum: number;
  wind: number;
  precipMm: number;
  model: number;
};

/** WMO weather code (+ hourly rain) -> the dataset's 4 weather situations. */
export function weatherSituation(code: number, precipMm: number): 1 | 2 | 3 | 4 {
  const heavy = precipMm >= 7.6 || [65, 67, 75, 82, 86, 95, 96, 99].includes(code);
  const wet = (code >= 51 && code <= 67) || (code >= 71 && code <= 77) || (code >= 80 && code <= 86) || code >= 95;
  if (wet) return heavy ? 4 : 3;
  if (code >= 2) return 2; // partly cloudy, overcast, fog
  return 1;
}

// ---- US federal holidays (+ DC Emancipation Day), observed dates, as flagged in the source data ----
const nthWeekday = (y: number, m: number, wd: number, n: number) => {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  return 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
};
const lastWeekday = (y: number, m: number, wd: number) => {
  const last = new Date(Date.UTC(y, m + 1, 0));
  return last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7);
};

export function isHoliday(y: number, m: number, d: number): boolean {
  const fixed: [number, number][] = [[0, 1], [3, 16], [5, 19], [6, 4], [10, 11], [11, 25]];
  const days: [number, number][] = [
    ...fixed,
    [0, nthWeekday(y, 0, 1, 3)], [1, nthWeekday(y, 1, 1, 3)], [4, lastWeekday(y, 4, 1)],
    [8, nthWeekday(y, 8, 1, 1)], [9, nthWeekday(y, 9, 1, 2)], [10, nthWeekday(y, 10, 4, 4)],
  ];
  const target = Date.UTC(y, m, d);
  return days.some(([hm, hd]) => {
    const dt = new Date(Date.UTC(y, hm, hd));
    const dow = dt.getUTCDay();
    const observed = dow === 6 ? hd - 1 : dow === 0 ? hd + 1 : hd; // Sat -> Fri, Sun -> Mon
    return Date.UTC(y, hm, observed) === target;
  });
}

type OpenMeteo = {
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    wind_speed_10m: number[];
    weather_code: number[];
    precipitation: number[];
  };
};

export async function getLiveForecast(days = 7): Promise<LiveHour[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation` +
    `&timezone=${encodeURIComponent(TZ)}&forecast_days=${days}`;
  const res = await fetch(url, { next: { revalidate: 900 } }); // weather outlook refreshes every 15 min
  if (!res.ok) throw new Error(`weather-${res.status}`);
  const { hourly: h } = (await res.json()) as OpenMeteo;

  return h.time.map((t, i) => {
    const [y, m, d] = t.slice(0, 10).split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const holiday = isHoliday(y, m - 1, d);
    const workingday = weekday !== 0 && weekday !== 6 && !holiday ? 1 : 0;
    const weather = weatherSituation(h.weather_code[i], h.precipitation[i]);
    const hr = Number(t.slice(11, 13));
    const model = predictScenario({
      hr, workingday, holiday: holiday ? 1 : 0, weekday, month: m, year: 1, weather,
      tempC: h.temperature_2m[i], hum: h.relative_humidity_2m[i], wind: h.wind_speed_10m[i],
    });
    return {
      t, hr, workingday, holiday: (holiday ? 1 : 0) as 0 | 1, weekday, month: m, weather, code: h.weather_code[i],
      tempC: Math.round(h.temperature_2m[i] * 10) / 10,
      hum: h.relative_humidity_2m[i],
      wind: h.wind_speed_10m[i],
      precipMm: h.precipitation[i],
      model: Math.round(model),
    };
  });
}
