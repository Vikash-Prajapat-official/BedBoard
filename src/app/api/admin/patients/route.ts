import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { searchPatients } from "@/lib/patient-admin";

// ?q=UHID or part of a name (at least 2 characters). Admin only: this returns patient names.
export async function GET(req: Request) {
  const g = await guard(["ADMIN"]);
  if (!g.ok) return g.response;
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ patients: await searchPatients(q) });
}
