import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { parseBody } from "@/lib/api";
import { admitSchema } from "@/lib/validation";
import { admitPatient } from "@/lib/bed-service";
import { bedErrorResponse, requestOpts, toServiceActor } from "@/lib/bed-http";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(["NURSE", "DESK"]);
  if (!g.ok) return g.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, admitSchema);
  if (!body.ok) return body.response;

  try {
    return NextResponse.json(await admitPatient(toServiceActor(g.actor), id, body.data, requestOpts(req)), { status: 201 });
  } catch (e) {
    return bedErrorResponse(e);
  }
}
