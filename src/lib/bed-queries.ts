import { db } from "./db";
import { canEditWard } from "./rbac";
import type { BedType, Role } from "./constants";
import type { BedStatus } from "./beds";

export type WardMapBed = {
  id: string;
  label: string;
  bedType: string;
  status: BedStatus;
  statusReason: string | null;
  version: number;
  reservedUntil: string | null;
  statusChangedAt: string;
  /** Only present when the viewer may see patient names. */
  admission?: {
    id: string;
    patient: { name: string; uhid: string; age: number; sex: string };
    admittingDoctor: string;
    admittedAt: string;
    dischargeOrderAt: string | null;
    summaryReadyAt: string | null;
    billClearedAt: string | null;
    medsGivenAt: string | null;
  };
};

export type WardMap = {
  ward: { id: string; name: string };
  canSeePatients: boolean;
  canEdit: boolean;
  beds: WardMapBed[];
};

type Viewer = { role: Role; wardIds: string[] };

type AdmissionRow = {
  id: string;
  admittingDoctor: string;
  admittedAt: Date;
  dischargeOrderAt: Date | null;
  summaryReadyAt: Date | null;
  billClearedAt: Date | null;
  medsGivenAt: Date | null;
  patient: { name: string; uhid: string; age: number; sex: string };
};

/**
 * Names are visible to the ward's own staff, the desk, doctors and admins (SPEC section 8).
 * A nurse who is not assigned to this ward sees the beds but no patients.
 */
export function canSeePatientsInWard(v: Viewer, wardId: string): boolean {
  if (v.role === "ADMIN" || v.role === "DESK" || v.role === "DOCTOR") return true;
  return v.role === "NURSE" && v.wardIds.includes(wardId);
}

export async function getWardMap(viewer: Viewer, wardId: string): Promise<WardMap | null> {
  const ward = await db.ward.findUnique({ where: { id: wardId }, select: { id: true, name: true, active: true } });
  if (!ward || !ward.active) return null;

  const showPatients = canSeePatientsInWard(viewer, wardId);
  const beds = await db.bed.findMany({
    where: { wardId },
    select: {
      id: true, label: true, bedType: true, status: true, statusReason: true, version: true,
      reservedUntil: true, statusChangedAt: true,
      currentAdmission: showPatients
        ? { select: { id: true, admittingDoctor: true, admittedAt: true, dischargeOrderAt: true, summaryReadyAt: true, billClearedAt: true, medsGivenAt: true, patient: { select: { name: true, uhid: true, age: true, sex: true } } } }
        : false,
    },
  });

  const collator = new Intl.Collator("en", { numeric: true });
  beds.sort((a, b) => collator.compare(a.label, b.label));
  const iso = (d: Date | null) => (d ? d.toISOString() : null);

  return {
    ward: { id: ward.id, name: ward.name },
    canSeePatients: showPatients,
    canEdit: canEditWard(viewer.role, viewer.wardIds, wardId) || viewer.role === "DESK" || viewer.role === "DOCTOR",
    beds: beds.map((b) => {
      // currentAdmission is only selected when showPatients, so it is absent otherwise.
      const adm = (b as unknown as { currentAdmission?: AdmissionRow | null }).currentAdmission ?? null;
      return {
        id: b.id, label: b.label, bedType: b.bedType, status: b.status as BedStatus, statusReason: b.statusReason,
        version: b.version, reservedUntil: iso(b.reservedUntil), statusChangedAt: b.statusChangedAt.toISOString(),
        ...(adm
          ? {
              admission: {
                id: adm.id, patient: adm.patient, admittingDoctor: adm.admittingDoctor,
                admittedAt: adm.admittedAt.toISOString(), dischargeOrderAt: iso(adm.dischargeOrderAt),
                summaryReadyAt: iso(adm.summaryReadyAt), billClearedAt: iso(adm.billClearedAt), medsGivenAt: iso(adm.medsGivenAt),
              },
            }
          : {}),
      };
    }),
  };
}

const natural = new Intl.Collator("en", { numeric: true });

// ---- Find a bed (desk) ------------------------------------------------------------

export type FoundBed = {
  id: string;
  label: string;
  bedType: string;
  version: number;
  ward: { id: string; name: string; floor: number; gender: string };
};

