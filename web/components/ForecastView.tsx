"use client";
import { useEffect, useMemo, useState } from "react";
import { LineChart, type Point } from "./LineChart";
import { Topbar } from "./Shell";
import { icons } from "./icons";
import { summary, fmt, pct, type ForecastRow } from "@/lib/data";

const RANGES = [
  { key: "week", label: "1 week", hours: 24 * 7 },
  { key: "month", label: "1 month", hours: 24 * 30 },
  { key: "all", label: "Full test period", hours: Infinity },
  { key: "live", label: "Next 7 days (live)", hours: Infinity },
] as const;

type LiveHour = { t: string; hr: number; workingday: number; weather: number; tempC: number; model: number };
const LIVE_SERIES = [{ key: "model", label: "Live forecast", color: "var(--accent)", width: 2.4 }];
const WEATHER_TAG: Record<number, string> = { 1: "Clear", 2: "Cloudy", 3: "Rain or snow", 4: "Heavy rain or snow" };

const SERIES = [
  { key: "actual", label: "Actual", color: "var(--actual)", width: 2 },
  { key: "model", label: "Our forecast", color: "var(--accent)", width: 2.4 },
  { key: "baseline", label: "Same hour last week", color: "var(--baseline)", dash: "5 4", width: 1.8 },
];

const DAY = 864e5;
const fmtDate = (d: Date, long = false) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(long ? { year: "numeric" } : {}), timeZone: "UTC" });

