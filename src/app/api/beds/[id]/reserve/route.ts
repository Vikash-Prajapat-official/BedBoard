import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { parseBody } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { reserveSchema } from "@/lib/validation";
import { reserveBed } from "@/lib/bed-service";
import { bedErrorResponse, requestOpts, toServiceActor } from "@/lib/bed-http";

// Reserve a free bed for RESERVATION_MINUTES. The worker releases it if nobody is admitted.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(["DESK"]);
  if (!g.ok) return g.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, reserveSchema);
  if (!body.ok) return body.response;

  try {
    const opts = { ...requestOpts(req), reservationMinutes: getEnv().RESERVATION_MINUTES };
    return NextResponse.json(await reserveBed(toServiceActor(g.actor), id, body.data.version, opts));
  } catch (e) {
    return bedErrorResponse(e);
  }
}
