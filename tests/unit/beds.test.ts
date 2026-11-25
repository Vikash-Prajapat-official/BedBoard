import { describe, expect, it } from "vitest";
import { ROLES, type Role } from "@/lib/constants";
import {
  BED_STATUSES,
  availableActions,
  canTransition,
  decide,
  isReservationExpired,
  reservationDeadline,
  type Actor,
  type BedAction,
  type BedStatus,
} from "@/lib/beds";

const ACTORS: Actor[] = [...ROLES, "SYSTEM"];

// SPEC section 4, "Bed state machine", written out by hand so the test does not
// just mirror the implementation. Anything not listed here must be refused.
const SPEC: Record<BedStatus, Partial<Record<BedStatus, Actor[]>>> = {
  FREE: { RESERVED: ["DESK", "NURSE"], OCCUPIED: ["DESK", "NURSE"], BLOCKED: ["NURSE", "ADMIN"] },
  RESERVED: { OCCUPIED: ["NURSE", "DESK"], FREE: ["NURSE", "DESK", "SYSTEM"] },
  OCCUPIED: { DISCHARGE_PLANNED: ["DOCTOR", "NURSE"], CLEANING: ["DOCTOR", "NURSE"] },
  DISCHARGE_PLANNED: { OCCUPIED: ["DOCTOR", "NURSE"], CLEANING: ["DOCTOR", "NURSE"] },
  CLEANING: { FREE: ["HOUSEKEEPING", "NURSE"] },
  BLOCKED: { FREE: ["NURSE", "ADMIN"] },
};

describe("canTransition: every from/to/actor combination", () => {
  const rows: [BedStatus, BedStatus, Actor, boolean][] = [];
  for (const from of BED_STATUSES)
    for (const to of BED_STATUSES)
      for (const actor of ACTORS) rows.push([from, to, actor, SPEC[from][to]?.includes(actor) ?? false]);

  it("covers 6 x 6 x 7 combinations", () => expect(rows).toHaveLength(6 * 6 * 7));

  it.each(rows)("%s -> %s by %s is %s", (from, to, actor, expected) => {
    expect(canTransition(from, to, actor)).toBe(expected);
  });
});

describe("decide: action on a bed", () => {
  const free = { status: "FREE", hasAdmission: false } as const;
  const occupied = { status: "OCCUPIED", hasAdmission: true } as const;

  it("returns the target status for a legal move", () => {
    expect(decide("reserve", free, "DESK")).toEqual({ ok: true, to: "RESERVED" });
    expect(decide("admit", { status: "RESERVED", hasAdmission: false }, "NURSE")).toEqual({ ok: true, to: "OCCUPIED" });
    expect(decide("patientLeft", { status: "DISCHARGE_PLANNED", hasAdmission: true }, "DOCTOR")).toEqual({ ok: true, to: "CLEANING" });
    expect(decide("markCleaned", { status: "CLEANING", hasAdmission: false }, "HOUSEKEEPING")).toEqual({ ok: true, to: "FREE" });
    expect(decide("expireReservation", { status: "RESERVED", hasAdmission: false }, "SYSTEM")).toEqual({ ok: true, to: "FREE" });
  });

  it("refuses a move from the wrong status", () => {
    expect(decide("admit", occupied, "NURSE")).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    expect(decide("markCleaned", free, "HOUSEKEEPING")).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    expect(decide("unblock", free, "ADMIN")).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
  });

  it("refuses the wrong role", () => {
    expect(decide("admit", free, "HOUSEKEEPING")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(decide("block", free, "DESK")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(decide("markCleaned", { status: "CLEANING", hasAdmission: false }, "DESK")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(decide("planDischarge", occupied, "VIEWER")).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("never lets a bed hold an admission and be FREE, or be OCCUPIED without one", () => {
    expect(decide("admit", { status: "FREE", hasAdmission: true }, "NURSE")).toMatchObject({ ok: false, code: "INVARIANT" });
    expect(decide("patientLeft", { status: "OCCUPIED", hasAdmission: false }, "NURSE")).toMatchObject({ ok: false, code: "INVARIANT" });
    expect(decide("planDischarge", { status: "OCCUPIED", hasAdmission: false }, "DOCTOR")).toMatchObject({ ok: false, code: "INVARIANT" });
  });
});

describe("availableActions (what the bottom sheet may show)", () => {
  const acts = (status: BedStatus, role: Actor, hasAdmission = false): (BedAction | "transfer")[] =>
    availableActions({ status, hasAdmission }, role).slice().sort();

  it("desk on a free bed can reserve or admit but not block", () => {
    expect(acts("FREE", "DESK")).toEqual(["admit", "reserve"]);
  });
  it("nurse on a free bed can admit, reserve, block", () => {
    expect(acts("FREE", "NURSE")).toEqual(["admit", "block", "reserve"]);
  });
  it("nurse on an occupied bed can plan discharge, mark left, transfer", () => {
    expect(acts("OCCUPIED", "NURSE", true)).toEqual(["patientLeft", "planDischarge", "transfer"]);
  });
  it("doctor on an occupied bed cannot transfer", () => {
    expect(acts("OCCUPIED", "DOCTOR", true)).toEqual(["patientLeft", "planDischarge"]);
  });
  it("transfer is not offered from a discharge-planned bed", () => {
    expect(acts("DISCHARGE_PLANNED", "NURSE", true)).toEqual(["cancelPlan", "patientLeft"]);
  });
  it("housekeeping only ever cleans", () => {
    expect(acts("CLEANING", "HOUSEKEEPING")).toEqual(["markCleaned"]);
    for (const s of BED_STATUSES.filter((s) => s !== "CLEANING")) expect(acts(s, "HOUSEKEEPING", s === "OCCUPIED" || s === "DISCHARGE_PLANNED")).toEqual([]);
  });
  it("viewer never gets an action", () => {
    for (const s of BED_STATUSES) expect(acts(s, "VIEWER", s === "OCCUPIED" || s === "DISCHARGE_PLANNED")).toEqual([]);
  });
  it("only admin or nurse can unblock", () => {
    const roles = ROLES.filter((r: Role) => acts("BLOCKED", r).includes("unblock"));
    expect(roles.sort()).toEqual(["ADMIN", "NURSE"]);
  });
  it("the system expiry action is never offered to a person", () => {
    for (const r of ROLES) expect(acts("RESERVED", r)).not.toContain("expireReservation");
  });
});

describe("reservation expiry", () => {
  const now = new Date("2026-11-25T10:00:00Z");

  it("deadline is now + minutes", () => {
    expect(reservationDeadline(now, 30).toISOString()).toBe("2026-11-25T10:30:00.000Z");
  });
  it("is expired exactly at the deadline and after, not before", () => {
    const until = new Date("2026-11-25T10:30:00Z");
    expect(isReservationExpired(until, new Date("2026-11-25T10:29:59Z"))).toBe(false);
    expect(isReservationExpired(until, new Date("2026-11-25T10:30:00Z"))).toBe(true);
    expect(isReservationExpired(until, new Date("2026-11-25T11:00:00Z"))).toBe(true);
  });
  it("a reservation with no deadline is treated as expired so it cannot stick forever", () => {
    expect(isReservationExpired(null, now)).toBe(true);
  });
});
