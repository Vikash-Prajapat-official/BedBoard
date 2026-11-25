import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { parseBody } from "@/lib/api";
import { statusSchema } from "@/lib/validation";
import { changeStatus } from "@/lib/bed-service";
import { bedErrorResponse, requestOpts, toServiceActor } from "@/lib/bed-http";

// Cleaned, block, unblock, cancel a reservation, cancel a discharge plan.
// The route only checks "is this a staff role"; the state machine decides who may do which move.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(["ADMIN", "NURSE", "DESK", "DOCTOR", "HOUSEKEEPING"]);
  if (!g.ok) return g.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, statusSchema);
  if (!body.ok) return body.response;

  try {
    return NextResponse.json(await changeStatus(toServiceActor(g.actor), id, body.data, requestOpts(req)));
  } catch (e) {
    return bedErrorResponse(e);
  }
}
