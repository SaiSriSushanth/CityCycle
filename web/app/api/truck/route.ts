import { NextResponse } from "next/server";
import { codeOk, codeRequired, configured, currentContext, insertEntry, recentEntries, todaySummary } from "@/lib/truck";

export const runtime = "nodejs";

// The deployed URL is public, so limit how fast one address can write.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 12;
}

const unavailable = () => NextResponse.json({ error: "The truck log database is not set up on this server." }, { status: 503 });

export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    if (url.searchParams.get("context")) {
      const { hour: h, date, weekdayName } = await currentContext();
      return NextResponse.json({
        codeRequired: codeRequired(),
        configured: configured(),
        context: { date, weekday: weekdayName, hr: h.hr, tempC: h.tempC, humidity: Math.round(h.hum), wind: h.wind, weather: h.weather, workingday: h.workingday === 1, holiday: h.holiday === 1, forecastRentals: h.model },
      });
    }
    if (!configured()) return unavailable();
    const [recent, today] = await Promise.all([recentEntries(15), todaySummary()]);
    return NextResponse.json({ recent, today });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return NextResponse.json({ error: m === "no-weather" || m.startsWith("weather") ? "The weather service did not respond. Try again in a minute." : "Could not read the truck log." }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!configured()) return unavailable();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "Too many entries from this device. Wait a minute and try again." }, { status: 429 });

  const b = await req.json().catch(() => ({}));
  if (!codeOk(b.code)) return NextResponse.json({ error: "That crew code is not right." }, { status: 401 });

  const bikes = Number(b.bikes);
  if (!Number.isInteger(bikes) || bikes < 1 || bikes > 2_000_000_000) {
    return NextResponse.json({ error: "Enter a whole number of bikes, 1 or more." }, { status: 400 });
  }
  const truckRaw = typeof b.truckId === "string" ? b.truckId.trim() : "";
  if (truckRaw && !/^[A-Za-z0-9 _-]{1,20}$/.test(truckRaw)) {
    return NextResponse.json({ error: "Truck name can use letters, numbers, spaces, dashes and underscores, up to 20 characters." }, { status: 400 });
  }

  try {
    const saved = await insertEntry(bikes, truckRaw || null);
    return NextResponse.json({ saved });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    const msg = m === "no-weather" || m.startsWith("weather")
      ? "The weather service did not respond, so nothing was saved. Try again in a minute."
      : "The entry could not be saved. Try again.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
