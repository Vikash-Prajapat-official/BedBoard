import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ROLES } from "@/lib/constants";
import { decide, type Actor, type BedAction, type BedStatus } from "@/lib/beds";

/**
 * Property test (SPEC section 10): any random sequence of actions by any role
 * never leaves a bed OCCUPIED/DISCHARGE_PLANNED without an open admission, or
 * any other status with one. The model below mirrors what bed-service.ts does
 * to admissions for each action, using the same decide() for the rules.
 */

type Bed = { status: BedStatus; admissionId: number | null; version: number };
type World = { beds: Bed[]; open: Set<number>; next: number };

const ACTIONS: BedAction[] = [
  "reserve", "admit", "block", "unblock", "cancelReservation", "expireReservation",
  "planDischarge", "cancelPlan", "patientLeft", "markCleaned",
];
const ACTORS: Actor[] = [...ROLES, "SYSTEM"];
const BEDS = 4;

const fresh = (): World => ({ beds: Array.from({ length: BEDS }, () => ({ status: "FREE", admissionId: null, version: 0 })), open: new Set(), next: 1 });
const snapshot = (w: World) => JSON.stringify({ beds: w.beds, open: [...w.open].sort(), next: w.next });

type Step =
  | { kind: "action"; action: BedAction; bed: number; actor: Actor }
  | { kind: "transfer"; from: number; to: number; actor: Actor };

function apply(w: World, step: Step): boolean {
  if (step.kind === "transfer") {
    const src = w.beds[step.from]!;
    const dst = w.beds[step.to]!;
    if (step.from === step.to || step.actor !== "NURSE") return false;
    if (src.status !== "OCCUPIED" || src.admissionId === null) return false;
    if (dst.status !== "FREE") return false; // transfers go to a FREE bed only
    // Source leaves (to CLEANING) and the destination is admitted: both must be legal moves.
    if (!decide("patientLeft", { status: src.status, hasAdmission: true }, step.actor).ok) return false;
    if (!decide("admit", { status: dst.status, hasAdmission: dst.admissionId !== null }, step.actor).ok) return false;
    dst.status = "OCCUPIED";
    dst.admissionId = src.admissionId;
    dst.version++;
    src.status = "CLEANING";
    src.admissionId = null;
    src.version++;
    return true;
  }

  const bed = w.beds[step.bed]!;
  const d = decide(step.action, { status: bed.status, hasAdmission: bed.admissionId !== null }, step.actor);
  if (!d.ok) return false;

  if (step.action === "admit") {
    bed.admissionId = w.next++;
    w.open.add(bed.admissionId);
  } else if (step.action === "patientLeft") {
    w.open.delete(bed.admissionId!);
    bed.admissionId = null;
  }
  bed.status = d.to;
  bed.version++;
  return true;
}

function assertInvariants(w: World) {
  const held: number[] = [];
  for (const b of w.beds) {
    const needsAdmission = b.status === "OCCUPIED" || b.status === "DISCHARGE_PLANNED";
    expect(b.admissionId !== null).toBe(needsAdmission);
    if (b.admissionId !== null) {
      held.push(b.admissionId);
      expect(w.open.has(b.admissionId)).toBe(true);
    }
  }
  // Every open admission sits in exactly one bed.
  expect(new Set(held).size).toBe(held.length);
  expect([...w.open].sort()).toEqual([...held].sort());
}

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  { weight: 8, arbitrary: fc.record({ kind: fc.constant("action" as const), action: fc.constantFrom(...ACTIONS), bed: fc.nat(BEDS - 1), actor: fc.constantFrom(...ACTORS) }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("transfer" as const), from: fc.nat(BEDS - 1), to: fc.nat(BEDS - 1), actor: fc.constantFrom(...ACTORS) }) },
);

describe("state machine properties", () => {
  it("invariants hold after every step of any random sequence", () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 80 }), (steps) => {
        const w = fresh();
        for (const s of steps) apply(w, s);
        assertInvariants(w);
      }),
      { numRuns: 500 },
    );
  });

  it("a refused step changes nothing", () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 60 }), stepArb, (steps, last) => {
        const w = fresh();
        for (const s of steps) apply(w, s);
        const before = snapshot(w);
        if (!apply(w, last)) expect(snapshot(w)).toBe(before);
      }),
      { numRuns: 500 },
    );
  });

  it("only legal roles ever move a bed (no step by VIEWER changes anything)", () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 60 }), (steps) => {
        const w = fresh();
        for (const s of steps) apply(w, s);
        const before = snapshot(w);
        for (const action of ACTIONS) for (let bed = 0; bed < BEDS; bed++) apply(w, { kind: "action", action, bed, actor: "VIEWER" });
        expect(snapshot(w)).toBe(before);
      }),
      { numRuns: 200 },
    );
  });

  it("every successful change bumps the version by exactly one", () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 60 }), (steps) => {
        const w = fresh();
        let changes = 0;
        for (const s of steps) {
          const before = w.beds.reduce((n, b) => n + b.version, 0);
          if (apply(w, s)) {
            const after = w.beds.reduce((n, b) => n + b.version, 0);
            expect(after - before).toBe(s.kind === "transfer" ? 2 : 1);
            changes++;
          }
        }
        expect(w.beds.reduce((n, b) => n + b.version, 0)).toBeGreaterThanOrEqual(changes);
      }),
      { numRuns: 200 },
    );
  });
});
