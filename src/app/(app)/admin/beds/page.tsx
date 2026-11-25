import { db } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { BedsManager } from "./beds-manager";

export default async function AdminBedsPage() {
  await requireUser(["ADMIN"]);
  const wards = await db.ward.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      beds: { select: { id: true, label: true, bedType: true, status: true } },
    },
  });
  // Natural order so "Bed 2" comes before "Bed 10".
  const collator = new Intl.Collator("en", { numeric: true });
  return (
    <BedsManager
      wards={wards.map((w) => ({ ...w, beds: [...w.beds].sort((a, b) => collator.compare(a.label, b.label)) }))}
    />
  );
}
