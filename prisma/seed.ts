import { PrismaClient, type BedType, type Role, type WardGender, type Sex } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const DEMO_PASSWORD = "bedboard123"; // demo data only; see DECISIONS.md

// 8 wards, 120 beds total (SPEC section 9).
const WARDS: {
  name: string; gender: WardGender; floor: number; specialty: string;
  beds: number; type: BedType; prefix: string;
}[] = [
  { name: "General Male", gender: "MALE", floor: 1, specialty: "General Medicine", beds: 20, type: "GENERAL", prefix: "GM" },
  { name: "General Female", gender: "FEMALE", floor: 1, specialty: "General Medicine", beds: 20, type: "GENERAL", prefix: "GF" },
  { name: "Paediatrics", gender: "ANY", floor: 2, specialty: "Paediatrics", beds: 14, type: "COT", prefix: "PD" },
  { name: "Maternity", gender: "FEMALE", floor: 2, specialty: "Obstetrics", beds: 14, type: "GENERAL", prefix: "MT" },
  { name: "ICU", gender: "ANY", floor: 3, specialty: "Critical Care", beds: 10, type: "ICU", prefix: "ICU" },
  { name: "HDU", gender: "ANY", floor: 3, specialty: "High Dependency", beds: 8, type: "OXYGEN", prefix: "HDU" },
  { name: "Surgery", gender: "ANY", floor: 2, specialty: "Surgery", beds: 20, type: "GENERAL", prefix: "SG" },
  { name: "Isolation", gender: "ANY", floor: 4, specialty: "Infectious Disease", beds: 14, type: "ISOLATION", prefix: "ISO" },
];

const FIRST = ["Asha", "Ravi", "Meena", "Suresh", "Priya", "Anil", "Kavita", "Rahul", "Sunita", "Vijay", "Lata", "Mohan"];
const LAST = ["Sharma", "Verma", "Patil", "Singh", "Iyer", "Khan", "Das", "Nair", "Yadav", "Gupta"];
const DOCTORS = ["Dr. Rao", "Dr. Mehta", "Dr. Banerjee", "Dr. Fernandes"];

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

async function main() {
  if ((await db.hospital.count()) > 0) {
    console.log("Seed skipped: data already exists. Reset with `docker compose down -v` to start clean.");
    return;
  }

  await db.hospital.create({ data: { name: "Demo District Hospital" } });
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const users: { name: string; phone: string; role: Role }[] = [
    { name: "Demo Admin", phone: "9000000001", role: "ADMIN" },
    { name: "Demo Nurse", phone: "9000000002", role: "NURSE" },
    { name: "Demo Desk", phone: "9000000003", role: "DESK" },
    { name: "Demo Doctor", phone: "9000000004", role: "DOCTOR" },
    { name: "Demo Housekeeping", phone: "9000000005", role: "HOUSEKEEPING" },
    { name: "Casualty TV", phone: "9000000006", role: "VIEWER" },
  ];
  const created = [];
  for (const u of users) created.push(await db.user.create({ data: { ...u, passwordHash: hash } }));

  let n = 0; // running counter for deterministic demo patients
  let occupiedCount = 0;
  let dischargeCount = 0;
  const wardIds: string[] = [];

  for (const [i, w] of WARDS.entries()) {
    const ward = await db.ward.create({
      data: { name: w.name, gender: w.gender, floor: w.floor, specialty: w.specialty, sortOrder: i },
    });
    wardIds.push(ward.id);

    for (let b = 1; b <= w.beds; b++) {
      // Per-ward mix: ~75% occupied overall, a few cleaning/blocked/reserved, rest free.
      const slot = b % 8;
      let status: "FREE" | "OCCUPIED" | "CLEANING" | "BLOCKED" | "RESERVED" = "OCCUPIED";
      if (b === w.beds && i % 4 === 1) status = "BLOCKED";
      else if (slot === 0 || b % 16 === 4) status = "FREE";
      else if (slot === 7 && b % 16 === 7) status = "CLEANING";
      else if (b === w.beds - 1 && i % 4 === 2) status = "RESERVED";

      // Ventilator beds inside ICU for realistic type filters.
      const bedType: BedType = w.name === "ICU" && b <= 3 ? "VENTILATOR" : w.type;

      const bed = await db.bed.create({
        data: {
          wardId: ward.id,
          label: `${w.prefix}-${String(b).padStart(2, "0")}`,
          bedType,
          status,
          statusChangedAt: hoursAgo(1 + (b % 20)),
          statusReason: status === "BLOCKED" ? "Under maintenance" : null,
          reservedUntil: status === "RESERVED" ? new Date(Date.now() + 20 * 60_000) : null,
          reservedBy: status === "RESERVED" ? created[2]?.id : null,
        },
      });

      if (status !== "OCCUPIED") continue;

      n++;
      occupiedCount++;
      const patient = await db.patient.create({
        data: {
          uhid: `UH${String(100000 + n)}`,
          name: `${FIRST[n % FIRST.length]} ${LAST[n % LAST.length]}`,
          age: 3 + ((n * 7) % 85),
          sex: (w.gender === "MALE" ? "MALE" : w.gender === "FEMALE" ? "FEMALE" : n % 2 ? "MALE" : "FEMALE") as Sex,
        },
      });

      const pending = dischargeCount < 10 && n % 8 === 3;
      if (pending) dischargeCount++;
      const orderAt = pending ? hoursAgo(dischargeCount <= 3 ? 5 + dischargeCount : 0.5 + dischargeCount * 0.4) : null;

      const adm = await db.admission.create({
        data: {
          patientId: patient.id,
          bedId: bed.id,
          admittingDoctor: DOCTORS[n % DOCTORS.length]!,
          admittedAt: hoursAgo(24 + (n % 120)),
          dischargePlannedFor: pending ? new Date() : null,
          dischargeOrderAt: orderAt,
          summaryReadyAt: pending && dischargeCount % 2 === 0 ? hoursAgo(0.3) : null,
          billClearedAt: pending && dischargeCount % 3 === 0 ? hoursAgo(0.2) : null,
        },
      });

      await db.bed.update({
        where: { id: bed.id },
        data: { currentAdmissionId: adm.id, status: pending ? "DISCHARGE_PLANNED" : "OCCUPIED" },
      });
    }
  }

  // Nurse can edit the first two wards in the demo.
  const nurse = created[1]!;
  for (const id of wardIds.slice(0, 2)) await db.userWard.create({ data: { userId: nurse.id, wardId: id } });

  const total = await db.bed.count();
  console.log(`Seeded ${WARDS.length} wards, ${total} beds, ${occupiedCount} admissions, ${dischargeCount} pending discharges.`);
  console.log(`Demo logins (password "${DEMO_PASSWORD}"): ${users.map((u) => `${u.role}=${u.phone}`).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
