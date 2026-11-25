import { describe, expect, it } from "vitest";
import {
  average,
  buildCensusRows,
  censusOccupancy,
  lengthOfStayHours,
  localDate,
  pairDurations,
  retentionCutoff,
  turnoverRate,
} from "@/lib/report-math";
import { startOfLocalDate } from "@/lib/stats";

describe("buildCensusRows (midnight census maths)", () => {
  const g = (wardId: string, bedType: string, status: string, count: number) => ({ wardId, bedType, status, count });

  it("occupied counts OCCUPIED and DISCHARGE_PLANNED; total counts every status", () => {
    const rows = buildCensusRows([
      g("w1", "GENERAL", "FREE", 4),
      g("w1", "GENERAL", "OCCUPIED", 10),
      g("w1", "GENERAL", "DISCHARGE_PLANNED", 3),
      g("w1", "GENERAL", "RESERVED", 1),
      g("w1", "GENERAL", "CLEANING", 2),
      g("w1", "GENERAL", "BLOCKED", 1),
    ]);
    expect(rows).toEqual([{ wardId: "w1", bedType: "GENERAL", total: 21, occupied: 13, free: 4, blocked: 1 }]);
  });

  it("one row per ward and bed type, sorted", () => {
    const rows = buildCensusRows([g("w2", "ICU", "FREE", 1), g("w1", "OXYGEN", "OCCUPIED", 2), g("w1", "GENERAL", "FREE", 3), g("w1", "GENERAL", "OCCUPIED", 1)]);
    expect(rows.map((r) => `${r.wardId}/${r.bedType}`)).toEqual(["w1/GENERAL", "w1/OXYGEN", "w2/ICU"]);
    expect(rows[0]).toMatchObject({ total: 4, occupied: 1, free: 3 });
  });

  it("nothing in, nothing out", () => expect(buildCensusRows([])).toEqual([]));

  it("reserved and cleaning beds are in the total but neither free nor occupied", () => {
    const [r] = buildCensusRows([g("w", "COT", "RESERVED", 2), g("w", "COT", "CLEANING", 3)]);
    expect(r).toMatchObject({ total: 5, occupied: 0, free: 0, blocked: 0 });
  });
});

describe("censusOccupancy", () => {
  it("sums rows, ignores blocked beds in the denominator", () => {
    expect(censusOccupancy([
      { wardId: "a", bedType: "GENERAL", total: 10, occupied: 6, free: 3, blocked: 1 },
      { wardId: "b", bedType: "ICU", total: 10, occupied: 9, free: 0, blocked: 1 },
    ])).toBe(83); // 15 / 18
  });
  it("null when empty", () => expect(censusOccupancy([])).toBeNull());
});

describe("localDate", () => {
  it("gives the calendar date in the hospital's time zone", () => {
    expect(localDate(new Date("2026-11-25T18:29:00Z"), "Asia/Kolkata")).toBe("2026-11-25");
    expect(localDate(new Date("2026-11-25T18:30:00Z"), "Asia/Kolkata")).toBe("2026-11-26");
    expect(localDate(new Date("2026-11-25T18:30:00Z"), "UTC")).toBe("2026-11-25");
  });
});

describe("startOfLocalDate", () => {
  it("is the instant a local date begins", () => {
    expect(startOfLocalDate("2026-11-26", "Asia/Kolkata").toISOString()).toBe("2026-11-25T18:30:00.000Z");
    expect(startOfLocalDate("2026-03-09", "America/New_York").toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(startOfLocalDate("2026-11-25", "UTC").toISOString()).toBe("2026-11-25T00:00:00.000Z");
  });
});

describe("length of stay", () => {
  it("hours between admitted and left", () => {
    expect(lengthOfStayHours(new Date("2026-11-20T08:00:00Z"), new Date("2026-11-22T08:30:00Z"))).toBe(48.5);
  });
  it("never negative", () => {
    expect(lengthOfStayHours(new Date("2026-11-22T00:00:00Z"), new Date("2026-11-21T00:00:00Z"))).toBe(0);
  });
  it("average of nothing is null, otherwise the mean", () => {
    expect(average([])).toBeNull();
    expect(average([24, 48])).toBe(36);
    expect(average([1, 2, 2])).toBeCloseTo(1.6667, 3);
  });
});

describe("turnoverRate (discharges per bed)", () => {
  it("rounds to 2 decimals and is null with no beds", () => {
    expect(turnoverRate(30, 20)).toBe(1.5);
    expect(turnoverRate(1, 3)).toBe(0.33);
    expect(turnoverRate(0, 10)).toBe(0);
    expect(turnoverRate(5, 0)).toBeNull();
  });
});

describe("pairDurations (minutes a bed spent in one status before the next)", () => {
  const ev = (bedId: string, toStatus: string, iso: string) => ({ bedId, toStatus, at: new Date(iso) });

  it("pairs each CLEANING with the next FREE of the same bed", () => {
    const r = pairDurations(
      [
        ev("b1", "CLEANING", "2026-11-25T10:00:00Z"),
        ev("b1", "FREE", "2026-11-25T10:25:00Z"),
        ev("b1", "CLEANING", "2026-11-25T14:00:00Z"),
        ev("b1", "FREE", "2026-11-25T14:10:00Z"),
      ],
      "CLEANING",
      "FREE",
    );
    expect(r.map((x) => x.minutes)).toEqual([25, 10]);
    expect(r[0]!.endedAt.toISOString()).toBe("2026-11-25T10:25:00.000Z");
  });
  it("keeps beds apart and copes with unsorted input", () => {
    const r = pairDurations(
      [ev("b2", "FREE", "2026-11-25T11:00:00Z"), ev("b1", "FREE", "2026-11-25T10:30:00Z"), ev("b2", "CLEANING", "2026-11-25T10:00:00Z"), ev("b1", "CLEANING", "2026-11-25T10:00:00Z")],
      "CLEANING",
      "FREE",
    );
    expect(r.map((x) => [x.bedId, x.minutes]).sort()).toEqual([["b1", 30], ["b2", 60]]);
  });
  it("ignores a CLEANING that has not finished yet and a FREE with no CLEANING before it", () => {
    expect(pairDurations([ev("b1", "FREE", "2026-11-25T09:00:00Z"), ev("b1", "CLEANING", "2026-11-25T10:00:00Z")], "CLEANING", "FREE")).toEqual([]);
  });
  it("a second CLEANING restarts the clock (the first was never finished)", () => {
    const r = pairDurations([ev("b1", "CLEANING", "2026-11-25T10:00:00Z"), ev("b1", "CLEANING", "2026-11-25T10:20:00Z"), ev("b1", "FREE", "2026-11-25T10:30:00Z")], "CLEANING", "FREE");
    expect(r.map((x) => x.minutes)).toEqual([10]);
  });
});

describe("retentionCutoff", () => {
  it("is now minus RETENTION_DAYS", () => {
    expect(retentionCutoff(new Date("2026-11-25T00:00:00Z"), 365).toISOString()).toBe("2025-11-25T00:00:00.000Z");
    expect(retentionCutoff(new Date("2026-11-25T12:00:00Z"), 1).toISOString()).toBe("2026-11-24T12:00:00.000Z");
  });
});
