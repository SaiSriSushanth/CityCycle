"use client";
import { useCallback, useEffect, useState } from "react";
import { Topbar } from "@/components/Shell";
import { icons } from "@/components/icons";

type Context = { date: string; weekday: string; hr: number; tempC: number; humidity: number; wind: number; weather: number; workingday: boolean; holiday: boolean; forecastRentals: number };
type Entry = { id: number; logged_at: string; hr: number; bikes_moved: number; truck_id: string | null; temp_c: number; weathersit: number; workingday: number };
const WEATHER: Record<number, string> = { 1: "Clear", 2: "Cloudy", 3: "Rain or snow", 4: "Heavy rain or snow" };
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export default function Trucks() {
  const [bikes, setBikes] = useState(10);
  const [truckId, setTruckId] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [ctx, setCtx] = useState<Context | null>(null);
  const [ctxErr, setCtxErr] = useState("");
  const [recent, setRecent] = useState<Entry[]>([]);
  const [today, setToday] = useState<{ entries: number; bikes: number } | null>(null);
  const [dbOff, setDbOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ bikes: number; hr: number; tempC: number; weather: number } | null>(null);

  const loadLog = useCallback(async () => {
    try {
      const r = await fetch("/api/truck");
      const d = await r.json();
      if (r.status === 503) { setDbOff(true); return; }
      if (r.ok) { setRecent(d.recent); setToday(d.today); setDbOff(false); }
    } catch { /* the log is a convenience; entering bikes still works */ }
  }, []);

  useEffect(() => {
    try { setCode(localStorage.getItem("citycycle-crew-code") ?? ""); setTruckId(localStorage.getItem("citycycle-truck") ?? ""); } catch { /* private window */ }
    fetch("/api/truck?context=1").then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setCtx(d.context); setNeedCode(d.codeRequired); if (!d.configured) setDbOff(true);
    }).catch((e) => setCtxErr(e instanceof Error ? e.message : "Could not load the current weather."));
    loadLog();
  }, [loadLog]);

  const step = (n: number) => setBikes((b) => Math.max(1, b + n));

  async function submit() {
    setBusy(true); setError(""); setDone(null);
    try {
      const r = await fetch("/api/truck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bikes, truckId, code }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "The entry could not be saved.");
      try { localStorage.setItem("citycycle-crew-code", code); localStorage.setItem("citycycle-truck", truckId); } catch { /* ignore */ }
      setDone({ bikes: d.saved.bikes_moved, hr: d.saved.hr, tempC: d.saved.temp_c, weather: d.saved.weathersit });
      loadLog();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The entry could not be saved.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <Topbar title="Truck log">
        <span className="badge"><i />Type the number of bikes. We fill in the rest.</span>
      </Topbar>
      <div className="layout">
        <div className="col">
          <section className="card">
            <h2>How many bikes did you just move?</h2>
            <p className="sub">One entry per trip. Time, weather and day type are added automatically.</p>

            <div className="stepper" role="group" aria-label="Number of bikes">
              <button className="btn ghost step-btn" onClick={() => step(-1)} aria-label="One fewer bike">-</button>
              <input className="stepper-num" inputMode="numeric" aria-label="Bikes moved" value={bikes}
                onChange={(e) => setBikes(Math.min(9_999_999, Number(e.target.value.replace(/\D/g, ""))))} />
              <button className="btn ghost step-btn" onClick={() => step(1)} aria-label="One more bike">+</button>
            </div>
            <div className="suggest" style={{ justifyContent: "center", marginBottom: 14 }}>
              {[-5, 5, 10].map((n) => <button key={n} onClick={() => step(n)}>{n > 0 ? "+" : ""}{n}</button>)}
            </div>

            <div className="form-grid">
              <label className="field"><span>Truck name (optional)</span>
                <input className="input" value={truckId} maxLength={20} placeholder="For example Truck 3" onChange={(e) => setTruckId(e.target.value)} />
              </label>
              {needCode && (
                <label className="field"><span>Crew code</span>
                  <input className="input" type="password" value={code} autoComplete="off" onChange={(e) => setCode(e.target.value)} />
                </label>
              )}
            </div>

            <button className="btn solid big" style={{ marginTop: 16, width: "100%" }} onClick={submit} disabled={busy || dbOff || bikes < 1 || !ctx}>
              {busy ? "Saving" : `Log ${bikes} bike${bikes === 1 ? "" : "s"}`}
            </button>
            {dbOff && <p role="alert" style={{ color: "var(--bad)", marginTop: 10 }}>The truck log database is not set up on this server, so entries cannot be saved yet.</p>}
            {error && <p role="alert" style={{ color: "var(--bad)", marginTop: 10 }}>{error}</p>}
            {done && (
              <div className="action" role="status" style={{ marginTop: 14 }}>
                <b>Logged {done.bikes} bike{done.bikes === 1 ? "" : "s"}</b> at {hh(done.hr)}, {Math.round(done.tempC)} °C, {WEATHER[done.weather].toLowerCase()}.
              </div>
            )}
          </section>

          <section className="card">
            <h2>Saved with this entry</h2>
            <p className="sub">Filled in from the live weather and the calendar. You don't type any of it.</p>
            {ctx ? (
              <div className="tags" style={{ marginTop: 12 }}>
                <span className="tag">{ctx.weekday}, {ctx.date}</span>
                <span className="tag">{hh(ctx.hr)}</span>
                <span className="tag">{ctx.holiday ? "Holiday" : ctx.workingday ? "Working day" : "Weekend"}</span>
                <span className="tag">{ctx.tempC} °C</span>
                <span className="tag">{WEATHER[ctx.weather]}</span>
                <span className="tag">Humidity {ctx.humidity}%</span>
                <span className="tag">Wind {Math.round(ctx.wind)}</span>
                <span className="tag good">Forecast for this hour: about {ctx.forecastRentals} rentals</span>
              </div>
            ) : (
              <div className="empty" role={ctxErr ? "alert" : undefined} style={{ marginTop: 12 }}>{ctxErr || "Reading the current weather"}</div>
            )}
          </section>
        </div>

        <aside className="aside">
          <section className="card" style={{ padding: 20 }}>
            <p className="note">Bikes moved today</p>
            <div className="hero-num">{today ? today.bikes.toLocaleString("en-US") : "..."}</div>
            <p className="note" style={{ marginTop: 8 }}>{today ? `${today.entries} ${today.entries === 1 ? "entry" : "entries"} from all trucks` : "Loading the log"}</p>
          </section>
          <section className="card">
            <div className="head">Latest entries</div>
            <div className="body">
              {recent.length === 0 && <div className="check">{icons.log}<span>No entries yet. The first one will appear here.</span></div>}
              {recent.map((e) => (
                <div className="score" key={e.id}>
                  <span className="name">{e.bikes_moved} bike{e.bikes_moved === 1 ? "" : "s"}</span>
                  <span className="val" style={{ fontWeight: 500, color: "var(--muted)" }}>{time(e.logged_at)}</span>
                  <span className="kind" style={{ gridColumn: "1 / -1" }}>{e.truck_id ? `${e.truck_id} · ` : ""}{Math.round(e.temp_c)} °C, {WEATHER[e.weathersit].toLowerCase()}, {e.workingday ? "working day" : "weekend or holiday"}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
