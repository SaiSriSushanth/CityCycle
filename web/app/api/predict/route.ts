import { NextResponse } from "next/server";
import { predictDay, predictScenario } from "@/lib/gbm";
import { getLiveForecast } from "@/lib/weather";

export const runtime = "nodejs";

const clamp = (n: unknown, lo: number, hi: number, d: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
};

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));

  // Live mode: today's live forecast with the user's adjustments applied hour by hour,
  // so "no adjustments" reproduces the live forecast exactly.
  if (b.live) {
    try {
      const all = await getLiveForecast(7);
      const nyToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      const dates = Array.from(new Set(all.map((h) => h.t.slice(0, 10))));
      const today = dates.includes(nyToday) ? nyToday : dates[0];
      const rows = all.filter((h) => h.t.startsWith(today));
      const tempDelta = clamp(b.tempDelta, -20, 20, 0);
      const humDelta = clamp(b.humDelta, -50, 50, 0);
      const windDelta = clamp(b.windDelta, -30, 30, 0);
      const weather = Math.round(clamp(b.weather, 0, 4, 0)); // 0 = keep the forecast's weather
      const dayType = b.dayType === "working" || b.dayType === "off" ? b.dayType : "today";

      const scenario = rows.map((r) =>
        Math.round(
          predictScenario({
            hr: r.hr,
            workingday: dayType === "today" ? r.workingday : dayType === "working" ? 1 : 0,
            holiday: dayType === "today" ? r.holiday : 0,
            weekday: r.weekday, month: r.month, year: 1,
            weather: (weather || r.weather) as 1 | 2 | 3 | 4,
            tempC: r.tempC + tempDelta,
            hum: Math.min(100, Math.max(0, r.hum + humDelta)),
            wind: Math.min(67, Math.max(0, r.wind + windDelta)),
          }),
        ),
      );
      const first = rows[0];
      return NextResponse.json({
        live: rows.map((r) => r.model),
        hourly: scenario,
        today: { date: today, workingday: first.workingday === 1, holiday: first.holiday === 1, tempMin: Math.min(...rows.map((r) => r.tempC)), tempMax: Math.max(...rows.map((r) => r.tempC)) },
      });
    } catch {
      return NextResponse.json({ error: "The weather service did not respond." }, { status: 502 });
    }
  }

  // Manual mode (used only when the live outlook is unreachable): one set of conditions for the whole day.
  const hourly = predictDay({
    workingday: b.workingDay ? 1 : 0,
    holiday: b.holiday ? 1 : 0,
    month: Math.round(clamp(b.month, 1, 12, 7)),
    weather: Math.round(clamp(b.weather, 1, 4, 1)) as 1 | 2 | 3 | 4,
    tempC: clamp(b.tempC, -8, 40, 20),
    hum: clamp(b.humidity, 0, 100, 55),
    wind: clamp(b.wind, 0, 67, 12),
  });
  return NextResponse.json({ hourly });
}
