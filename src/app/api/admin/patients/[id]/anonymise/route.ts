import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { apiError, clientIp } from "@/lib/api";
import { erasePatient } from "@/lib/patient-admin";

// Erase on request: name, UHID, phone and ABHA number are removed; age and sex stay for statistics.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;
  const { id } = await ctx.params;
  const r = await erasePatient(g.actor.id, id, clientIp(req));
  return r.ok ? NextResponse.json({ ok: true }) : apiError(r.status, r.code, r.message);
}
