import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { apiError } from "@/lib/api";
import { getOccupancyReport, resolveRange } from "@/lib/reports";

// ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: last 30 days). From the midnight census snapshots.
export async function GET(req: Request) {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;
  const sp = new URL(req.url).searchParams;
  const r = await resolveRange({ from: sp.get("from"), to: sp.get("to") });
  if (!r.ok) return apiError(400, "VALIDATION", r.message);
  return NextResponse.json(await getOccupancyReport(r.range));
}
