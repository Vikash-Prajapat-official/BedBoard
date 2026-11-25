import { describe, expect, it } from "vitest";
import { checklistProgress, endOfLocalDay, isOverdue, occupancyPercent, waitingMinutes } from "@/lib/stats";

describe("occupancyPercent", () => {
  it("occupied / (total - blocked), rounded", () => {
    expect(occupancyPercent({ occupied: 75, total: 100, blocked: 0 })).toBe(75);
    expect(occupancyPercent({ occupied: 1, total: 3, blocked: 0 })).toBe(33);
    expect(occupancyPercent({ occupied: 2, total: 3, blocked: 0 })).toBe(67);
  });
  it("blocked beds are out of service, so they are not in the denominator", () => {
    expect(occupancyPercent({ occupied: 9, total: 12, blocked: 2 })).toBe(90);
  });
  it("is 100 when every usable bed is taken and null when there is nothing usable", () => {
    expect(occupancyPercent({ occupied: 10, total: 10, blocked: 0 })).toBe(100);
    expect(occupancyPercent({ occupied: 0, total: 0, blocked: 0 })).toBeNull();
    expect(occupancyPercent({ occupied: 0, total: 4, blocked: 4 })).toBeNull();
  });
});

describe("waitingMinutes", () => {
  const since = new Date("2026-11-25T10:00:00Z");
  it("whole minutes elapsed", () => {
    expect(waitingMinutes(since, new Date("2026-11-25T10:00:59Z"))).toBe(0);
    expect(waitingMinutes(since, new Date("2026-11-25T10:01:00Z"))).toBe(1);
    expect(waitingMinutes(since, new Date("2026-11-25T14:30:00Z"))).toBe(270);
  });
  it("never negative (clock skew)", () => {
    expect(waitingMinutes(since, new Date("2026-11-25T09:00:00Z"))).toBe(0);
  });
});

describe("isOverdue (turns red after DISCHARGE_ALERT_HOURS)", () => {
  const order = new Date("2026-11-25T08:00:00Z");
  it("not overdue before the limit, overdue exactly at and after it", () => {
    expect(isOverdue(order, new Date("2026-11-25T11:59:00Z"), 4)).toBe(false);
    expect(isOverdue(order, new Date("2026-11-25T12:00:00Z"), 4)).toBe(true);
    expect(isOverdue(order, new Date("2026-11-25T20:00:00Z"), 4)).toBe(true);
  });
  it("supports fractional hours", () => {
    expect(isOverdue(order, new Date("2026-11-25T09:30:00Z"), 1.5)).toBe(true);
    expect(isOverdue(order, new Date("2026-11-25T09:29:00Z"), 1.5)).toBe(false);
  });
  it("no order, no overdue", () => {
    expect(isOverdue(null, new Date("2026-11-25T20:00:00Z"), 4)).toBe(false);
  });
});

describe("checklistProgress (order, summary, bill, medicines)", () => {
  const t = new Date();
  const none = { dischargeOrderAt: null, summaryReadyAt: null, billClearedAt: null, medsGivenAt: null };
  it("counts finished steps out of 4", () => {
    expect(checklistProgress(none)).toEqual({ done: 0, total: 4 });
    expect(checklistProgress({ ...none, dischargeOrderAt: t })).toEqual({ done: 1, total: 4 });
    expect(checklistProgress({ ...none, dischargeOrderAt: t, billClearedAt: t })).toEqual({ done: 2, total: 4 });
    expect(checklistProgress({ dischargeOrderAt: t, summaryReadyAt: t, billClearedAt: t, medsGivenAt: t })).toEqual({ done: 4, total: 4 });
  });
});

describe("endOfLocalDay (start of the next day in the hospital's time zone)", () => {
  it("Asia/Kolkata (UTC+5:30, no DST)", () => {
    // 15:30 IST on 25 Nov -> midnight IST 26 Nov = 18:30 UTC on 25 Nov
    expect(endOfLocalDay(new Date("2026-11-25T10:00:00Z"), "Asia/Kolkata").toISOString()).toBe("2026-11-25T18:30:00.000Z");
    // 00:30 IST on 26 Nov is already "tomorrow" in UTC terms the other way round
    expect(endOfLocalDay(new Date("2026-11-25T19:00:00Z"), "Asia/Kolkata").toISOString()).toBe("2026-11-26T18:30:00.000Z");
  });
  it("is exclusive: exactly at local midnight belongs to the new day", () => {
    expect(endOfLocalDay(new Date("2026-11-25T18:30:00Z"), "Asia/Kolkata").toISOString()).toBe("2026-11-26T18:30:00.000Z");
  });
  it("UTC", () => {
    expect(endOfLocalDay(new Date("2026-11-25T10:00:00Z"), "UTC").toISOString()).toBe("2026-11-26T00:00:00.000Z");
  });
  it("handles a daylight-saving change (New York, 8 March 2026)", () => {
    // Clocks go forward at 02:00 on 8 March, so midnight on 9 March is already EDT (UTC-4).
    expect(endOfLocalDay(new Date("2026-03-08T12:00:00Z"), "America/New_York").toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });
});
