/**
 * Patient privacy tools (SPEC section 8, DPDP Act 2023): find a patient, correct a mistake, erase on request.
 * Erasing = anonymising: name, UHID, phone and ABHA number go; age and sex stay so reports keep working
 * (the same thing the nightly retention job does). Admin only, and every use is written to the audit log.
 */
import { db } from "./db";
import { writeAudit } from "./audit";

export type PatientRow = {
  id: string;
  uhid: string;
  name: string;
  age: number;
  sex: "MALE" | "FEMALE" | "OTHER";
  phone: string | null;
  stays: number;
  admittedNow: boolean;
};

export type Outcome<T = undefined> = { ok: true; data: T } | { ok: false; status: number; code: string; message: string };
const fail = (status: number, code: string, message: string) => ({ ok: false as const, status, code, message });

/** By exact UHID or part of the name. Already-erased patients are not listed: there is nothing left to find. */
export async function searchPatients(q: string): Promise<PatientRow[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const rows = await db.patient.findMany({
    where: { anonymised: false, OR: [{ uhid: { equals: term, mode: "insensitive" } }, { name: { contains: term, mode: "insensitive" } }] },
    orderBy: { name: "asc" },
    take: 20,
    select: { id: true, uhid: true, name: true, age: true, sex: true, phone: true, admissions: { select: { leftAt: true } } },
  });
  return rows.map(({ admissions, ...p }) => ({ ...p, stays: admissions.length, admittedNow: admissions.some((a) => !a.leftAt) }));
}

export async function correctPatient(
  actorId: string,
  id: string,
  patch: { name?: string; age?: number; sex?: "MALE" | "FEMALE" | "OTHER"; phone?: string | null },
  ip?: string | null,
): Promise<Outcome<PatientRow>> {
  const p = await db.patient.findUnique({ where: { id }, select: { id: true, anonymised: true } });
  if (!p) return fail(404, "NOT_FOUND", "Patient not found");
  if (p.anonymised) return fail(409, "ALREADY_ANONYMISED", "This patient’s details were already erased");
  await db.$transaction(async (tx) => {
    await tx.patient.update({ where: { id }, data: patch });
    await writeAudit(tx, { actorUserId: actorId, action: "patient_correct", entity: "patient", entityId: id, ip });
  });
  const [row] = await searchByIds([id]);
  return { ok: true, data: row! };
}

export async function erasePatient(actorId: string, id: string, ip?: string | null): Promise<Outcome> {
  const p = await db.patient.findUnique({ where: { id }, select: { anonymised: true, admissions: { select: { leftAt: true } } } });
  if (!p) return fail(404, "NOT_FOUND", "Patient not found");
  if (p.anonymised) return fail(409, "ALREADY_ANONYMISED", "This patient’s details were already erased");
  if (p.admissions.some((a) => !a.leftAt)) return fail(409, "PATIENT_ADMITTED", "This patient is still admitted. Erase after they have left.");
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE patient SET name = 'Anonymised', uhid = 'ANON-' || id, phone = NULL, abha_number = NULL, anonymised = true WHERE id = ${id}`;
    await writeAudit(tx, { actorUserId: actorId, action: "patient_erase", entity: "patient", entityId: id, ip });
  });
  return { ok: true, data: undefined };
}

async function searchByIds(ids: string[]): Promise<PatientRow[]> {
  const rows = await db.patient.findMany({
    where: { id: { in: ids } },
    select: { id: true, uhid: true, name: true, age: true, sex: true, phone: true, admissions: { select: { leftAt: true } } },
  });
  return rows.map(({ admissions, ...p }) => ({ ...p, stays: admissions.length, admittedNow: admissions.some((a) => !a.leftAt) }));
}
