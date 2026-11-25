import { unstable_cache } from "next/cache";
import { db } from "./db";
import { BED_TYPES } from "./constants";

export type PublicAvailability = {
  hospitalName: string | null;
  timeZone: string;
  updatedAt: string;
  free: number;
  total: number;
  types: { type: string; free: number; total: number }[];
};

/** The public page is off unless the hospital switches it on in .env (SPEC section 6, item 10). */
export const isPublicPageEnabled = () => process.env.PUBLIC_PAGE_ENABLED === "true";

/**
 * Counts by bed type and nothing else: no ward names, no patients, no bed labels. "Total" is beds in
 * service (blocked beds are out of use, so they are not counted), so the numbers do not overpromise.
 */
export async function computePublicAvailability(now: Date = new Date()): Promise<PublicAvailability> {
  const [hospital, groups] = await Promise.all([
    db.hospital.findFirst({ select: { name: true, timezone: true } }),
    db.bed.groupBy({ by: ["bedType", "status"], where: { ward: { active: true } }, _count: { _all: true } }),
  ]);

  const types = BED_TYPES.map((type) => {
    const rows = groups.filter((g) => g.bedType === type && g.status !== "BLOCKED");
    return {
      type,
      free: rows.filter((g) => g.status === "FREE").reduce((n, g) => n + g._count._all, 0),
      total: rows.reduce((n, g) => n + g._count._all, 0),
    };
  }).filter((t) => t.total > 0);

  return {
    hospitalName: hospital?.name ?? null,
    timeZone: hospital?.timezone ?? "Asia/Kolkata",
    updatedAt: now.toISOString(),
    free: types.reduce((n, t) => n + t.free, 0),
    total: types.reduce((n, t) => n + t.total, 0),
    types,
  };
}

/** Same answer for everyone for 60 seconds, so a flood of visitors costs the database one query a minute. */
export const getPublicAvailability = unstable_cache(() => computePublicAvailability(), ["public-availability"], { revalidate: 60 });
