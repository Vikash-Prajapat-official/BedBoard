import { db } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { getReservedBeds, searchFreeBeds } from "@/lib/bed-queries";
import { getEnv } from "@/lib/env";
import { BED_TYPES, type BedType } from "@/lib/constants";
import { LiveRefresh } from "@/components/live-refresh";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { FindBedList } from "./find-bed-list";

export const dynamic = "force-dynamic";

export default async function FindBedPage({ searchParams }: { searchParams: Promise<{ type?: string; gender?: string; ward?: string }> }) {
  await requireUser(["DESK"]);
  const sp = await searchParams;
  const type = (BED_TYPES as readonly string[]).includes(sp.type ?? "") ? (sp.type as BedType) : undefined;
  const gender = sp.gender === "MALE" || sp.gender === "FEMALE" ? sp.gender : undefined;
  const ward = sp.ward || undefined;

  const [wards, beds, reserved] = await Promise.all([
    db.ward.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }], select: { id: true, name: true } }),
    searchFreeBeds({ type, gender, wardId: ward }),
    getReservedBeds(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">Find a bed</h1>
        <span className="ml-auto"><LiveRefresh /></span>
      </div>

      <form method="get" className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-4 sm:items-end">
        <Field label="Bed type">
          <Select name="type" defaultValue={type ?? ""}>
            <option value="">Any</option>
            {BED_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
          </Select>
        </Field>
        <Field label="Patient sex">
          <Select name="gender" defaultValue={gender ?? ""}>
            <option value="">Any</option><option value="MALE">Male</option><option value="FEMALE">Female</option>
          </Select>
        </Field>
        <Field label="Ward">
          <Select name="ward" defaultValue={ward ?? ""}>
            <option value="">All wards</option>
            {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </Field>
        <Button type="submit">Search</Button>
      </form>

      <FindBedList beds={beds} reserved={reserved} reservationMinutes={getEnv().RESERVATION_MINUTES} />
    </div>
  );
}
