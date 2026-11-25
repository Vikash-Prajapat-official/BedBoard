/**
 * Bed state machine (SPEC section 4). Pure: no database, no clock, no I/O, so it
 * is cheap to test exhaustively. bed-service.ts is the only code that applies a
 * result of decide() to the database, inside one transaction.
 */
import type { Role } from "./constants";

export const BED_STATUSES = ["FREE", "RESERVED", "OCCUPIED", "DISCHARGE_PLANNED", "CLEANING", "BLOCKED"] as const;
export type BedStatus = (typeof BED_STATUSES)[number];

/** A person's role, or SYSTEM for the worker (reservation expiry). */
export type Actor = Role | "SYSTEM";

/** From -> To -> who may make that move. Anything missing is refused. */
export const TRANSITIONS: Record<BedStatus, Partial<Record<BedStatus, readonly Actor[]>>> = {
  FREE: {
    RESERVED: ["DESK", "NURSE"],
    OCCUPIED: ["DESK", "NURSE"],
    BLOCKED: ["NURSE", "ADMIN"],
  },
  RESERVED: {
    OCCUPIED: ["NURSE", "DESK"],
    FREE: ["NURSE", "DESK", "SYSTEM"], // cancel or expiry
  },
  OCCUPIED: {
    DISCHARGE_PLANNED: ["DOCTOR", "NURSE"],
    CLEANING: ["DOCTOR", "NURSE"], // patient left
  },
  DISCHARGE_PLANNED: {
    OCCUPIED: ["DOCTOR", "NURSE"], // plan cancelled
    CLEANING: ["DOCTOR", "NURSE"], // patient left
  },
  CLEANING: { FREE: ["HOUSEKEEPING", "NURSE"] },
  BLOCKED: { FREE: ["NURSE", "ADMIN"] },
};

export function canTransition(from: BedStatus, to: BedStatus, actor: Actor): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

export type BedAction =
  | "reserve"
  | "admit"
  | "block"
  | "unblock"
  | "cancelReservation"
  | "expireReservation"
  | "planDischarge"
  | "cancelPlan"
  | "patientLeft"
  | "markCleaned";

/** What each named action does to a bed, and whether the bed must hold an admission. */
export const ACTIONS: Record<BedAction, { from: readonly BedStatus[]; to: BedStatus; hasAdmission: boolean }> = {
  reserve: { from: ["FREE"], to: "RESERVED", hasAdmission: false },
  admit: { from: ["FREE", "RESERVED"], to: "OCCUPIED", hasAdmission: false },
  block: { from: ["FREE"], to: "BLOCKED", hasAdmission: false },
  unblock: { from: ["BLOCKED"], to: "FREE", hasAdmission: false },
  cancelReservation: { from: ["RESERVED"], to: "FREE", hasAdmission: false },
  expireReservation: { from: ["RESERVED"], to: "FREE", hasAdmission: false },
  planDischarge: { from: ["OCCUPIED"], to: "DISCHARGE_PLANNED", hasAdmission: true },
  cancelPlan: { from: ["DISCHARGE_PLANNED"], to: "OCCUPIED", hasAdmission: true },
  patientLeft: { from: ["OCCUPIED", "DISCHARGE_PLANNED"], to: "CLEANING", hasAdmission: true },
  markCleaned: { from: ["CLEANING"], to: "FREE", hasAdmission: false },
};

export type BedFacts = { status: BedStatus; hasAdmission: boolean };

export type Decision =
  | { ok: true; to: BedStatus }
  | { ok: false; code: "INVALID_TRANSITION" | "FORBIDDEN" | "INVARIANT" };

/**
 * Is `actor` allowed to do `action` to a bed in this state? Also guards the core
 * invariant: a bed holds an admission exactly when it is OCCUPIED or DISCHARGE_PLANNED.
 */
export function decide(action: BedAction, bed: BedFacts, actor: Actor): Decision {
  const a = ACTIONS[action];
  if (!a.from.includes(bed.status)) return { ok: false, code: "INVALID_TRANSITION" };
  if (!canTransition(bed.status, a.to, actor)) return { ok: false, code: "FORBIDDEN" };
  if (bed.hasAdmission !== a.hasAdmission) return { ok: false, code: "INVARIANT" };
  return { ok: true, to: a.to };
}

/** Actions a person could take on this bed, for the bottom sheet. Excludes the worker-only expiry. */
export function availableActions(bed: BedFacts, actor: Actor): (BedAction | "transfer")[] {
  const out: (BedAction | "transfer")[] = (Object.keys(ACTIONS) as BedAction[]).filter(
    (action) => action !== "expireReservation" && decide(action, bed, actor).ok,
  );
  // Transfer = the patient leaves this bed and is admitted to a free one. Nurses only, from OCCUPIED
  // (a pending discharge plan is cancelled first).
  if (bed.status === "OCCUPIED" && bed.hasAdmission && actor === "NURSE") out.push("transfer");
  return out;
}

export function reservationDeadline(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * 60_000);
}

/** A reservation with no deadline counts as expired, so it can never get stuck. */
export function isReservationExpired(reservedUntil: Date | null, now: Date): boolean {
  return reservedUntil === null || reservedUntil.getTime() <= now.getTime();
}
