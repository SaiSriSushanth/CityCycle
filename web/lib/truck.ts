import { createHash, timingSafeEqual } from "node:crypto";
import { season } from "./gbm";
import { getLiveForecast, type LiveHour } from "./weather";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

export const configured = () => Boolean(URL_ && KEY);
export const codeRequired = () => Boolean(process.env.CREW_ACCESS_CODE);

const sha = (s: string) => createHash("sha256").update(s).digest();
export function codeOk(given: unknown): boolean {
  const want = process.env.CREW_ACCESS_CODE;
  if (!want) return true;
  return typeof given === "string" && timingSafeEqual(sha(given), sha(want));
}

async function supa(path: string, init: RequestInit = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: { apikey: KEY!, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`supabase-${res.status}`);
  return res.status === 204 ? null : res.json();
}

/** Washington local date and hour, as the weather service labels its hours. */
export function nyNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hr: Number(p.hour) };
}

/** Everything a driver does not have to type: the current hour's weather and calendar facts. */
export async function currentContext(): Promise<{ hour: LiveHour; date: string; weekdayName: string }> {
  const { date, hr } = nyNow();
  const hours = await getLiveForecast(2);
  const hour = hours.find((h) => h.t === `${date}T${String(hr).padStart(2, "0")}:00`);
  if (!hour) throw new Error("no-weather");
  const weekdayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][hour.weekday];
  return { hour, date, weekdayName };
}

export async function insertEntry(bikes: number, truckId: string | null) {
  const { hour: h, date } = await currentContext();
  const row = {
    local_date: date, hr: h.hr, season: season(h.month), year: Number(date.slice(0, 4)), mnth: h.month,
    weekday: h.weekday, holiday: h.holiday, workingday: h.workingday, weathersit: h.weather, weather_code: h.code,
    temp_c: h.tempC, humidity_pct: Math.round(h.hum), wind_kmh: h.wind, precip_mm: h.precipMm,
    bikes_moved: bikes, truck_id: truckId, forecast_rentals: h.model,
  };
  const out = await supa("truck_log", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  return out[0] as Record<string, unknown>;
}

export async function recentEntries(limit = 15) {
  return (await supa(`truck_log?select=id,logged_at,hr,bikes_moved,truck_id,temp_c,weathersit,workingday&order=logged_at.desc&limit=${limit}`)) as Record<string, unknown>[];
}

export async function todaySummary() {
  const { date } = nyNow();
  const rows = (await supa(`truck_log?select=bikes_moved&local_date=eq.${date}`)) as { bikes_moved: number }[];
  return { entries: rows.length, bikes: rows.reduce((a, r) => a + r.bikes_moved, 0) };
}
