/**
 * The only code that changes a bed's status. Every change is ONE transaction that
 * checks `version`, updates the bed (version + 1), writes a BedEvent and an AuditLog
 * row, then `NOTIFY beds` (SPEC section 4). Rules come from the pure decide() in beds.ts.
 *
 * Relative imports only: the worker container runs this file too.
 */
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { writeAudit } from "./audit";
import { canEditWard } from "./rbac";
import type { Role } from "./constants";
import {
  decide,
  isReservationExpired,
  reservationDeadline,
  type BedAction,
  type BedStatus,
} from "./beds";

type Tx = Prisma.TransactionClient;

export class BedError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// A burst of taps on one ward queues on the pool and on row locks. Wait for them (and then
// lose cleanly with a 409) instead of failing with Prisma's 2 s default "unable to start".
const transaction = <T>(fn: (tx: Tx) => Promise<T>) => db.$transaction(fn, { maxWait: 15_000, timeout: 20_000 });

const fail = (status: number, code: string, message: string): never => {
  throw new BedError(status, code, message);
};
const conflict = () => fail(409, "VERSION_CONFLICT", "Bed changed, please refresh");

export type ServiceActor = { id: string; role: Role; wardIds: string[] };
export type Opts = { now?: Date; reservationMinutes?: number; ip?: string | null };

type BedRow = {
  id: string;
  wardId: string;
  status: BedStatus;
  version: number;
  currentAdmissionId: string | null;
  reservedUntil: Date | null;
};

const BED_SELECT = { id: true, wardId: true, status: true, version: true, currentAdmissionId: true, reservedUntil: true } as const;

async function loadBed(tx: Tx, id: string): Promise<BedRow> {
  const bed = await tx.bed.findUnique({ where: { id }, select: BED_SELECT });
  return bed ?? fail(404, "NOT_FOUND", "Bed not found");
}

/** Nurses may only act on their assigned wards. Other roles are not ward-limited. */
function assertWard(actor: ServiceActor, wardId: string) {
  if (actor.role === "NURSE" && !canEditWard("NURSE", actor.wardIds, wardId)) {
    fail(403, "FORBIDDEN", "You are not assigned to this ward");
  }
}

function decideOrThrow(action: BedAction, bed: BedRow, role: Role | "SYSTEM"): BedStatus {
  const d = decide(action, { status: bed.status, hasAdmission: bed.currentAdmissionId !== null }, role);
  if (d.ok) return d.to;
  if (d.code === "FORBIDDEN") return fail(403, "FORBIDDEN", "You are not allowed to do this");
  return fail(409, "INVALID_TRANSITION", `Cannot do that to a bed that is ${bed.status.toLowerCase().replace("_", " ")}`);
}

/** The one place a bed's status changes. */
async function moveBed(
  tx: Tx,
  bed: BedRow,
  to: BedStatus,
  expectedVersion: number,
  by: { id: string | null; action: BedAction },
  now: Date,
  extra: Prisma.BedUncheckedUpdateManyInput = {},
  note?: string,
  ip?: string | null,
): Promise<number> {
  if (bed.version !== expectedVersion) conflict();

  // The WHERE re-checks version and status, so of two concurrent writers only one matches.
  const res = await tx.bed.updateMany({
    where: { id: bed.id, version: expectedVersion, status: bed.status },
    data: {
      status: to,
      statusChangedAt: now,
      statusReason: null,
      reservedUntil: null,
      reservedBy: null,
      ...extra,
      version: { increment: 1 },
    },
  });
  if (res.count !== 1) conflict();

  await tx.bedEvent.create({
    data: { bedId: bed.id, fromStatus: bed.status, toStatus: to, actorUserId: by.id, at: now, note: note ?? by.action },
  });
  await writeAudit(tx, { actorUserId: by.id, action: `bed_${by.action}`, entity: "bed", entityId: bed.id, ip });
  // Delivered on commit. No patient data: only ids and the new status.
  const payload = JSON.stringify({ bedId: bed.id, wardId: bed.wardId, from: bed.status, to, version: expectedVersion + 1 });
  await tx.$executeRaw`SELECT pg_notify('beds', ${payload})`;
  return expectedVersion + 1;
}

