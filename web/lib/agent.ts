import forecastData from "../public/data/forecast.json";
import { drivers, summary, eda, type ForecastRow, WEATHER_LABEL } from "./data";
import { predictDay, predictScenario, type Scenario } from "./gbm";
import { getLiveForecast } from "./weather";

const forecast = forecastData as unknown as ForecastRow[];
export const ARCHIVE_DATES = Array.from(new Set(forecast.map((r) => r.t.slice(0, 10))));
export const ARCHIVE_RANGE = `${ARCHIVE_DATES[0]} to ${ARCHIVE_DATES[ARCHIVE_DATES.length - 1]}`;

type DayRow = { hr: number; model: number; weather: number; tempC: number; workingday: number };
type Basis = "historical test months" | "live weather outlook";

/** Dates the agents can plan: the held-out 2012 months plus the live outlook (if reachable). */
export async function plannableDates(): Promise<{ archive: string[]; live: string[] }> {
  try {
    const live = await getLiveForecast(7);
    return { archive: ARCHIVE_DATES, live: Array.from(new Set(live.map((h) => h.t.slice(0, 10)))) };
  } catch {
    return { archive: ARCHIVE_DATES, live: [] };
  }
}

async function rowsFor(date: string): Promise<{ rows: DayRow[]; basis: Basis } | null> {
  const arc = forecast.filter((r) => r.t.startsWith(date));
  if (arc.length) {
    return { basis: "historical test months", rows: arc.map((r) => ({ hr: r.hr, model: r.model, weather: r.weather, tempC: r.tempC, workingday: r.workingday })) };
  }
  try {
    const live = (await getLiveForecast(7)).filter((h) => h.t.startsWith(date));
    if (live.length) return { basis: "live weather outlook", rows: live };
  } catch { /* fall through */ }
  return null;
}

// ---------- tools: every number the agents quote comes from these ----------

export async function getDayForecast(date: string) {
  const found = await rowsFor(date);
  if (!found) {
    const { live } = await plannableDates();
    return { error: `No forecast for ${date}. Available: ${ARCHIVE_RANGE} (historical test months)${live.length ? ` and ${live[0]} to ${live[live.length - 1]} (live weather outlook)` : ""}.` };
  }
  const { rows, basis } = found;
  const hourly = rows.map((r) => ({ hour: r.hr, forecast: Math.round(r.model) }));
  const sorted = [...hourly].sort((a, b) => b.forecast - a.forecast);
  const weather = Math.max(...rows.map((r) => r.weather));
  const wd = new Date(date + "T12:00:00Z").getUTCDay();
  return {
    date,
    basis,
    weekday: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][wd],
    dayType: rows[0].workingday ? "working day" : "weekend or holiday",
    worstWeather: WEATHER_LABEL[weather],
    avgTempC: Math.round((rows.reduce((a, r) => a + r.tempC, 0) / rows.length) * 10) / 10,
    totalBikes: hourly.reduce((a, h) => a + h.forecast, 0),
    peakHours: sorted.slice(0, 3),
    hourly,
    typicalErrorBikesPerHour: Math.round(summary.models.find((m) => m.key === "gbm")!.mae),
    ...(basis === "live weather outlook"
      ? { caveat: "Live forecast: the model learned from 2011 to 2012 rentals, so totals reflect the 2012 system size. Trust the shape of the day more than the exact counts." }
      : {}),
  };
}

export function getDrivers() {
  return drivers.slice(0, 6).map((d) => ({ driver: d.label, shareOfModelImpact: Math.round(d.share * 100) / 100 }));
}

export function getMetrics() {
  return {
    testWindow: `${summary.split.test_from} to ${summary.split.test_to}`,
    models: summary.models.map((m) => ({ name: m.name, maeBikesPerHour: Math.round(m.mae * 10) / 10, r2: Math.round(m.r2 * 1000) / 1000 })),
    champion: "Gradient boosting",
    improvementVsSameHourLastWeek: Math.round(summary.improvement_vs_last_week * 100) / 100,
    peakHourMae: Math.round(summary.peak_mae),
  };
}

export function getHourlyProfile() {
  return eda.hourly_profile;
}

export function predictWhatIf(s: Scenario & { hr?: number }) {
  if (typeof s.hr === "number") return { hour: s.hr, bikes: Math.round(predictScenario(s as Scenario)) };
  return { hourly: predictDay(s) };
}

