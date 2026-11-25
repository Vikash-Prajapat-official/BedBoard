import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Role } from "@/lib/constants";

/**
 * Runs against a real PostgreSQL (TEST_DATABASE_URL), because the guarantees here
 * (exactly one concurrent winner, one transaction per change) are database behaviour.
 * Skipped when TEST_DATABASE_URL is not set, so plain `npm test` stays database-free.
 */
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

type Service = typeof import("@/lib/bed-service");
type Db = typeof import("@/lib/db").db;

run("bed service against PostgreSQL", () => {
  let svc: Service;
  let db: Db;
  const sfx = Date.now().toString(36);
  let wardId: string;
  let otherWardId: string;
  const actors = {} as Record<"nurseA" | "nurseB" | "nurseNoWard" | "desk" | "doctor" | "housekeeping" | "admin", { id: string; role: Role; wardIds: string[] }>;
  let seq = 0;

  const phone = () => `9${String(Date.now() + seq++).slice(-9)}`;
  const uhid = () => `T${sfx}-${seq++}`;
  const patient = (u = uhid()) => ({ uhid: u, name: "Test Patient", age: 40, sex: "FEMALE" as const });
  const admit = (a: keyof typeof actors, bedId: string, version = 0, u?: string) =>
    svc.admitPatient(actors[a], bedId, { version, admittingDoctor: "Dr T", patient: patient(u) });
  const newBed = (wId = wardId) => db.bed.create({ data: { wardId: wId, label: `B${seq++}-${sfx}`, bedType: "GENERAL" } });
  const bedOf = (id: string) => db.bed.findUniqueOrThrow({ where: { id } });
  const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof svc.BedError ? `${e.status} ${e.code}` : String(e)));

  beforeAll(async () => {
    svc = await import("@/lib/bed-service");
    db = (await import("@/lib/db")).db;
    wardId = (await db.ward.create({ data: { name: `T-${sfx}` } })).id;
    otherWardId = (await db.ward.create({ data: { name: `T2-${sfx}` } })).id;
    const mk = async (name: string, role: Role, wardIds: string[] = []) => {
      const u = await db.user.create({ data: { name, phone: phone(), passwordHash: "x", role, wards: { create: wardIds.map((w) => ({ wardId: w })) } } });
      return { id: u.id, role, wardIds };
    };
    actors.nurseA = await mk("nurseA", "NURSE", [wardId]);
    actors.nurseB = await mk("nurseB", "NURSE", [wardId]);
    actors.nurseNoWard = await mk("nurseNoWard", "NURSE", [otherWardId]);
    actors.desk = await mk("desk", "DESK");
    actors.doctor = await mk("doctor", "DOCTOR");
    actors.housekeeping = await mk("hk", "HOUSEKEEPING");
    actors.admin = await mk("admin", "ADMIN");
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  describe("concurrency (SPEC section 10)", () => {
    it("two nurses admit to the same free bed at once: exactly one wins, the other gets 409", async () => {
      for (let round = 0; round < 10; round++) {
        const bed = await newBed();
        const a = uhid();
        const b = uhid();
        const results = await Promise.all([code(admit("nurseA", bed.id, 0, a)), code(admit("nurseB", bed.id, 0, b))]);

        expect(results.filter((r) => r === "ok")).toHaveLength(1);
        expect(results.filter((r) => r === "409 VERSION_CONFLICT")).toHaveLength(1);

        const after = await bedOf(bed.id);
        expect(after.status).toBe("OCCUPIED");
        expect(after.version).toBe(1);
        expect(await db.admission.count({ where: { bedId: bed.id } })).toBe(1);
        // The loser rolled back completely: no orphan patient.
        expect(await db.patient.count({ where: { uhid: { in: [a, b] } } })).toBe(1);
      }
    });

    it("eight simultaneous admits: still exactly one", async () => {
      const bed = await newBed();
      const results = await Promise.all(Array.from({ length: 8 }, (_, i) => code(admit(i % 2 ? "nurseA" : "nurseB", bed.id, 0))));
      expect(results.filter((r) => r === "ok")).toHaveLength(1);
      expect(results.filter((r) => r.startsWith("409"))).toHaveLength(7);
      expect(await db.admission.count({ where: { bedId: bed.id } })).toBe(1);
    });

    it("the same patient cannot be admitted to two beds at once", async () => {
      const [b1, b2] = [await newBed(), await newBed()];
      const u = uhid();
      const results = await Promise.all([code(admit("nurseA", b1.id, 0, u)), code(admit("nurseB", b2.id, 0, u))]);
      expect(results.filter((r) => r === "ok")).toHaveLength(1);
      expect(results).toContain("409 ALREADY_ADMITTED");
    });

    it("a stale version is refused with 409 and 'Bed changed, please refresh'", async () => {
      const bed = await newBed();
      await svc.reserveBed(actors.desk, bed.id, 0);
      await svc.changeStatus(actors.desk, bed.id, { to: "FREE", version: 1 });
      await expect(admit("nurseA", bed.id, 0)).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT", message: "Bed changed, please refresh" });
      await expect(admit("nurseA", bed.id, 2)).resolves.toMatchObject({ status: "OCCUPIED", version: 3 });
    });

    it("two people ticking 'patient left' at once: one wins", async () => {
      const bed = await newBed();
      const { admissionId } = await admit("nurseA", bed.id);
      await svc.dischargeStep(actors.doctor, admissionId, { step: "order", done: true });
      const results = await Promise.all([
        code(svc.dischargeStep(actors.nurseA, admissionId, { step: "left", done: true, version: 2 })),
        code(svc.dischargeStep(actors.nurseB, admissionId, { step: "left", done: true, version: 2 })),
      ]);
      expect(results.filter((r) => r === "ok")).toHaveLength(1);
      expect((await bedOf(bed.id)).status).toBe("CLEANING");
    });
  });

  describe("full journey and the invariant", () => {
    it("reserve -> admit -> order -> steps -> left -> cleaned -> free", async () => {
      const bed = await newBed();
      const r = await svc.reserveBed(actors.desk, bed.id, 0, { reservationMinutes: 30 });
      expect(r).toMatchObject({ status: "RESERVED", version: 1 });
      expect((await bedOf(bed.id)).reservedBy).toBe(actors.desk.id);

      const a = await admit("nurseA", bed.id, 1);
      expect(a.status).toBe("OCCUPIED");
      let b = await bedOf(bed.id);
      expect(b.currentAdmissionId).toBe(a.admissionId);
      expect(b.reservedUntil).toBeNull();

      // Steps before the order are refused.
      expect(await code(svc.dischargeStep(actors.nurseA, a.admissionId, { step: "bill", done: true }))).toBe("409 ORDER_REQUIRED");
      expect(await code(svc.dischargeStep(actors.nurseA, a.admissionId, { step: "left", done: true }))).toBe("409 ORDER_REQUIRED");

      // An order implies a plan.
      const o = await svc.dischargeStep(actors.doctor, a.admissionId, { step: "order", done: true });
      expect(o.status).toBe("DISCHARGE_PLANNED");
      for (const step of ["summary", "bill", "meds"] as const) await svc.dischargeStep(actors.nurseA, a.admissionId, { step, done: true });
      const adm = await db.admission.findUniqueOrThrow({ where: { id: a.admissionId } });
      expect([adm.dischargeOrderAt, adm.summaryReadyAt, adm.billClearedAt, adm.medsGivenAt].every(Boolean)).toBe(true);

      const left = await svc.dischargeStep(actors.nurseA, a.admissionId, { step: "left", done: true });
      expect(left.status).toBe("CLEANING");
      b = await bedOf(bed.id);
      expect(b.currentAdmissionId).toBeNull();
      expect((await db.admission.findUniqueOrThrow({ where: { id: a.admissionId } })).outcome).toBe("DISCHARGED");

      const freed = await svc.changeStatus(actors.housekeeping, bed.id, { to: "FREE", version: b.version });
      expect(freed.status).toBe("FREE");

      const events = await db.bedEvent.findMany({ where: { bedId: bed.id }, orderBy: { at: "asc" } });
      expect(events.map((e) => e.toStatus)).toEqual(["RESERVED", "OCCUPIED", "DISCHARGE_PLANNED", "CLEANING", "FREE"]);
      expect(await db.auditLog.count({ where: { entity: "bed", entityId: bed.id } })).toBe(events.length);
    });

    it("no bed is OCCUPIED/DISCHARGE_PLANNED without an admission, or any other status with one", async () => {
      const beds = await db.bed.findMany({ where: { wardId }, select: { status: true, currentAdmissionId: true } });
      expect(beds.length).toBeGreaterThan(0);
      for (const b of beds) {
        const occupied = b.status === "OCCUPIED" || b.status === "DISCHARGE_PLANNED";
        expect(b.currentAdmissionId !== null).toBe(occupied);
      }
    });

    it("cancelling a discharge plan clears the checklist", async () => {
      const bed = await newBed();
      const a = await admit("nurseA", bed.id);
      await svc.dischargeStep(actors.doctor, a.admissionId, { step: "order", done: true });
      await svc.dischargeStep(actors.nurseA, a.admissionId, { step: "bill", done: true });
      const v = (await bedOf(bed.id)).version;
      const r = await svc.changeStatus(actors.doctor, bed.id, { to: "OCCUPIED", version: v });
      expect(r.status).toBe("OCCUPIED");
      const adm = await db.admission.findUniqueOrThrow({ where: { id: a.admissionId } });
      expect([adm.dischargeOrderAt, adm.billClearedAt, adm.dischargePlannedFor]).toEqual([null, null, null]);
    });

    it("a patient who leaves against advice needs no discharge order", async () => {
      const bed = await newBed();
      const a = await admit("nurseA", bed.id);
      const r = await svc.dischargeStep(actors.nurseA, a.admissionId, { step: "left", done: true, outcome: "LAMA" });
      expect(r.status).toBe("CLEANING");
      expect((await db.admission.findUniqueOrThrow({ where: { id: a.admissionId } })).outcome).toBe("LAMA");
    });

    it("blocking needs NURSE or ADMIN, and unblocking too", async () => {
      const bed = await newBed();
      expect(await code(svc.changeStatus(actors.desk, bed.id, { to: "BLOCKED", version: 0, reason: "leak" }))).toBe("403 FORBIDDEN");
      await svc.changeStatus(actors.admin, bed.id, { to: "BLOCKED", version: 0, reason: "leak" });
      expect((await bedOf(bed.id)).statusReason).toBe("leak");
      expect(await code(svc.changeStatus(actors.housekeeping, bed.id, { to: "FREE", version: 1 }))).toBe("403 FORBIDDEN");
      await svc.changeStatus(actors.nurseA, bed.id, { to: "FREE", version: 1 });
      expect((await bedOf(bed.id)).statusReason).toBeNull();
    });
  });

  describe("transfer", () => {
    it("moves the patient, cleans the old bed, records the transfer", async () => {
      const [from, to] = [await newBed(), await newBed()];
      const a = await admit("nurseA", from.id);
      const r = await svc.transferPatient(actors.nurseA, a.admissionId, { toBedId: to.id, version: 1 });
      expect(r.from.version).toBe(2);

      const [f, t] = [await bedOf(from.id), await bedOf(to.id)];
      expect([f.status, f.currentAdmissionId]).toEqual(["CLEANING", null]);
      expect([t.status, t.currentAdmissionId]).toEqual(["OCCUPIED", a.admissionId]);
      expect((await db.admission.findUniqueOrThrow({ where: { id: a.admissionId } })).bedId).toBe(to.id);
      expect(await db.bedTransfer.count({ where: { admissionId: a.admissionId, fromBedId: from.id, toBedId: to.id } })).toBe(1);
    });

    it("refuses a destination that is not free, and rolls back", async () => {
      const [from, to] = [await newBed(), await newBed()];
      const a = await admit("nurseA", from.id);
      await admit("nurseB", to.id);
      expect(await code(svc.transferPatient(actors.nurseA, a.admissionId, { toBedId: to.id, version: 1 }))).toBe("409 BED_TAKEN");
      expect((await bedOf(from.id)).status).toBe("OCCUPIED");
    });

    it("two patients transferred into the same free bed: one wins", async () => {
      const [f1, f2, dest] = [await newBed(), await newBed(), await newBed()];
      const a1 = await admit("nurseA", f1.id);
      const a2 = await admit("nurseB", f2.id);
      const results = await Promise.all([
        code(svc.transferPatient(actors.nurseA, a1.admissionId, { toBedId: dest.id, version: 1 })),
        code(svc.transferPatient(actors.nurseB, a2.admissionId, { toBedId: dest.id, version: 1 })),
      ]);
      expect(results.filter((r) => r === "ok")).toHaveLength(1);
      expect(await db.admission.count({ where: { bedId: dest.id } })).toBe(1);
    });

    it("only a nurse of the source ward may transfer", async () => {
      const [from, to] = [await newBed(), await newBed()];
      const a = await admit("nurseA", from.id);
      expect(await code(svc.transferPatient(actors.nurseNoWard, a.admissionId, { toBedId: to.id, version: 1 }))).toBe("403 FORBIDDEN");
      expect(await code(svc.transferPatient(actors.doctor, a.admissionId, { toBedId: to.id, version: 1 }))).toBe("403 FORBIDDEN");
    });
  });

  describe("roles and ward access", () => {
    it("a nurse from another ward cannot admit here; housekeeping and doctors cannot admit", async () => {
      const bed = await newBed();
      expect(await code(admit("nurseNoWard", bed.id))).toBe("403 FORBIDDEN");
      expect(await code(admit("housekeeping", bed.id))).toBe("403 FORBIDDEN");
      expect(await code(admit("doctor", bed.id))).toBe("403 FORBIDDEN");
      expect((await bedOf(bed.id)).status).toBe("FREE");
    });

    it("desk can admit in any ward", async () => {
      const bed = await newBed(otherWardId);
      expect(await code(admit("desk", bed.id))).toBe("ok");
    });

    it("an occupied bed cannot be admitted to again", async () => {
      const bed = await newBed();
      await admit("nurseA", bed.id);
      expect(await code(admit("nurseB", bed.id, 1))).toBe("409 INVALID_TRANSITION");
    });
  });

  describe("reservation auto-release", () => {
    it("frees expired reservations only, writes an event with no actor", async () => {
      const t0 = new Date("2026-11-25T10:00:00Z");
      const [expired, live] = [await newBed(), await newBed()];
      await svc.reserveBed(actors.desk, expired.id, 0, { now: t0, reservationMinutes: 30 });
      await svc.reserveBed(actors.desk, live.id, 0, { now: new Date("2026-11-25T10:20:00Z"), reservationMinutes: 30 });

      const released = await svc.releaseExpiredReservations(new Date("2026-11-25T10:31:00Z"));
      expect(released).toBeGreaterThanOrEqual(1);

      expect((await bedOf(expired.id)).status).toBe("FREE");
      expect((await bedOf(expired.id)).reservedUntil).toBeNull();
      expect((await bedOf(live.id)).status).toBe("RESERVED");

      const ev = await db.bedEvent.findFirstOrThrow({ where: { bedId: expired.id, toStatus: "FREE" } });
      expect(ev.actorUserId).toBeNull();
      expect(ev.note).toBe("reservation expired");
      // Running it again does nothing more.
      expect(await svc.releaseExpiredReservations(new Date("2026-11-25T10:31:00Z"))).toBe(0);
    });

    it("a bed admitted before the deadline is not released", async () => {
      const bed = await newBed();
      await svc.reserveBed(actors.desk, bed.id, 0, { now: new Date("2026-11-25T10:00:00Z"), reservationMinutes: 30 });
      await admit("nurseA", bed.id, 1);
      await svc.releaseExpiredReservations(new Date("2026-11-25T12:00:00Z"));
      expect((await bedOf(bed.id)).status).toBe("OCCUPIED");
    });
  });
});
