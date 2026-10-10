"use client";
import { useEffect, useState } from "react";
import { Topbar } from "./Shell";
import { icons } from "./icons";
import { LineChart, type Point } from "./LineChart";
import TodayPanel from "./TodayPanel";

type Ops = {
  date: string; weekday: string; working: boolean;
  hour: { peaks: { time: string; bikes: number }[]; action: string; todayLine: { hr: number; today: number; tomorrow: number | null }[]; tomorrowLabel: string | null };
  temperature: { min: number; max: number; avg: number; base: number; scenarios: { delta: number; total: number }[] };
  dayType: { working: boolean; flippedTotal: number; base: number };
  week: { date: string; label: string; total: number; staffing: string; working: boolean; holiday: boolean; weather: string; tempMin: number; tempMax: number }[];
  headsUp: string[];
  updated: string;
};

const fmt = (n: number) => n.toLocaleString("en-US");
const signed = (n: number) => `${n >= 0 ? "+" : "-"}${fmt(Math.abs(n))}`;
const TICKS = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => ({ x: h, text: `${String(h).padStart(2, "0")}h` }));

export default function OpsView() {
  const [ops, setOps] = useState<Ops | null>(null);
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let live = true;
    setError("");
    fetch("/api/ops").then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not load the live outlook.");
      if (live) setOps(d);
    }).catch((e) => live && setError(e instanceof Error ? e.message : "Could not load the live outlook."));
    return () => { live = false; };
  }, [tries]);

  const updated = ops ? new Date(ops.updated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";

  return (
    <>
      <Topbar title="Ops guidance">
        <span className="badge"><i />{ops ? `Live outlook for Washington, D.C. Loaded ${updated}` : "Connecting to the live outlook"}</span>
      </Topbar>
      <div className="layout">
        <div className="col">
          <TodayPanel />

          {error && (
            <div className="empty" role="alert">
              {error}
              <div style={{ marginTop: 10 }}><button className="btn ghost" onClick={() => setTries((n) => n + 1)}>Try again</button></div>
            </div>
          )}
          {!ops && !error && <div className="card"><div className="skeleton" role="status">Reading the live outlook</div></div>}

          {ops && <Cards ops={ops} />}
        </div>

        <aside className="aside">
          {ops && (
            <>
              <section className="card">
                <div className="head">Next 7 days</div>
                <div className="body">
                  {ops.week.map((d) => (
                    <div className="score" key={d.date}>
                      <span className="name">{d.label}</span>
                      <span className="val">{fmt(d.total)}</span>
                      <span className="kind" style={{ gridColumn: "1 / -1", display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span className={`tag ${d.staffing === "heavy" ? "good" : d.staffing === "light" ? "warn" : ""}`}>{d.staffing} staffing</span>
                        <span className="tag">{d.holiday ? "holiday" : d.working ? "working day" : "weekend"}</span>
                        <span className="tag">{d.tempMin} to {d.tempMax} °C, {d.weather.toLowerCase()}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="card">
                <div className="head">Heads-up</div>
                <div className="body">
                  {ops.headsUp.length === 0 && <div className="check">{icons.check}<span>No holidays, rain or cold snaps in the next 7 days.</span></div>}
                  {ops.headsUp.map((h, i) => <div className="check" key={i}>{icons.check}<span>{h}</span></div>)}
                  <div className="check">{icons.check}<span>These are predictive links, not proven causes. Test any new rule on a few docks first.</span></div>
                </div>
              </section>
            </>
          )}
        </aside>
      </div>
    </>
  );
}

function Cards({ ops }: { ops: Ops }) {
  const { hour, temperature: t, dayType: d } = ops;
  const pts: Point[] = hour.todayLine.map((h) => ({ x: h.hr, label: `${String(h.hr).padStart(2, "0")}:00`, today: h.today, ...(h.tomorrow !== null ? { tomorrow: h.tomorrow } : {}) }));
  const series = [
    { key: "today", label: "Today", color: "var(--accent)", width: 2.4 },
    ...(hour.tomorrowLabel ? [{ key: "tomorrow", label: hour.tomorrowLabel, color: "var(--baseline)", width: 2, dash: "5 4" }] : []),
  ];

  const colder = t.scenarios.find((s) => s.delta === -5)!.total - t.base;
  const warmer = t.scenarios.find((s) => s.delta === 5)!.total - t.base;
  const maxScenario = Math.max(...t.scenarios.map((s) => s.total));
  const tempAction = t.avg < 10
    ? "Cold day: trim truck runs and crew, and keep bikes at the busiest docks only."
    : t.avg < 20
      ? "Mild day: run the normal schedule and watch the afternoon for a warm-up."
      : "Warm day: staff fully and add a midday rebalancing sweep, since riders will stay out longer.";
  const other = d.working ? "weekend or holiday" : "working day";
  const diffPct = Math.round(((d.flippedTotal - d.base) / d.base) * 100);

  return (
    <>
      <article className="row">
        <div className="ico">{icons.forecast}</div>
        <div>
          <h3>Hour of day <small>when to move bikes today</small></h3>
          <p>{ops.weekday} is a {ops.working ? "working day" : "weekend or holiday"}. {ops.working
            ? `The model expects two commute peaks: ${hour.peaks[0].time} (about ${fmt(hour.peaks[0].bikes)} rentals) and ${hour.peaks[1].time} (about ${fmt(hour.peaks[1].bikes)}).`
            : `The model expects a single midday build-up peaking at ${hour.peaks[0].time} (about ${fmt(hour.peaks[0].bikes)} rentals).`}</p>
          <div className="tags">{hour.peaks.map((p) => <span className="tag good" key={p.time}>Peak {p.time}: about {fmt(p.bikes)}</span>)}</div>
          <div className="action"><b>Do this:</b> {hour.action}</div>
        </div>
        <div className="share"><b>{hour.peaks[0].time}</b><span>first peak today</span></div>
        <div className="evidence"><LineChart data={pts} series={series} xTicks={TICKS} height={210} /></div>
      </article>

      <article className="row">
        <div className="ico">{icons.whatif}</div>
        <div>
          <h3>Temperature <small>what today's weather does</small></h3>
          <p>Today runs from {t.min} to {t.max} °C, averaging {t.avg} °C. With everything else unchanged, the model expects about {fmt(Math.abs(colder))} {colder <= 0 ? "fewer" : "more"} rentals over the day if it were 5 °C colder, and {fmt(Math.abs(warmer))} {warmer >= 0 ? "more" : "fewer"} if it were 5 °C warmer.</p>
          <div className="tags"><span className="tag">{signed(colder)} at -5 °C</span><span className="tag good">{signed(warmer)} at +5 °C</span></div>
          <div className="action"><b>Do this:</b> {tempAction}</div>
        </div>
        <div className="share"><b>{t.avg} °C</b><span>average today</span></div>
        <div className="evidence">
          <div className="bars" role="img" aria-label="Predicted rentals for today at different temperatures">
            {t.scenarios.map((s) => (
              <div className="bar" key={s.delta} style={{ gridTemplateColumns: "96px 1fr 64px" }}>
                <span>{s.delta === 0 ? "Forecast" : `${s.delta > 0 ? "+" : ""}${s.delta} °C`}</span>
                <i style={{ width: `${(s.total / maxScenario) * 100}%`, background: s.delta === 0 ? "var(--accent)" : "var(--baseline)" }} />
                <b>{fmt(s.total)}</b>
              </div>
            ))}
          </div>
        </div>
      </article>

      <article className="row">
        <div className="ico">{icons.ops}</div>
        <div>
          <h3>Working day or not <small>which playbook to use</small></h3>
          <p>Today is a {d.working ? "working day" : "weekend or holiday"}. With the same weather, the model expects about {fmt(Math.abs(d.flippedTotal - d.base))} {d.flippedTotal >= d.base ? "more" : "fewer"} rentals ({diffPct >= 0 ? "+" : ""}{diffPct}%) if it were a {other}.</p>
          <div className="tags"><span className="tag good">{d.working ? "Commuter playbook" : "Weekend playbook"}</span></div>
          <div className="action"><b>Do this:</b> {d.working
            ? "Use the commuter playbook: residential docks stocked before the morning peak, business-district docks stocked before the evening one."
            : "Use the weekend playbook: skip the commuter run and focus on parks and leisure areas."}</div>
        </div>
        <div className="share"><b>{fmt(d.base)}</b><span>rentals expected today</span></div>
        <div className="evidence">
          <div className="bars" role="img" aria-label="Predicted rentals as forecast and with the other day type">
            {[{ l: d.working ? "Working day" : "Weekend or holiday", v: d.base, c: "var(--accent)" }, { l: d.working ? "If weekend" : "If working day", v: d.flippedTotal, c: "var(--baseline)" }].map((b) => (
              <div className="bar" key={b.l} style={{ gridTemplateColumns: "140px 1fr 64px" }}>
                <span>{b.l}</span>
                <i style={{ width: `${(b.v / Math.max(d.base, d.flippedTotal)) * 100}%`, background: b.c }} />
                <b>{fmt(b.v)}</b>
              </div>
            ))}
          </div>
        </div>
      </article>
    </>
  );
}
