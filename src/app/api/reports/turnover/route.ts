import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { apiError } from "@/lib/api";
import { getTurnoverReport, resolveRange } from "@/lib/reports";

// Discharges per bed and average cleaning time per ward.
export async function GET(req: Request) {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;
  const sp = new URL(req.url).searchParams;
  const r = await resolveRange({ from: sp.get("from"), to: sp.get("to") });
  if (!r.ok) return apiError(400, "VALIDATION", r.message);
  return NextResponse.json(await getTurnoverReport(r.range));
}
