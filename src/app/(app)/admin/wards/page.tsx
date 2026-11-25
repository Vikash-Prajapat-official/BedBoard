import { db } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { WardsManager } from "./wards-manager";

export default async function AdminWardsPage() {
  await requireUser(["ADMIN"]);
  const wards = await db.ward.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { beds: true } } },
  });
  return (
    <WardsManager
      wards={wards.map((w) => ({
        id: w.id,
        name: w.name,
        gender: w.gender,
        floor: w.floor,
        specialty: w.specialty ?? "",
        active: w.active,
        bedCount: w._count.beds,
      }))}
    />
  );
}
