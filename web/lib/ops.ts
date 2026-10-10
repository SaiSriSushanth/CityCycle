import { predictScenario } from "./gbm";
import { getLiveForecast, type LiveHour } from "./weather";
import { WEATHER_LABEL } from "./data";

/** Everything the live Ops page shows, computed from the live weather outlook and the trained model. */

const nyToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hh = (h: number) => `${String(((h % 24) + 24) % 24).padStart(2, "0")}:00`;

function score(rows: LiveHour[], over: Partial<Pick<LiveHour, "tempC" | "workingday" | "holiday">> = {}) {
  return rows.reduce(
      (a, r) =>
        a +
        Math.round(predictScenario({
          hr: r.hr, workingday: over.workingday ?? r.workingday, holiday: over.holiday ?? r.holiday,
          weekday: r.weekday, month: r.month, year: 1, weather: r.weather,
          tempC: over.tempC !== undefined ? r.tempC + over.tempC : r.tempC, hum: r.hum, wind: r.wind,
        })),
      0,
    );
}

const staffing = (total: number) => (total > 6500 ? "heavy" : total < 3000 ? "light" : "normal");

export async function computeOps() {
  const live = await getLiveForecast(7);
  const dates = Array.from(new Set(live.map((h) => h.t.slice(0, 10))));
  const today = dates.includes(nyToday()) ? nyToday() : dates[0];
  const rows = live.filter((h) => h.t.startsWith(today));
  const next = dates[dates.indexOf(today) + 1];
  const tomorrowRows = next ? live.filter((h) => h.t.startsWith(next)) : [];
  const working = rows[0].workingday === 1;
  const wd = DAYS[new Date(today + "T12:00:00Z").getUTCDay()];

  // 1. hour of day: busiest windows today, and today next to tomorrow
  const best = (rs: LiveHour[]) => [...rs].sort((a, b) => b.model - a.model)[0];
  const am = best(rows.filter((r) => r.hr < 12));
  const pm = best(rows.filter((r) => r.hr >= 12));
  const overall = best(rows);
  const hour = {
    peaks: working ? [am, pm].map((p) => ({ time: hh(p.hr), bikes: p.model })) : [{ time: hh(overall.hr), bikes: overall.model }],
    action: working
      ? `Finish the overnight run by ${hh(am.hr - 2)}: stock residential docks and clear business-district docks. Sweep back between 10:00 and 15:00, then stock evening return points before ${hh(pm.hr - 1)}.`
      : `Skip the commuter run. Move bikes toward parks and leisure areas by ${hh(overall.hr - 2)}, ahead of the midday build-up around ${hh(overall.hr)}.`,
    todayLine: rows.map((r) => ({ hr: r.hr, today: r.model, tomorrow: tomorrowRows.find((t) => t.hr === r.hr)?.model ?? null })),
    tomorrowLabel: next ? new Date(next + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) : null,
  };

  // 2. temperature: today's range, and what the model says a colder or warmer day would do
  const temps = rows.map((r) => r.tempC);
  const base = score(rows);
  const temperature = {
    min: Math.min(...temps), max: Math.max(...temps),
    avg: Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10,
    scenarios: [-10, -5, 0, 5, 10].map((d) => ({ delta: d, total: d === 0 ? base : score(rows, { tempC: d }) })),
    base,
  };

  // 3. day type: today as forecast vs the other regime with the same weather
  const flipped = score(rows, { workingday: working ? 0 : 1, holiday: 0 });

  // 4. week at a glance and heads-up
  const week = dates.map((d) => {
    const rs = live.filter((h) => h.t.startsWith(d));
    const total = rs.reduce((a, r) => a + r.model, 0);
    const worst = Math.max(...rs.map((r) => r.weather));
    return {
      date: d, label: new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" }),
      total, staffing: staffing(total), working: rs[0].workingday === 1, holiday: rs[0].holiday === 1,
      weather: WEATHER_LABEL[worst], worst, tempMin: Math.round(Math.min(...rs.map((r) => r.tempC))), tempMax: Math.round(Math.max(...rs.map((r) => r.tempC))),
    };
  });
  const headsUp: string[] = [];
  for (const d of week) {
    const name = new Date(d.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    if (d.holiday) headsUp.push(`${name} is a holiday: expect the weekend pattern, not the commute peaks.`);
    if (d.worst >= 3) headsUp.push(`${name}: ${d.weather.toLowerCase()} expected, so demand may fall below the forecast.`);
    if (d.tempMin < 5) headsUp.push(`${name}: it drops to about ${d.tempMin} °C, so plan lighter runs.`);
  }
  const heaviest = [...week].sort((a, b) => b.total - a.total)[0];

  return {
    date: today, weekday: wd, working,
    hour,
    temperature,
    dayType: { working, flippedTotal: flipped, base },
    week,
    heaviest: { label: heaviest.label, total: heaviest.total },
    headsUp: headsUp.slice(0, 5),
    updated: new Date().toISOString(),
  };
}
