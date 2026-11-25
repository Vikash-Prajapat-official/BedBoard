import { db } from "./db";
import { writeAudit } from "./audit";
import { retentionCutoff } from "./report-math";

/**
 * Retention job (nightly). Patients whose every admission ended before the cutoff lose their name,
 * UHID, phone and ABHA number; age and sex stay so reports keep working. The hospital's main medical
 * record is kept elsewhere for the legal period (SPEC section 8). Anyone still admitted, or discharged
 * more recently than RETENTION_DAYS, is untouched. Returns how many patients were anonymised.
 */
export async function anonymiseExpiredPatients(now: Date = new Date(), retentionDays = 365): Promise<number> {
  const cutoff = retentionCutoff(now, retentionDays);
  const n = await db.$executeRaw`
    UPDATE patient
       SET name = 'Anonymised', uhid = 'ANON-' || id, phone = NULL, abha_number = NULL, anonymised = true
     WHERE anonymised = false
       AND NOT EXISTS (
         SELECT 1 FROM admission a
          WHERE a.patient_id = patient.id AND (a.left_at IS NULL OR a.left_at >= ${cutoff})
       )`;
  if (n > 0) await writeAudit(db, { action: "retention_anonymise", entity: "patient", entityId: `count=${n}` });
  return n;
}
