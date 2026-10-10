import { NextResponse } from "next/server";
import { computeOps } from "@/lib/ops";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await computeOps());
  } catch {
    return NextResponse.json({ error: "The weather service did not respond. Try again in a minute." }, { status: 502 });
  }
}
