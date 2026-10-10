"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LineChart, type Point } from "./LineChart";

type Today = {
  source: "openai" | "rules";
  date: string;
  headline: string;
  briefing: string;
  moments: { time: string; do: string }[];
  watchouts: string[];
};
type Day = { hourly: { hour: number; forecast: number }[]; dayType: string; worstWeather: string; avgTempC: number; totalBikes: number };

const TICKS = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => ({ x: h, text: `${String(h).padStart(2, "0")}h` }));

export default function TodayPanel() {
  const [today, setToday] = useState<Today | null>(null);
  const [day, setDay] = useState<Day | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let live = true;
    setError("");
    fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "today" }) })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "The briefing could not be loaded.");
        if (live) { setToday(d.today); setDay(d.day); setNotice(d.notice ?? ""); }
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "The briefing could not be loaded."));
    return () => { live = false; };
  }, [tries]);

  const pts: Point[] = (day?.hourly ?? []).map((h) => ({ x: h.hour, label: `${String(h.hour).padStart(2, "0")}:00`, forecast: h.forecast }));
  const dateLabel = today ? new Date(today.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }) : "";

  return (
    <section className="card today" aria-live="polite">
      <div className="today-head">
        <h2>Today</h2>
        {today && (
          <span className="tags">
            <span className="tag">{dateLabel}</span>
            <span className="tag">Live weather outlook</span>
            <span className="tag">{today.source === "openai" ? "Written by OpenAI from forecast tools" : "Built from rules"}</span>
          </span>
        )}
      </div>

      {!today && !error && <div className="skeleton" role="status">Reading today's forecast</div>}
      {error && (
        <div className="empty" role="alert">
          {error}
          <div style={{ marginTop: 10 }}><button className="btn ghost" onClick={() => setTries((n) => n + 1)}>Try again</button></div>
        </div>
      )}

      {today && (
        <>
          <p className="today-title">{today.headline}</p>
          <p className="today-brief">{today.briefing}</p>
          {notice && <p className="note">{notice}</p>}
          {day && <LineChart data={pts} height={190} xTicks={TICKS} area="forecast" series={[{ key: "forecast", label: "Forecast rentals per hour, today", color: "var(--accent)", width: 2.4 }]} />}
          <div className="plan-actions">
            {today.moments.map((m, i) => (
              <div key={i}><div className="when">{m.time}</div><div>{m.do}</div></div>
            ))}
          </div>
          {today.watchouts.length > 0 && <ul className="note" style={{ paddingLeft: 18, margin: "0 0 12px" }}>{today.watchouts.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          <Link href="/agent" className="btn">Draft a full plan for approval</Link>
        </>
      )}
    </section>
  );
}
