import { getTranslations } from "next-intl/server";
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
  const [t, tb, tx, tc, sp] = await Promise.all([getTranslations("find"), getTranslations("bedType"), getTranslations("sex"), getTranslations("common"), searchParams]);
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
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <span className="ml-auto"><LiveRefresh /></span>
      </div>

      <form method="get" className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-4 sm:items-end">
        <Field label={t("type")}>
          <Select name="type" defaultValue={type ?? ""}>
            <option value="">{tc("any")}</option>
            {BED_TYPES.map((x) => <option key={x} value={x}>{tb(x)}</option>)}
          </Select>
        </Field>
        <Field label={t("sex")}>
          <Select name="gender" defaultValue={gender ?? ""}>
            <option value="">{tc("any")}</option><option value="MALE">{tx("MALE")}</option><option value="FEMALE">{tx("FEMALE")}</option>
          </Select>
        </Field>
        <Field label={t("ward")}>
          <Select name="ward" defaultValue={ward ?? ""}>
            <option value="">{t("allWards")}</option>
            {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </Field>
        <Button type="submit">{t("search")}</Button>
      </form>

      <FindBedList beds={beds} reserved={reserved} reservationMinutes={getEnv().RESERVATION_MINUTES} />
    </div>
  );
}
