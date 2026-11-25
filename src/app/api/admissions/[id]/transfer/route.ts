import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { parseBody } from "@/lib/api";
import { transferSchema } from "@/lib/validation";
import { transferPatient } from "@/lib/bed-service";
import { bedErrorResponse, requestOpts, toServiceActor } from "@/lib/bed-http";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(["NURSE"]);
  if (!g.ok) return g.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, transferSchema);
  if (!body.ok) return body.response;

  try {
    return NextResponse.json(await transferPatient(toServiceActor(g.actor), id, body.data, requestOpts(req)));
  } catch (e) {
    return bedErrorResponse(e);
  }
}
