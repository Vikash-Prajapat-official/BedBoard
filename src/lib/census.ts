import type { BedType } from "@prisma/client";
import { db } from "./db";
import { buildCensusRows, localDate } from "./report-math";

/**
 * Midnight census (worker, 00:00 hospital time). Stores, per ward and bed type, how many beds there
 * are and how many are occupied, free and blocked at that moment. The snapshot is labelled with the
 * local date that is starting. Safe to run twice: the second run overwrites the first.
 */
export async function takeCensus(now: Date = new Date(), timeZone = "Asia/Kolkata"): Promise<{ date: string; rows: number }> {
  const groups = await db.bed.groupBy({
    by: ["wardId", "bedType", "status"],
    where: { ward: { active: true } },
    _count: { _all: true },
  });
  const rows = buildCensusRows(groups.map((g) => ({ wardId: g.wardId, bedType: g.bedType, status: g.status, count: g._count._all })));

  const date = localDate(now, timeZone);
  const day = new Date(`${date}T00:00:00.000Z`); // @db.Date: only the calendar date is stored
  await db.$transaction(
    rows.map((r) =>
      db.censusSnapshot.upsert({
        where: { date_wardId_bedType: { date: day, wardId: r.wardId, bedType: r.bedType as BedType } },
        create: { date: day, wardId: r.wardId, bedType: r.bedType as BedType, total: r.total, occupied: r.occupied, free: r.free, blocked: r.blocked },
        update: { total: r.total, occupied: r.occupied, free: r.free, blocked: r.blocked },
      }),
    ),
  );
  return { date, rows: rows.length };
}
