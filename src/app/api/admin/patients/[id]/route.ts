import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { apiError, clientIp, parseBody } from "@/lib/api";
import { patientPatchSchema } from "@/lib/validation";
import { correctPatient } from "@/lib/patient-admin";

// Correct a mistake in a patient's name, age, sex or phone.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;
  const { id } = await ctx.params;
  const body = await parseBody(req, patientPatchSchema);
  if (!body.ok) return body.response;

  const r = await correctPatient(g.actor.id, id, body.data, clientIp(req));
  return r.ok ? NextResponse.json({ patient: r.data }) : apiError(r.status, r.code, r.message);
}
