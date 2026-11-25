import { db } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { UsersManager } from "./users-manager";

export default async function AdminUsersPage() {
  const me = await requireUser(["ADMIN"]);
  const [users, wards] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, phone: true, role: true, active: true, pinHash: true, wards: { select: { wardId: true } } },
    }),
    db.ward.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }], select: { id: true, name: true } }),
  ]);
  return (
    <UsersManager
      meId={me.id}
      wards={wards}
      users={users.map((u) => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        role: u.role,
        active: u.active,
        hasPin: !!u.pinHash,
        wardIds: u.wards.map((w) => w.wardId),
      }))}
    />
  );
}