export default function ForecastView() {
  const [rows, setRows] = useState<ForecastRow[] | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("week");
  const [start, setStart] = useState(0);

  useEffect(() => {
    fetch("/data/forecast.json").then((r) => r.json()).then((d: ForecastRow[]) => {
      setRows(d);
      const i = d.findIndex((r) => r.t.startsWith("2012-09-10"));
      setStart(i >= 0 ? i : 0);
    });
  }, []);

  const [live, setLive] = useState<LiveHour[] | null>(null);
  const [liveErr, setLiveErr] = useState("");

  useEffect(() => {
    if (range !== "live" || live) return;
    fetch("/api/live").then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Live forecast unavailable");
      setLive(d.hours); setLiveErr("");
    }).catch((e) => setLiveErr(e instanceof Error ? e.message : "Live forecast unavailable"));
  }, [range, live]);

  const liveView = useMemo(() => {
    if (!live) return null;
    const toTs = (t: string) => Date.parse(t + ":00Z");
    const pts: Point[] = live.map((h) => ({
      x: toTs(h.t),
      label: new Date(toTs(h.t)).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", timeZone: "UTC" }) + `, ${h.tempC} °C, ${WEATHER_TAG[h.weather]}`,
      model: h.model,
    }));
    const ticks = Array.from(new Set(live.map((h) => h.t.slice(0, 10)))).map((d) => ({ x: Date.parse(d + "T12:00:00Z"), text: new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" }) }));
    const days = ticks.map((tk) => {
      const d = new Date(tk.x).toISOString().slice(0, 10);
      const rows = live.filter((h) => h.t.startsWith(d));
      return { date: d, label: tk.text, total: rows.reduce((a, r) => a + r.model, 0), weather: Math.max(...rows.map((r) => r.weather)), temp: rows.reduce((a, r) => a + r.tempC, 0) / rows.length, working: rows[0].workingday === 1 };
    });
    return { pts, ticks, days, maxTotal: Math.max(...days.map((d) => d.total)) };
  }, [live]);

  const hours = RANGES.find((r) => r.key === range)!.hours;
  const maxStart = rows ? Math.max(0, rows.length - (Number.isFinite(hours) ? hours : rows.length)) : 0;
  const s = Math.min(start, maxStart);

  const { points, ticks, title } = useMemo(() => {
    if (!rows) return { points: [] as Point[], ticks: [], title: "" };
    const slice = Number.isFinite(hours) ? rows.slice(s, s + hours) : rows;
    const toTs = (t: string) => Date.parse(t + ":00Z");
    if (!Number.isFinite(hours)) {
      // daily averages keep ~180 points readable
      const byDay = new Map<string, ForecastRow[]>();
      for (const r of slice) { const k = r.t.slice(0, 10); (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(r); }
      const pts: Point[] = [...byDay].map(([k, rs]) => {
        const avg = (f: (r: ForecastRow) => number) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
        return { x: Date.parse(k + "T12:00:00Z"), label: fmtDate(new Date(k + "T12:00:00Z"), true) + " (daily average)", actual: avg((r) => r.actual), model: avg((r) => r.model), baseline: avg((r) => r.baseline) };
      });
      const tk = pts.filter((_, i) => i % 30 === 0).map((p) => ({ x: p.x, text: fmtDate(new Date(p.x)) }));
      return { points: pts, ticks: tk, title: "Daily average rentals, Jul to Dec 2012" };
    }
    const pts: Point[] = slice.map((r) => ({
      x: toTs(r.t),
      label: new Date(toTs(r.t)).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", timeZone: "UTC" }),
      actual: r.actual, model: r.model, baseline: r.baseline,
    }));
    const step = range === "week" ? DAY : DAY * 5;
    const tk: { x: number; text: string }[] = [];
    if (pts.length) {
      const first = new Date(pts[0].x); first.setUTCHours(0, 0, 0, 0);
      for (let t = first.getTime() + (range === "week" ? 0 : DAY); t <= pts[pts.length - 1].x; t += step)
        tk.push({ x: t, text: range === "week" ? new Date(t).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" }) : fmtDate(new Date(t)) });
    }
    return { points: pts, ticks: tk, title: pts.length ? `${fmtDate(new Date(pts[0].x), true)} to ${fmtDate(new Date(pts[pts.length - 1].x), true)}` : "" };
  }, [rows, s, hours, range]);

  const gbm = summary.models.find((m) => m.key === "gbm")!;
  const lw = summary.models.find((m) => m.key === "last_week")!;
  const maxMae = Math.max(...summary.models.map((m) => m.mae));

  return (
    <>
      <Topbar title="Hourly demand forecast">
        <div className="pills" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.key} className="pill" aria-pressed={range === r.key} onClick={() => setRange(r.key)}>{r.label}</button>
          ))}
        </div>
        {range === "live"
          ? <span className="badge"><i />Live weather outlook, refreshed every 15 minutes</span>
          : <span className="badge"><i />Held-out: {summary.split.test_from} to {summary.split.test_to}</span>}
      </Topbar>

      <div className="layout">
        <div className="col">
          <div className="stats">
            <div className="stat">
              <span>Average miss per hour</span>
              <b>{fmt(gbm.mae)}<small>bikes</small></b>
              <em>{pct(summary.improvement_vs_last_week)} lower than last week's copy ({fmt(lw.mae)})</em>
            </div>
            <div className="stat">
              <span>Share of demand explained</span>
              <b>{pct(gbm.r2, 1)}</b>
              <span>R² on months the model never saw</span>
            </div>
            <div className="stat">
              <span>Error at commute peaks</span>
              <b>{fmt(summary.peak_mae)}<small>bikes</small></b>
              <span>on about {fmt(summary.peak_mean_demand)} rentals per hour</span>
            </div>
          </div>

          {range === "live" && (
            <>
              <section className="card">
                <h2>Live outlook for Washington, D.C.</h2>
                <p className="sub">Predicted rentals per hour for the next 7 days, from the live weather outlook. Hover for the weather behind each hour.</p>
                {liveView ? (
                  <LineChart data={liveView.pts} series={LIVE_SERIES} xTicks={liveView.ticks} height={300} area="model" />
                ) : (
                  <div className="empty" role={liveErr ? "alert" : undefined}>{liveErr || "Fetching the weather outlook"}</div>
                )}
                <p className="note" style={{ marginTop: 8 }}>The model learned from 2011 and 2012 rentals, so totals reflect the 2012 system size. Trust the shape of each day (when the peaks fall) more than the exact counts.</p>
              </section>
              {liveView && (
                <section className="card">
                  <h2>Day by day</h2>
                  <p className="sub">Total predicted rentals, with the day type and weather.</p>
                  <div className="bars" style={{ marginTop: 12 }}>
                    {liveView.days.map((d) => (
                      <div className="bar" key={d.date} style={{ gridTemplateColumns: "64px 1fr 150px" }}>
                        <span>{d.label}</span>
                        <i style={{ width: `${(d.total / liveView.maxTotal) * 100}%` }} />
                        <b style={{ fontSize: 12 }}>{fmt(d.total)} · {d.working ? "work" : "off"} · {Math.round(d.temp)} °C · {WEATHER_TAG[d.weather]}</b>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          {range !== "live" && (
          <section className="card">
            <h2>{title || "Loading forecast"}</h2>
            <p className="sub">Rentals per hour. Hover the chart to compare actual demand with both forecasts.</p>
            {rows ? <LineChart data={points} series={SERIES} xTicks={ticks} height={320} area="model" /> : <div className="empty">Loading forecast</div>}
            {Number.isFinite(hours) ? null : <p className="note">Averaged by day so six months stay readable. Pick a week or month for the hourly view.</p>}
            {Number.isFinite(hours) && rows && (
              <label className="field" style={{ marginTop: 10 }}>
                <span>Window start: {fmtDate(new Date(Date.parse(rows[s].t + ":00Z")), true)}</span>
                <input className="range" type="range" min={0} max={maxStart} step={24} value={s} onChange={(e) => setStart(Number(e.target.value))} aria-label="Window start" />
              </label>
            )}
          </section>
          )}
        </div>

        <aside className="aside">
          <section className="card">
            <div className="head">Model scoreboard<span className="badge" style={{ padding: "3px 10px" }}>MAE, lower is better</span></div>
            <div className="body">
              {summary.models.map((m) => (
                <div key={m.key} className={`score ${m.key === summary.champion ? "champ" : ""}`}>
                  <span className="name">{m.name}</span>
                  <span className="val">{fmt(m.mae, 1)}</span>
                  <div className="meter"><i style={{ width: `${(m.mae / maxMae) * 100}%` }} /></div>
                  <span className="kind">{m.kind === "baseline" ? "Naive baseline" : m.key === summary.champion ? "Champion, used in this app" : "Candidate model"} · R² {m.r2.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="card">
            <div className="head">How the test is kept honest</div>
            <div className="body">
              <div className="check">{icons.check}<span>Trained on {summary.split.train_from} to {summary.split.train_to}, tested on the months after.</span></div>
              <div className="check">{icons.check}<span>Casual and registered riders are excluded. They add up to the answer.</span></div>
              <div className="check">{icons.check}<span>A random split would report an error of {fmt(summary.traps.random_split.mae)} bikes, which is too good to be true.</span></div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