/** Free beds. `gender` is the patient's sex: it matches wards of that gender and mixed (ANY) wards. */
export async function searchFreeBeds(p: { type?: BedType; gender?: "MALE" | "FEMALE"; wardId?: string }): Promise<FoundBed[]> {
  const beds = await db.bed.findMany({
    where: {
      status: "FREE",
      ...(p.type ? { bedType: p.type } : {}),
      ward: { active: true, ...(p.wardId ? { id: p.wardId } : {}), ...(p.gender ? { gender: { in: [p.gender, "ANY"] } } : {}) },
    },
    select: { id: true, label: true, bedType: true, version: true, ward: { select: { id: true, name: true, floor: true, gender: true, sortOrder: true } } },
    orderBy: [{ ward: { sortOrder: "asc" } }],
    take: 500,
  });
  beds.sort((a, b) => a.ward.sortOrder - b.ward.sortOrder || natural.compare(a.label, b.label));
  return beds.map(({ ward: { sortOrder: _s, ...ward }, ...b }) => ({ ...b, ward }));
}

export type ReservedBed = { id: string; label: string; bedType: string; version: number; wardName: string; reservedUntil: string | null };

/** Beds currently held for an incoming patient (soonest to expire first). */
export async function getReservedBeds(): Promise<ReservedBed[]> {
  const beds = await db.bed.findMany({
    where: { status: "RESERVED", ward: { active: true } },
    select: { id: true, label: true, bedType: true, version: true, reservedUntil: true, ward: { select: { name: true } } },
    orderBy: { reservedUntil: "asc" },
  });
  return beds.map((b) => ({ id: b.id, label: b.label, bedType: b.bedType, version: b.version, wardName: b.ward.name, reservedUntil: b.reservedUntil?.toISOString() ?? null }));
}

// ---- Housekeeping -----------------------------------------------------------------

export type CleaningBed = { id: string; label: string; bedType: string; version: number; wardId: string; wardName: string; since: string };

/** Beds waiting to be cleaned, longest-waiting first. Bed labels only, no patient data. */
export async function getCleaningList(): Promise<CleaningBed[]> {
  const beds = await db.bed.findMany({
    where: { status: "CLEANING", ward: { active: true } },
    select: { id: true, label: true, bedType: true, version: true, statusChangedAt: true, ward: { select: { id: true, name: true } } },
    orderBy: { statusChangedAt: "asc" },
  });
  return beds.map((b) => ({ id: b.id, label: b.label, bedType: b.bedType, version: b.version, wardId: b.ward.id, wardName: b.ward.name, since: b.statusChangedAt.toISOString() }));
}

// ---- Discharge tracker ------------------------------------------------------------

export type DischargeRow = {
  admissionId: string;
  patient: { name: string; age: number; sex: string };
  bed: { id: string; label: string; version: number; wardId: string; wardName: string };
  dischargeOrderAt: string;
  summaryReadyAt: string | null;
  billClearedAt: string | null;
  medsGivenAt: string | null;
};

/**
 * Open admissions with a discharge order, longest-waiting first. Contains names, so nurses only
 * get their own wards; desk, doctors and admins get all (SPEC section 8).
 */
export async function getDischargeList(viewer: Viewer): Promise<DischargeRow[]> {
  const rows = await db.admission.findMany({
    where: {
      leftAt: null,
      dischargeOrderAt: { not: null },
      ...(viewer.role === "NURSE" ? { bed: { wardId: { in: viewer.wardIds } } } : {}),
    },
    select: {
      id: true, dischargeOrderAt: true, summaryReadyAt: true, billClearedAt: true, medsGivenAt: true,
      patient: { select: { name: true, age: true, sex: true } },
      bed: { select: { id: true, label: true, version: true, wardId: true, ward: { select: { name: true } } } },
    },
    orderBy: { dischargeOrderAt: "asc" },
    take: 300,
  });
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return rows.map((r) => ({
    admissionId: r.id,
    patient: r.patient,
    bed: { id: r.bed.id, label: r.bed.label, version: r.bed.version, wardId: r.bed.wardId, wardName: r.bed.ward.name },
    dischargeOrderAt: r.dischargeOrderAt!.toISOString(),
    summaryReadyAt: iso(r.summaryReadyAt),
    billClearedAt: iso(r.billClearedAt),
    medsGivenAt: iso(r.medsGivenAt),
  }));
}

/** Free beds hospital-wide (labels only, no patient data) for the transfer picker. */
export async function getFreeBeds() {
  const beds = await db.bed.findMany({
    where: { status: "FREE", ward: { active: true } },
    select: { id: true, label: true, bedType: true, version: true, ward: { select: { name: true, sortOrder: true } } },
    orderBy: [{ ward: { sortOrder: "asc" } }, { label: "asc" }],
  });
  return beds.map((b) => ({ id: b.id, label: b.label, bedType: b.bedType, version: b.version, wardName: b.ward.name }));
}
