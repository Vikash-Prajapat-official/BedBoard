import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { apiError } from "@/lib/api";
import { getWardMap } from "@/lib/bed-queries";

// Ward map. Patient names are included only when this user may see them (own ward, desk, doctor, admin).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(["NURSE", "DESK", "DOCTOR", "ADMIN"]);
  if (!g.ok) return g.response;

  const { id } = await ctx.params;
  const map = await getWardMap({ role: g.actor.role, wardIds: g.actor.wardIds }, id);
  if (!map) return apiError(404, "NOT_FOUND", "Ward not found");
  return NextResponse.json(map);
}
