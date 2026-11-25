import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { parseBody } from "@/lib/api";
import { dischargeStepSchema } from "@/lib/validation";
import { dischargeStep } from "@/lib/bed-service";
import { bedErrorResponse, requestOpts, toServiceActor } from "@/lib/bed-http";

// Steps: plan, order, summary, bill, meds, left. "left" frees the bed into CLEANING.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(["NURSE", "DOCTOR"]);
  if (!g.ok) return g.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, dischargeStepSchema);
  if (!body.ok) return body.response;

  try {
    return NextResponse.json(await dischargeStep(toServiceActor(g.actor), id, body.data, requestOpts(req)));
  } catch (e) {
    return bedErrorResponse(e);
  }
}
