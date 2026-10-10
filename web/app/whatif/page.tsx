"use client";
import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/Shell";
import { LineChart, type Point } from "@/components/LineChart";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEATHER = [
  { v: 1, t: "Clear or partly cloudy" },
  { v: 2, t: "Mist or cloud" },
  { v: 3, t: "Light rain or snow" },
  { v: 4, t: "Heavy rain or snow" },
];
type Today = { date: string; workingday: boolean; holiday: boolean; tempMin: number; tempMax: number };
type DayType = "today" | "working" | "off";
const fmt = (n: number) => n.toLocaleString("en-US");
const sign = (n: number) => `${n > 0 ? "+" : ""}${n}`;
const nyHour = () => Number(new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false })) % 24;
const TICKS = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => ({ x: h, text: `${String(h).padStart(2, "0")}h` }));

export default function WhatIf() {
  // live mode: adjustments relative to today's live forecast
  const [mode, setMode] = useState<"loading" | "live" | "manual">("loading");
  const [dayType, setDayType] = useState<DayType>("today");
  const [weatherOverride, setWeatherOverride] = useState(0);
  const [tempDelta, setTempDelta] = useState(0);
  const [humDelta, setHumDelta] = useState(0);
  const [windDelta, setWindDelta] = useState(0);
  // manual mode (only when the live outlook is unreachable)
  const [workingDay, setWorkingDay] = useState(true);
  const [month, setMonth] = useState(7);
  const [weather, setWeather] = useState(1);
  const [tempC, setTempC] = useState(20);
  const [humidity, setHumidity] = useState(55);
  const [wind, setWind] = useState(12);

  const [hr, setHr] = useState(8);
  const [hourly, setHourly] = useState<number[] | null>(null);
  const [live, setLive] = useState<number[] | null>(null);
  const [today, setToday] = useState<Today | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => { setHr(nyHour()); }, []);

  useEffect(() => {
    const ctl = new AbortController();
    const body = mode === "manual"
      ? { workingDay, month, weather, tempC, humidity, wind }
      : { live: true, dayType, weather: weatherOverride, tempDelta, humDelta, windDelta };
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/predict", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
        const d = await r.json();
        if (!r.ok) {
          if (mode !== "manual") { setMode("manual"); setMonth(new Date().getMonth() + 1); return; }
          throw new Error(d.error);
        }
        setHourly(d.hourly); setErr("");
        if (mode !== "manual") { setLive(d.live); setToday(d.today); if (mode === "loading") setMode("live"); }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setErr("The prediction service did not respond. Try again.");
      }
    }, 120);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [mode, dayType, weatherOverride, tempDelta, humDelta, windDelta, workingDay, month, weather, tempC, humidity, wind]);

  const reset = () => { setDayType("today"); setWeatherOverride(0); setTempDelta(0); setHumDelta(0); setWindDelta(0); };
  const changed = dayType !== "today" || weatherOverride !== 0 || tempDelta !== 0 || humDelta !== 0 || windDelta !== 0;

  const points: Point[] = useMemo(
    () => (hourly ?? []).map((b, i) => ({ x: i, label: `${String(i).padStart(2, "0")}:00`, scenario: b, ...(live ? { live: live[i] } : {}) })),
    [hourly, live],
  );
  const series = [
    { key: "scenario", label: mode === "live" ? "Your scenario" : "Predicted rentals", color: "var(--accent)", width: 2.6 },
    ...(live ? [{ key: "live", label: "Today's live forecast", color: "var(--baseline)", width: 2, dash: "5 4" }] : []),
  ];
  const now = hourly?.[hr];
  const liveAt = live?.[hr];
  const diff = now !== undefined && liveAt ? ((now - liveAt) / liveAt) * 100 : null;
  const total = hourly?.reduce((a, b) => a + b, 0);
  const liveTotal = live?.reduce((a, b) => a + b, 0);
  const todayType = today ? (today.holiday ? "holiday" : today.workingday ? "working day" : "weekend") : "";

  return (
    <>
      <Topbar title="What-if demand">
        <span className="badge"><i />{mode === "live" ? "Built on today's live forecast" : mode === "manual" ? "Live weather unavailable: manual mode" : "Connecting to today's forecast"}</span>
        {mode === "live" && <button className="btn ghost" onClick={reset} disabled={!changed}>Reset to live forecast</button>}
      </Topbar>
      <div className="layout">
        <div className="col">
          {mode === "manual" && <p className="note" role="status">The live weather outlook is not reachable, so these controls set one set of conditions for the whole day.</p>}
          <section className="card">
            {mode !== "manual" ? (
              <div className="form-grid">
                <label className="field" style={{ gridColumn: "1 / -1" }}><span>Day type{today ? ` (today is a ${todayType})` : ""}</span>
                  <div className="pills" role="group" aria-label="Day type">
                    <button className="pill" aria-pressed={dayType === "today"} onClick={() => setDayType("today")}>Like today</button>
                    <button className="pill" aria-pressed={dayType === "working"} onClick={() => setDayType("working")}>Working day</button>
                    <button className="pill" aria-pressed={dayType === "off"} onClick={() => setDayType("off")}>Weekend or holiday</button>
                  </div>
                </label>
                <label className="field"><span>Weather</span>
                  <select className="select" value={weatherOverride} onChange={(e) => setWeatherOverride(Number(e.target.value))}>
                    <option value={0}>As forecast today</option>
                    {WEATHER.map((w) => <option key={w.v} value={w.v}>{w.t} all day</option>)}
                  </select>
                </label>
                <label className="field"><span>Temperature: {sign(tempDelta)} °C{today ? ` (forecast ${Math.round(today.tempMin)} to ${Math.round(today.tempMax)} °C)` : ""}</span><input className="range" type="range" min={-15} max={15} value={tempDelta} onChange={(e) => setTempDelta(Number(e.target.value))} /></label>
                <label className="field"><span>Humidity: {sign(humDelta)} points</span><input className="range" type="range" min={-30} max={30} value={humDelta} onChange={(e) => setHumDelta(Number(e.target.value))} /></label>
                <label className="field"><span>Wind: {sign(windDelta)}</span><input className="range" type="range" min={-15} max={15} value={windDelta} onChange={(e) => setWindDelta(Number(e.target.value))} /></label>
              </div>
            ) : (
              <div className="form-grid">
                <label className="field" style={{ gridColumn: "1 / -1" }}><span>Day type</span>
                  <div className="pills" role="group" aria-label="Day type">
                    <button className="pill" aria-pressed={workingDay} onClick={() => setWorkingDay(true)}>Working day</button>
                    <button className="pill" aria-pressed={!workingDay} onClick={() => setWorkingDay(false)}>Weekend or holiday</button>
                  </div>
                </label>
                <label className="field"><span>Month</span>
                  <select className="select" value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                </label>
                <label className="field"><span>Weather</span>
                  <select className="select" value={weather} onChange={(e) => setWeather(Number(e.target.value))}>{WEATHER.map((w) => <option key={w.v} value={w.v}>{w.t}</option>)}</select>
                </label>
                <label className="field"><span>Temperature: {tempC} °C</span><input className="range" type="range" min={-5} max={38} value={tempC} onChange={(e) => setTempC(Number(e.target.value))} /></label>
                <label className="field"><span>Humidity: {humidity}%</span><input className="range" type="range" min={10} max={100} value={humidity} onChange={(e) => setHumidity(Number(e.target.value))} /></label>
                <label className="field"><span>Wind: {wind}</span><input className="range" type="range" min={0} max={50} value={wind} onChange={(e) => setWind(Number(e.target.value))} /></label>
              </div>
            )}
          </section>

          <section className="card">
            <h2>Predicted rentals across the day</h2>
            <p className="sub">{mode === "live" ? "Your scenario next to today's live forecast. Nudge the weather or day type and watch the gap open up. Use the hour slider to read off one value." : "Use the hour slider to read off one value."}</p>
            {hourly ? <LineChart data={points} height={280} xTicks={TICKS} area="scenario" series={series} /> : <div className="empty">{err || "Scoring scenario"}</div>}
            <label className="field" style={{ marginTop: 10 }}><span>Hour: {String(hr).padStart(2, "0")}:00</span><input className="range" type="range" min={0} max={23} value={hr} onChange={(e) => setHr(Number(e.target.value))} /></label>
          </section>
        </div>

        <aside className="aside">
          <section className="card" style={{ padding: 20 }}>
            <p className="note">{mode === "live" ? "Your scenario" : "Prediction"} at {String(hr).padStart(2, "0")}:00</p>
            <div className="hero-num">{now !== undefined ? fmt(now) : "..."}</div>
            <p className="note" style={{ marginTop: 8 }}>rentals in that hour</p>
            {liveAt !== undefined && now !== undefined && (
              <p style={{ marginTop: 14 }}>
                <span className={`tag ${diff !== null && diff >= 0 ? "good" : "warn"}`}>
                  {diff !== null ? `${diff >= 0 ? "+" : ""}${diff.toFixed(0)}% ` : ""}vs today's live forecast for this hour ({fmt(liveAt)})
                </span>
              </p>
            )}
            {total !== undefined && (
              <p className="note" style={{ marginTop: 14 }}>
                About {fmt(total)} rentals across the whole day{liveTotal !== undefined ? `, against ${fmt(liveTotal)} in today's live forecast` : ""}.
              </p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