export const TOOL_IMPL: Record<string, (a: any) => unknown | Promise<unknown>> = {
  get_day_forecast: (a) => getDayForecast(String(a.date)),
  get_drivers: () => getDrivers(),
  get_metrics: () => getMetrics(),
  get_hourly_profile: () => getHourlyProfile(),
  predict_what_if: (a) =>
    predictWhatIf({
      hr: a.hour,
      workingday: a.workingDay ? 1 : 0,
      month: a.month,
      weather: a.weather,
      tempC: a.tempC,
      hum: a.humidity ?? 60,
      wind: a.wind ?? 10,
    }),
};

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_day_forecast",
      description: "Hourly bike-rental forecast (24 hours) for one date, with day type, weather, temperature, total bikes and the 3 peak hours. Works for the held-out 2012 months and for the next 7 days using a live weather outlook for Washington, D.C.",
      parameters: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" } }, required: ["date"] },
    },
  },
  {
    type: "function",
    function: { name: "get_drivers", description: "The factors that move demand most, as a share of model impact.", parameters: { type: "object", properties: {} } },
  },
  {
    type: "function",
    function: { name: "get_metrics", description: "Model error vs naive baselines on the held-out period.", parameters: { type: "object", properties: {} } },
  },
  {
    type: "function",
    function: { name: "get_hourly_profile", description: "Average rentals per hour of day on working days vs weekends/holidays.", parameters: { type: "object", properties: {} } },
  },
  {
    type: "function",
    function: {
      name: "predict_what_if",
      description: "Predicted rentals for a hypothetical hour/weather scenario.",
      parameters: {
        type: "object",
        properties: {
          hour: { type: "integer", minimum: 0, maximum: 23 },
          workingDay: { type: "boolean" },
          month: { type: "integer", minimum: 1, maximum: 12 },
          weather: { type: "integer", minimum: 1, maximum: 4, description: "1 clear, 2 mist/cloud, 3 light rain/snow, 4 heavy" },
          tempC: { type: "number" },
          humidity: { type: "number" },
          wind: { type: "number" },
        },
        required: ["hour", "workingDay", "month", "weather", "tempC"],
      },
    },
  },
];

// ---------- rule-based planner: used as fallback and as the numeric skeleton ----------

export type Plan = {
  status: "PENDING_APPROVAL";
  source: "openai" | "rules";
  basis: Basis;
  date: string;
  headline: string;
  staffing: "light" | "normal" | "heavy";
  peaks: { window: string; expectedBikes: number }[];
  actions: { when: string; action: string; why: string }[];
  risks: string[];
};

export type Today = {
  source: "openai" | "rules";
  date: string;
  headline: string;
  briefing: string;
  moments: { time: string; do: string }[];
  watchouts: string[];
};

/** Rule-based "Today" briefing: the fallback, and the same facts the AI is given. */
export async function ruleToday(date: string): Promise<Today> {
  const day = await getDayForecast(date);
  const plan = (await rulePlan(date)) as Plan;
  if ("error" in day || "error" in plan) {
    return { source: "rules", date, headline: "No forecast available", briefing: "The forecast for today could not be loaded.", moments: [], watchouts: [] };
  }
  const am = plan.peaks[0], pm = plan.peaks[1];
  return {
    source: "rules",
    date,
    headline: `${day.weekday}: ${day.dayType}, ${day.worstWeather.toLowerCase()}`,
    briefing: `${day.weekday} is a ${day.dayType} with ${day.worstWeather.toLowerCase()} and an average of ${day.avgTempC} °C. About ${day.totalBikes.toLocaleString("en-US")} rentals are expected, with peaks near ${am.window} (about ${am.expectedBikes} an hour) and ${pm.window} (about ${pm.expectedBikes} an hour).`,
    moments: plan.actions.map((a) => ({ time: a.when, do: a.action })),
    watchouts: plan.risks.slice(0, 3),
  };
}

const hh = (h: number) => `${String(((h % 24) + 24) % 24).padStart(2, "0")}:00`;

export async function rulePlan(date: string): Promise<Plan | { error: string }> {
  const day = await getDayForecast(date);
  if ("error" in day) return { error: String(day.error) };
  // one peak before noon and one after, so adjacent hours (17:00 and 18:00) are not counted as two peaks
  const best = (rows: typeof day.hourly) => [...rows].sort((a, b) => b.forecast - a.forecast)[0];
  const am = best(day.hourly.filter((h) => h.hour < 12));
  const pm = best(day.hourly.filter((h) => h.hour >= 12));
  const first = am.hour;
  const rainy = day.worstWeather.includes("rain");
  const heavy = day.totalBikes > 6500 ? "heavy" : day.totalBikes < 3000 ? "light" : "normal";
  const actions = [
    {
      when: `Overnight, finish by ${hh(first - 2)}`,
      action: day.dayType === "working day"
        ? "Stock commuter-origin docks (residential areas) with extra bikes and free up docks at business districts."
        : "Spread bikes toward parks and leisure areas; skip the commuter pre-positioning run.",
      why: `Morning demand is forecast to reach about ${am.forecast} bikes/hour at ${hh(am.hour)}.`,
    },
    {
      when: "Midday",
      action: "Run one rebalancing sweep from full docks back toward empty ones.",
      why: "Mid-day flow reverses the morning pattern and leaves docks unevenly filled.",
    },
    {
      when: `Before ${hh(pm.hour - 1)}`,
      action: "Pre-position bikes at the evening return points.",
      why: `The evening peak is forecast at about ${pm.forecast} bikes/hour at ${hh(pm.hour)}.`,
    },
  ];
  const risks = ["This is a forecast, so actual demand will differ. Review the plan and adjust during the day."];
  if (rainy) risks.push("Rain or snow is in the forecast: demand could fall below the numbers shown.");
  if (day.basis === "live weather outlook") risks.push("Live outlook: levels reflect the 2012 system size, so treat the shape of the day as more reliable than the totals.");
  return {
    status: "PENDING_APPROVAL",
    source: "rules",
    basis: day.basis,
    date,
    headline: `${day.weekday} ${date}: ${day.totalBikes.toLocaleString("en-US")} rentals expected, ${heavy} staffing`,
    staffing: heavy as Plan["staffing"],
    peaks: [am, pm].map((p) => ({ window: hh(p.hour), expectedBikes: p.forecast })),
    actions,
    risks,
  };
}