// ---------------------------------------------------------------- reserve / status

export async function reserveBed(actor: ServiceActor, bedId: string, version: number, opts: Opts = {}) {
  const now = opts.now ?? new Date();
  const minutes = opts.reservationMinutes ?? 30;
  return transaction(async (tx) => {
    const bed = await loadBed(tx, bedId);
    if (bed.version !== version) conflict(); // stale client: always say "changed", not "invalid move"
    const to = decideOrThrow("reserve", bed, actor.role);
    const v = await moveBed(tx, bed, to, version, { id: actor.id, action: "reserve" }, now, {
      reservedUntil: reservationDeadline(now, minutes),
      reservedBy: actor.id,
    }, undefined, opts.ip);
    return { bedId, status: to, version: v };
  });
}

/** Block, unblock, cancel a reservation, mark cleaned, or cancel a discharge plan. */
export async function changeStatus(
  actor: ServiceActor,
  bedId: string,
  input: { to: "FREE" | "BLOCKED" | "OCCUPIED"; version: number; reason?: string },
  opts: Opts = {},
) {
  const now = opts.now ?? new Date();
  return transaction(async (tx) => {
    const bed = await loadBed(tx, bedId);
    assertWard(actor, bed.wardId);
    if (bed.version !== input.version) conflict();

    let action: BedAction;
    if (input.to === "BLOCKED") action = "block";
    else if (input.to === "OCCUPIED") {
      if (bed.status !== "DISCHARGE_PLANNED") return fail(409, "INVALID_TRANSITION", "Use admit to put a patient in a bed");
      action = "cancelPlan";
    } else if (bed.status === "BLOCKED") action = "unblock";
    else if (bed.status === "RESERVED") action = "cancelReservation";
    else if (bed.status === "CLEANING") action = "markCleaned";
    else return fail(409, "INVALID_TRANSITION", "That bed cannot be made free this way");

    const to = decideOrThrow(action, bed, actor.role);

    if (action === "cancelPlan") {
      // The plan is off, so the checklist for it is cleared too.
      await tx.admission.update({
        where: { id: bed.currentAdmissionId! },
        data: { dischargePlannedFor: null, dischargeOrderAt: null, summaryReadyAt: null, billClearedAt: null, medsGivenAt: null },
      });
    }
    const v = await moveBed(
      tx, bed, to, input.version, { id: actor.id, action }, now,
      to === "BLOCKED" ? { statusReason: input.reason ?? null } : {}, input.reason, opts.ip,
    );
    return { bedId, status: to, version: v };
  });
}

// ---------------------------------------------------------------- admit

export type AdmitInput = {
  version: number;
  admittingDoctor: string;
  patient: { uhid: string; name: string; age: number; sex: "MALE" | "FEMALE" | "OTHER"; phone?: string };
};

export async function admitPatient(actor: ServiceActor, bedId: string, input: AdmitInput, opts: Opts = {}) {
  const now = opts.now ?? new Date();
  const p = input.patient;
  return transaction(async (tx) => {
    const bed = await loadBed(tx, bedId);
    assertWard(actor, bed.wardId);
    if (bed.version !== input.version) conflict();
    const to = decideOrThrow("admit", bed, actor.role);

    // One patient cannot be in two beds. The lock stops two simultaneous admits of the same UHID.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${p.uhid}))`;
    const open = await tx.admission.findFirst({ where: { leftAt: null, patient: { uhid: p.uhid } }, select: { id: true } });
    if (open) fail(409, "ALREADY_ADMITTED", "This patient is already admitted to a bed");

    // Claim the bed first. If another admit got there, this updates 0 rows and the whole transaction rolls back.
    const v = await moveBed(tx, bed, to, input.version, { id: actor.id, action: "admit" }, now, {}, undefined, opts.ip);

    const existing = await tx.patient.findFirst({ where: { uhid: p.uhid, anonymised: false }, select: { id: true } });
    const data = { uhid: p.uhid, name: p.name, age: p.age, sex: p.sex, phone: p.phone ?? null };
    const patient = existing
      ? await tx.patient.update({ where: { id: existing.id }, data })
      : await tx.patient.create({ data });

    const admission = await tx.admission.create({
      data: { patientId: patient.id, bedId, admittingDoctor: input.admittingDoctor, admittedAt: now },
    });
    await tx.bed.update({ where: { id: bedId }, data: { currentAdmissionId: admission.id } });
    return { bedId, admissionId: admission.id, status: to, version: v };
  });
}

