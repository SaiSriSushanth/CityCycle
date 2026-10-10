import { NextResponse } from "next/server";
import { getLiveForecast } from "@/lib/weather";

export const runtime = "nodejs";

export async function GET() {
  try {
    const hours = await getLiveForecast(7);
    return NextResponse.json({
      location: "Washington, D.C.",
      source: "Open-Meteo weather outlook",
      dates: Array.from(new Set(hours.map((h) => h.t.slice(0, 10)))),
      hours,
    });
  } catch {
    return NextResponse.json({ error: "The weather service did not respond. Try again in a minute." }, { status: 502 });
  }
}
