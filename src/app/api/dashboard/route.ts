import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { getDashboard } from "@/lib/dashboard";

// Counts only, so every logged-in role (including the casualty TV's viewer login) may read it.
export async function GET() {
  const g = await guard("any");
  if (!g.ok) return g.response;
  return NextResponse.json(await getDashboard());
}
