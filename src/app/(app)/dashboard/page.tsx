import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Counts only, never patient names. The live, SSE-updated hospital dashboard replaces this in Phase 4.
export default async function DashboardPage() {
  const user = await requireUser();
  const [wards, grouped] = await Promise.all([
    db.ward.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    db.bed.groupBy({ by: ["wardId", "status"], where: { ward: { active: true } }, _count: { _all: true } }),
  ]);
  const count = (wardId: string, status?: string) =>
    grouped.filter((g) => g.wardId === wardId && (!status || g.status === status)).reduce((n, g) => n + g._count._all, 0);
  const canOpen = ["NURSE", "DESK", "DOCTOR", "ADMIN"].includes(user.role);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Welcome, {user.name}</h1>
      {wards.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-700">
            No wards yet.{" "}
            {user.role === "ADMIN" ? (
              <>Set up your <Link className="text-blue-700 underline" href="/admin/wards">wards</Link>, <Link className="text-blue-700 underline" href="/admin/beds">beds</Link> and <Link className="text-blue-700 underline" href="/admin/users">staff</Link>.</>
            ) : "Ask an administrator to add them."}
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {wards.map((w) => {
            const body = (
              <Card className={canOpen ? "hover:border-blue-700" : ""}>
                <CardHeader><CardTitle>{w.name}</CardTitle></CardHeader>
                <CardContent className="text-sm text-slate-700">
                  <p><strong>{count(w.id, "FREE")}</strong> free of {count(w.id)} beds</p>
                  <p>{count(w.id, "DISCHARGE_PLANNED")} discharges planned · {count(w.id, "CLEANING")} cleaning</p>
                </CardContent>
              </Card>
            );
            return <li key={w.id}>{canOpen ? <Link href={`/wards/${w.id}`}>{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