// ---------------------------------------------------------------- discharge

export type DischargeInput = {
  step: "plan" | "order" | "summary" | "bill" | "meds" | "left";
  done: boolean;
  version?: number;
  outcome?: "DISCHARGED" | "LAMA" | "REFERRED" | "DIED";
  plannedFor?: string;
};

const TICK_FIELD = { summary: "summaryReadyAt", bill: "billClearedAt", meds: "medsGivenAt" } as const;

export async function dischargeStep(actor: ServiceActor, admissionId: string, input: DischargeInput, opts: Opts = {}) {
  const now = opts.now ?? new Date();
  return transaction(async (tx) => {
    const adm = await tx.admission.findUnique({
      where: { id: admissionId },
      select: { id: true, leftAt: true, dischargeOrderAt: true, bed: { select: BED_SELECT } },
    });
    if (!adm) return fail(404, "NOT_FOUND", "Admission not found");
    if (adm.leftAt) return fail(409, "ALREADY_LEFT", "This patient has already left");
    const bed = adm.bed as BedRow;
    if (bed.currentAdmissionId !== adm.id) return conflict();
    assertWard(actor, bed.wardId);

    const expected = input.version ?? bed.version;
    if (expected !== bed.version) conflict();
    const audit = (action: string) =>
      writeAudit(tx, { actorUserId: actor.id, action, entity: "admission", entityId: adm.id, ip: opts.ip });
    const result = (status: BedStatus, version: number) => ({ admissionId: adm.id, bedId: bed.id, status, version });

    switch (input.step) {
      case "plan": {
        if (!input.done) {
          const to = decideOrThrow("cancelPlan", bed, actor.role);
          await tx.admission.update({
            where: { id: adm.id },
            data: { dischargePlannedFor: null, dischargeOrderAt: null, summaryReadyAt: null, billClearedAt: null, medsGivenAt: null },
          });
          return result(to, await moveBed(tx, bed, to, expected, { id: actor.id, action: "cancelPlan" }, now, {}, undefined, opts.ip));
        }
        const to = decideOrThrow("planDischarge", bed, actor.role);
        await tx.admission.update({
          where: { id: adm.id },
          data: { dischargePlannedFor: input.plannedFor ? new Date(input.plannedFor) : now },
        });
        return result(to, await moveBed(tx, bed, to, expected, { id: actor.id, action: "planDischarge" }, now, {}, undefined, opts.ip));
      }

      case "order": {
        if (!input.done) {
          await tx.admission.update({ where: { id: adm.id }, data: { dischargeOrderAt: null } });
          await audit("discharge_order_undo");
          return result(bed.status, bed.version);
        }
        // An order implies a plan: move OCCUPIED -> DISCHARGE_PLANNED in the same step.
        let status = bed.status;
        let version = bed.version;
        if (bed.status === "OCCUPIED") {
          const to = decideOrThrow("planDischarge", bed, actor.role);
          await tx.admission.update({ where: { id: adm.id }, data: { dischargePlannedFor: now } });
          version = await moveBed(tx, bed, to, expected, { id: actor.id, action: "planDischarge" }, now, {}, "discharge order", opts.ip);
          status = to;
        } else if (bed.status !== "DISCHARGE_PLANNED") {
          return fail(409, "INVALID_TRANSITION", "Cannot order a discharge for this bed");
        } else if (input.version !== undefined && input.version !== bed.version) conflict();
        await tx.admission.update({ where: { id: adm.id }, data: { dischargeOrderAt: adm.dischargeOrderAt ?? now } });
        await audit("discharge_order");
        return result(status, version);
      }

      case "summary":
      case "bill":
      case "meds": {
        if (bed.status !== "DISCHARGE_PLANNED" || !adm.dischargeOrderAt) {
          return fail(409, "ORDER_REQUIRED", "The discharge order must be given first");
        }
        await tx.admission.update({ where: { id: adm.id }, data: { [TICK_FIELD[input.step]]: input.done ? now : null } });
        await audit(`discharge_${input.step}${input.done ? "" : "_undo"}`);
        return result(bed.status, bed.version);
      }

      case "left": {
        if (!input.done) return fail(400, "VALIDATION", "Patient left cannot be undone");
        const outcome = input.outcome ?? "DISCHARGED";
        if (outcome === "DISCHARGED" && !adm.dischargeOrderAt) {
          return fail(409, "ORDER_REQUIRED", "The discharge order must be given first");
        }
        const to = decideOrThrow("patientLeft", bed, actor.role);
        await tx.admission.update({ where: { id: adm.id }, data: { leftAt: now, outcome } });
        const v = await moveBed(
          tx, bed, to, expected, { id: actor.id, action: "patientLeft" }, now,
          { currentAdmissionId: null }, `patient left (${outcome})`, opts.ip,
        );
        return result(to, v);
      }
    }
  });
}

