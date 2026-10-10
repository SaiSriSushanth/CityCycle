import { NextResponse } from "next/server";
import { ARCHIVE_RANGE, TOOLS, TOOL_IMPL, plannableDates, rulePlan, ruleToday, getDayForecast, type Plan, type Today } from "@/lib/agent";

const todayCache = new Map<string, { at: number; payload: Record<string, unknown> }>();

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// Small in-memory limiter: the deployed URL is public and each call spends API credit.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 8;
}

type Msg = { role: string; content?: string | null; tool_calls?: any[]; tool_call_id?: string; name?: string };

async function callOpenAI(messages: Msg[], json: boolean) {
  // Project-specific name first: a machine-wide OPENAI_API_KEY would otherwise shadow .env.local.
  const key = process.env.CITYCYCLE_OPENAI_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("no-key");
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: TOOLS,
      max_tokens: 700,
      temperature: 0.2,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`openai-${res.status}`);
  return (await res.json()).choices[0].message as Msg;
}

/** Runs the tool-calling loop (max 5 rounds) and returns the final assistant text. */
async function runAgent(messages: Msg[], json: boolean): Promise<{ text: string; tools: string[] }> {
  const used: string[] = [];
  for (let i = 0; i < 5; i++) {
    const msg = await callOpenAI(messages, json && i > 0);
    if (!msg.tool_calls?.length) return { text: msg.content ?? "", tools: used };
    messages.push(msg);
    for (const call of msg.tool_calls) {
      const name = call.function.name as string;
      used.push(name);
      let out: unknown;
      try {
        out = (await TOOL_IMPL[name]?.(JSON.parse(call.function.arguments || "{}"))) ?? { error: "unknown tool" };
      } catch {
        out = { error: "bad arguments" };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out) });
    }
  }
  return { text: "", tools: used };
}

const PLANNER_SYSTEM = `You are the operations planner for CityCycle, a city bike-share operator.
Draft a rebalancing and staffing plan for ONE day. Call get_day_forecast for the date first; you may call get_drivers or get_metrics.
Rules:
- Every number must come from tool results. Never invent demand figures, and never state truck counts, crew sizes or fleet numbers; the data does not contain them. Describe actions by timing and dock type only.
- The headline must name the weekday, date and forecast total for the day.
- Be concrete about timing (hours) and about what trucks should move where (commuter-origin docks vs business-district docks on working days; parks and leisure areas on weekends).
- Mention forecast uncertainty in general terms only. Do not quote error statistics or accuracy figures.
- If the tool result has a "caveat" (live weather outlook), include it as one of the risks.
Return ONLY JSON: {"headline": string, "staffing": "light"|"normal"|"heavy", "peaks":[{"window":"HH:00","expectedBikes":number}], "actions":[{"when":string,"action":string,"why":string}], "risks":[string]}
Keep it to 3-4 actions and at most 3 risks.`;

const TODAY_SYSTEM = `You write the short "Today" briefing at the top of the operations page of CityCycle, a city bike-share operator. The reader is a dispatch manager starting their shift.
Call get_day_forecast for the date first. You may also call get_drivers.
Rules:
- Every number must come from tool results. Never invent demand figures, and never state truck counts, crew sizes or fleet numbers; the data does not contain them.
- Plain language, no jargon, no markdown. Say what kind of day it is (working day or not, weather, temperature), when the busiest hours are and how many rentals are expected, and what that means for the crews.
- The tool result has a "caveat" for live forecasts: restate it in one short watch-out.
- The headline must carry information: the weekday, the day type and the busiest time, for example "Warm working Tuesday, rush at 08:00 and 17:00". Never use a generic title such as "Briefing".
- Match actions to the day type. Only mention commuters, commuter-origin docks or business-district docks when dayType is "working day". On a weekend or holiday talk about parks, leisure areas and the midday build-up instead.
- Use dayType, the worst weather and the average temperature from the tool exactly as given.
Return ONLY JSON: {"headline": string (max 12 words), "briefing": string (2 to 3 sentences), "moments":[{"time":"HH:00","do":string}] (3 items, in time order, each saying what to do and where), "watchouts":[string] (1 to 3 items)}`;

