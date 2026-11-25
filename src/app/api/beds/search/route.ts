import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/guard";
import { apiError } from "@/lib/api";
import { BED_TYPES } from "@/lib/constants";
import { searchFreeBeds } from "@/lib/bed-queries";

const querySchema = z.object({
  type: z.enum(BED_TYPES).optional(),
  gender: z.enum(["MALE", "FEMALE"]).optional(), // the patient's sex: matches wards of that gender or ANY
  ward: z.string().min(1).optional(),
});

// Find a bed (desk): free beds, filtered. Bed labels only, no patient data.
export async function GET(req: Request) {
  const g = await guard(["DESK"]);
  if (!g.ok) return g.response;

  const sp = new URL(req.url).searchParams;
  const parsed = querySchema.safeParse({
    type: sp.get("type") || undefined,
    gender: sp.get("gender") || undefined,
    ward: sp.get("ward") || undefined,
  });
  if (!parsed.success) return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "Invalid filter");

  const { type, gender, ward } = parsed.data;
  return NextResponse.json({ beds: await searchFreeBeds({ type, gender, wardId: ward }) });
}
