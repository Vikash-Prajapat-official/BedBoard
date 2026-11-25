import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { apiError } from "@/lib/api";
import { getCensusHistory, resolveRange } from "@/lib/reports";

// Raw midnight census rows: date, ward, bed type, total, occupied, free, blocked.
export async function GET(req: Request) {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;
  const sp = new URL(req.url).searchParams;
  const r = await resolveRange({ from: sp.get("from"), to: sp.get("to") });
  if (!r.ok) return apiError(400, "VALIDATION", r.message);
  return NextResponse.json({ range: { from: r.range.from, to: r.range.to }, rows: await getCensusHistory(r.range) });
}