const CHAT_SYSTEM =`You answer operations questions about the CityCycle hourly bike-demand forecast.
Use the tools for every number you quote; if the tools cannot answer, say so. Keep answers under 120 words, in plain language for an operations manager. Reply in plain text with no markdown.
Facts: answer from the live 7-day outlook for Washington, D.C. (today and the next 6 days); absolute levels reflect the 2012 system size, so say so when quoting totals. Demand drivers are predictive, not proven causes. Do not volunteer historical test statistics unless the user asks about model accuracy.`;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const body = await req.json().catch(() => ({}));

  // The Today briefing is cached, so page loads share one OpenAI call instead of each spending credit.
  if (body.mode === "today") {
    const dates = (await plannableDates()).live;
    const nyToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const date = dates.includes(nyToday) ? nyToday : dates[0];
    if (!date) return NextResponse.json({ error: "The live weather outlook is not reachable, so there is no briefing for today." }, { status: 502 });
    const hit = todayCache.get(date);
    if (hit && Date.now() - hit.at < 15 * 60_000) return NextResponse.json(hit.payload);
    if (limited(ip)) return NextResponse.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429 });

    const base = await ruleToday(date);
    let payload: Record<string, unknown>;
    try {
      const { text, tools } = await runAgent(
        [
          { role: "system", content: TODAY_SYSTEM },
          { role: "user", content: `Write today's briefing for ${date}.` },
        ],
        true,
      );
      const j = JSON.parse(text);
      if (!j.headline || !j.briefing || !Array.isArray(j.moments)) throw new Error("bad-shape");
      const today: Today = {
        source: "openai",
        date,
        headline: String(j.headline).slice(0, 160),
        briefing: String(j.briefing).slice(0, 600),
        moments: j.moments.slice(0, 4).map((m: any) => ({ time: String(m.time).slice(0, 12), do: String(m.do).slice(0, 220) })),
        watchouts: (Array.isArray(j.watchouts) ? j.watchouts : []).slice(0, 3).map((w: any) => String(w).slice(0, 280)),
      };
      payload = { today, tools, day: await getDayForecast(date) };
    } catch (e) {
      payload = { today: base, tools: [], day: await getDayForecast(date), notice: fallbackNotice(e).replace("plan", "briefing") };
    }
    todayCache.set(date, { at: Date.now(), payload });
    return NextResponse.json(payload);
  }

  if (limited(ip)) return NextResponse.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429 });

  if (body.mode === "plan") {
    const date = String(body.date ?? "");
    const avail = await plannableDates();
    if (!avail.archive.includes(date) && !avail.live.includes(date)) {
      const liveText = avail.live.length ? ` or ${avail.live[0]} to ${avail.live[avail.live.length - 1]} (live)` : "";
      return NextResponse.json({ error: `Pick a date between ${ARCHIVE_RANGE}${liveText}.` }, { status: 400 });
    }
    const base = (await rulePlan(date)) as Plan;
    try {
      const { text, tools } = await runAgent(
        [
          { role: "system", content: PLANNER_SYSTEM },
          { role: "user", content: `Plan operations for ${date}.` },
        ],
        true,
      );
      const j = JSON.parse(text);
      if (!Array.isArray(j.actions) || !j.headline) throw new Error("bad-shape");
      const plan: Plan = {
        status: "PENDING_APPROVAL",
        source: "openai",
        basis: base.basis,
        date,
        headline: String(j.headline).slice(0, 200),
        staffing: ["light", "normal", "heavy"].includes(j.staffing) ? j.staffing : base.staffing,
        peaks: base.peaks, // numbers always come from the forecast, not the model's text
        actions: j.actions.slice(0, 4).map((a: any) => ({ when: String(a.when).slice(0, 80), action: String(a.action).slice(0, 240), why: String(a.why).slice(0, 240) })),
        risks: (Array.isArray(j.risks) ? j.risks : base.risks).slice(0, 3).map((r: any) => String(r).slice(0, 200)),
      };
      return NextResponse.json({ plan, tools, day: await getDayForecast(date) });
    } catch (e) {
      return NextResponse.json({ plan: base, tools: [], day: await getDayForecast(date), notice: fallbackNotice(e) });
    }
  }

  if (body.mode === "chat") {
    const history = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const msgs: Msg[] = [{ role: "system", content: `${CHAT_SYSTEM} Today's date in Washington, D.C. is ${today}.` }];
    for (const m of history) {
      if ((m.role === "user" || m.role === "assistant") && typeof m.content === "string") msgs.push({ role: m.role, content: m.content.slice(0, 600) });
    }
    if (msgs.length < 2) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
    try {
      const { text, tools } = await runAgent(msgs, false);
      return NextResponse.json({ reply: text || "I could not answer that from the forecast data.", tools });
    } catch (e) {
      return NextResponse.json({ reply: "The explainer is offline right now. " + fallbackNotice(e), tools: [] });
    }
  }

  return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
}

function fallbackNotice(e: unknown) {
  const m = e instanceof Error ? e.message : "";
  if (m === "no-key") return "No OpenAI key is configured, so this plan was built from rules instead.";
  if (m.startsWith("openai-")) return `OpenAI returned an error (${m.slice(7)}), so this plan was built from rules instead.`;
  return "The AI response could not be used, so this plan was built from rules instead.";
}
