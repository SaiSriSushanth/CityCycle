"use client";
import { useEffect, useRef, useState } from "react";
import { Topbar } from "@/components/Shell";
import { LineChart, type Point } from "@/components/LineChart";
import { fmt } from "@/lib/data";

type Plan = {
  status: "PENDING_APPROVAL";
  source: "openai" | "rules";
  basis: "historical test months" | "live weather outlook";
  date: string;
  headline: string;
  staffing: string;
  peaks: { window: string; expectedBikes: number }[];
  actions: { when: string; action: string; why: string }[];
  risks: string[];
};
type Day = { hourly: { hour: number; forecast: number }[]; weekday: string; worstWeather: string; avgTempC: number; totalBikes: number };
type Chat = { role: "user" | "assistant"; content: string; tools?: string[] };

const SUGGESTIONS = [
  "When are the busiest hours today?",
  "Which day this week needs the most staff?",
  "How would 5 degrees colder change tomorrow?",
  "Is this weekend busier than today?",
];

export default function AgentPage() {
  const [liveDates, setLiveDates] = useState<string[]>([]);
  const [liveState, setLiveState] = useState<"loading" | "ready" | "down">("loading");
  const [liveDate, setLiveDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [day, setDay] = useState<Day | null>(null);
  const [notice, setNotice] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [decision, setDecision] = useState<"PENDING_APPROVAL" | "APPROVED" | "REJECTED">("PENDING_APPROVAL");
  const [error, setError] = useState("");

  const [chat, setChat] = useState<Chat[]>([]);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/live").then((r) => r.json()).then((d) => {
      if (Array.isArray(d.dates) && d.dates.length) {
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
        setLiveDates(d.dates); setLiveDate(d.dates.includes(today) ? today : d.dates[0]); setLiveState("ready");
      } else setLiveState("down");
    }).catch(() => setLiveState("down"));
  }, []);

  const planDate = liveDate;

  async function draft() {
    setBusy(true); setError(""); setNotice(""); setDecision("PENDING_APPROVAL");
    try {
      const r = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "plan", date: planDate }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Request failed");
      setPlan(d.plan); setDay(d.day); setNotice(d.notice ?? ""); setTools(d.tools ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally { setBusy(false); }
  }

  async function ask(text: string) {
    const t = text.trim();
    if (!t || asking) return;
    const next: Chat[] = [...chat, { role: "user", content: t }];
    setChat(next); setQ(""); setAsking(true);
    try {
      const r = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "chat", messages: next.map(({ role, content }) => ({ role, content })) }) });
      const d = await r.json();
      setChat([...next, { role: "assistant", content: d.reply ?? d.error ?? "No answer.", tools: d.tools }]);
    } catch {
      setChat([...next, { role: "assistant", content: "The explainer did not respond. Try again." }]);
    } finally {
      setAsking(false);
      setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
  }

  const pts: Point[] = (day?.hourly ?? []).map((h) => ({ x: h.hour, label: `${String(h.hour).padStart(2, "0")}:00`, forecast: h.forecast }));
  const ticks = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => ({ x: h, text: `${String(h).padStart(2, "0")}h` }));
  const chip = decision === "PENDING_APPROVAL" ? "pending" : decision === "APPROVED" ? "ok" : "no";

  return (
    <>
      <Topbar title="AI agents"><span className="badge"><i />Agents draft. People approve.</span></Topbar>
      <div className="layout">
        <div className="col">
          <section className="card">
            <h2>Ops planner</h2>
            <p className="sub">Pick a day from the live 7-day outlook. The agent reads the forecast through tools and drafts a dispatch plan for you to approve.</p>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
              <label className="field"><span>Planning day</span>
                <select className="select" value={liveDate} disabled={liveState !== "ready"} onChange={(e) => setLiveDate(e.target.value)}>
                  {liveDates.map((d) => <option key={d} value={d}>{new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}</option>)}
                </select>
              </label>
              <button className="btn solid" onClick={draft} disabled={busy || !planDate}>{busy ? "Drafting plan" : "Draft plan"}</button>
            </div>
            {liveState === "down" && <p role="alert" style={{ color: "var(--bad)", marginTop: 12 }}>The live weather outlook is not reachable, so there is nothing to plan from. Reload the page in a minute.</p>}
            {error && <p role="alert" style={{ color: "var(--bad)", marginTop: 12 }}>{error}</p>}
          </section>

          {plan && day && (
            <section className="card" aria-live="polite">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span className={`chip ${chip}`}>{decision}</span>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span className="tag">Live weather outlook</span>
                  <span className="tag">{plan.source === "openai" ? "Drafted by OpenAI from forecast tools" : "Built from rules"}</span>
                </span>
              </div>
              <h2 style={{ fontSize: 20, marginTop: 12 }}>{plan.headline}</h2>
              {notice && <p className="note" style={{ marginTop: 6 }}>{notice}</p>}
              <div className="tags" style={{ marginTop: 10 }}>
                <span className="tag good">Staffing: {plan.staffing}</span>
                {plan.peaks.map((p) => <span className="tag" key={p.window}>Peak {p.window}: about {fmt(p.expectedBikes)} bikes</span>)}
                <span className="tag">{day.worstWeather}, avg {day.avgTempC} °C</span>
              </div>
              <LineChart data={pts} height={200} xTicks={ticks} area="forecast" series={[{ key: "forecast", label: "Forecast rentals per hour", color: "var(--accent)", width: 2.4 }]} />
              <div className="plan-actions">
                {plan.actions.map((a, i) => (
                  <div key={i}><div className="when">{a.when}</div><div>{a.action}</div><div className="why">{a.why}</div></div>
                ))}
              </div>
              {plan.risks.length > 0 && <ul className="note" style={{ paddingLeft: 18, margin: "0 0 14px" }}>{plan.risks.map((r, i) => <li key={i}>{r}</li>)}</ul>}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn solid" onClick={() => setDecision("APPROVED")} disabled={decision !== "PENDING_APPROVAL"}>Approve plan</button>
                <button className="btn ghost" onClick={() => setDecision("REJECTED")} disabled={decision !== "PENDING_APPROVAL"}>Reject</button>
                {decision !== "PENDING_APPROVAL" && <button className="btn ghost" onClick={() => setDecision("PENDING_APPROVAL")}>Undo</button>}
                <span className="note">Approving records your decision here only. Nothing is dispatched automatically.</span>
              </div>
              {tools.length > 0 && <p className="note" style={{ marginTop: 12 }}>Tools used: {Array.from(new Set(tools)).join(", ")}</p>}
            </section>
          )}
        </div>

        <aside className="aside">
          <section className="card" style={{ padding: 20 }}>
            <h2>Ask the forecast</h2>
            <p className="sub">Answers come from the model's own numbers, not from memory.</p>
            <div className="chat" style={{ marginTop: 12 }} aria-live="polite">
              {chat.length === 0 && <div className="suggest">{SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>}
              {chat.map((m, i) => (
                <div key={i} className={`msg ${m.role === "user" ? "user" : "bot"}`}>
                  {m.content}
                  {m.tools && m.tools.length > 0 && <small>Used {Array.from(new Set(m.tools)).join(", ")}</small>}
                </div>
              ))}
              {asking && <div className="msg bot">Checking the forecast</div>}
              <div ref={end} />
            </div>
            <form className="chatbar" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about demand" aria-label="Question" maxLength={300} />
              <button className="btn solid" disabled={asking || !q.trim()}>Ask</button>
            </form>
          </section>
        </aside>
      </div>
    </>
  );
}
