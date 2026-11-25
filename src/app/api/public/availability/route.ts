import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getPublicAvailability, isPublicPageEnabled } from "@/lib/public-availability";

export const dynamic = "force-dynamic";

// Public on purpose (no login) and only when PUBLIC_PAGE_ENABLED=true. Counts by bed type, nothing else.
export async function GET() {
  if (!isPublicPageEnabled()) return apiError(404, "NOT_FOUND", "Not found");
  return NextResponse.json(await getPublicAvailability(), { headers: { "cache-control": "public, max-age=60" } });
}