// ---------------------------------------------------------------- transfer

export async function transferPatient(
  actor: ServiceActor,
  admissionId: string,
  input: { toBedId: string; version: number; toVersion?: number },
  opts: Opts = {},
) {
  const now = opts.now ?? new Date();
  return transaction(async (tx) => {
    const adm = await tx.admission.findUnique({
      where: { id: admissionId },
      select: { id: true, leftAt: true, bed: { select: BED_SELECT } },
    });
    if (!adm) return fail(404, "NOT_FOUND", "Admission not found");
    if (adm.leftAt) return fail(409, "ALREADY_LEFT", "This patient has already left");
    const src = adm.bed as BedRow;
    if (src.currentAdmissionId !== adm.id) return conflict();
    assertWard(actor, src.wardId);
    if (src.version !== input.version) conflict();
    if (src.status !== "OCCUPIED") return fail(409, "INVALID_TRANSITION", "Cancel the discharge plan before transferring");
    if (input.toBedId === src.id) return fail(400, "VALIDATION", "Choose a different bed");

    const dst = await loadBed(tx, input.toBedId);
    if (dst.status !== "FREE") return fail(409, "BED_TAKEN", "That bed is no longer free");

    const srcTo = decideOrThrow("patientLeft", src, actor.role);
    const dstTo = decideOrThrow("admit", dst, actor.role);

    // Source first: it clears currentAdmissionId, which is unique, before the destination takes it.
    const sv = await moveBed(tx, src, srcTo, input.version, { id: actor.id, action: "patientLeft" }, now, { currentAdmissionId: null }, "transferred out", opts.ip);
    const dv = await moveBed(tx, dst, dstTo, input.toVersion ?? dst.version, { id: actor.id, action: "admit" }, now, { currentAdmissionId: adm.id }, "transferred in", opts.ip);

    await tx.admission.update({ where: { id: adm.id }, data: { bedId: dst.id } });
    await tx.bedTransfer.create({ data: { admissionId: adm.id, fromBedId: src.id, toBedId: dst.id, at: now, byUserId: actor.id } });
    return { admissionId: adm.id, from: { bedId: src.id, version: sv }, to: { bedId: dst.id, version: dv } };
  });
}

// ---------------------------------------------------------------- worker

/** Frees reservations past their deadline. Called by the worker every minute. */
export async function releaseExpiredReservations(now: Date = new Date()): Promise<number> {
  const stale = await db.bed.findMany({ where: { status: "RESERVED" }, select: BED_SELECT });
  let released = 0;
  for (const bed of stale) {
    if (!isReservationExpired(bed.reservedUntil, now)) continue;
    try {
      await transaction(async (tx) => {
        const fresh = await loadBed(tx, bed.id);
        if (fresh.status !== "RESERVED" || !isReservationExpired(fresh.reservedUntil, now)) return;
        const to = decideOrThrow("expireReservation", fresh, "SYSTEM");
        await moveBed(tx, fresh, to, fresh.version, { id: null, action: "expireReservation" }, now, {}, "reservation expired");
        released++;
      });
    } catch (e) {
      if (!(e instanceof BedError)) throw e; // someone else changed it meanwhile: leave it
    }
  }
  return released;
}
