import { CheckCircle2, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { STATUS_META, type BedStatusKey } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

async function load() {
  try {
    const [wards, grouped] = await Promise.all([
      db.ward.count(),
      db.bed.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    return { ok: true as const, wards, grouped };
  } catch {
    return { ok: false as const };
  }
}

// Counts only. No patient data is ever read or shown here.
export default async function HealthPage() {
  const result = await load();

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-bold text-blue-700">BedBoard health</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            App <Badge variant="ok"><CheckCircle2 size={14} aria-hidden /> Running</Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Database{" "}
            {result.ok ? (
              <Badge variant="ok"><CheckCircle2 size={14} aria-hidden /> Connected</Badge>
            ) : (
              <Badge variant="bad"><XCircle size={14} aria-hidden /> Not reachable</Badge>
            )}
          </CardTitle>
        </CardHeader>
        {result.ok && (
          <CardContent>
            <p className="mb-3 text-sm text-slate-700">{result.wards} wards</p>
            {result.grouped.length === 0 ? (
              <p className="text-sm text-slate-600">
                No beds yet. Run <code>docker compose exec app npx prisma db seed</code>.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-2">
                {result.grouped.map((g) => {
                  const meta = STATUS_META[g.status as BedStatusKey];
                  const Icon = meta.icon;
                  return (
                    <li key={g.status} className={`flex items-center gap-2 rounded-md border-l-4 p-2 text-sm ${meta.className}`}>
                      <Icon size={16} aria-hidden />
                      <span>{meta.label}</span>
                      <strong className="ml-auto">{g._count._all}</strong>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        )}
      </Card>
    </main>
  );
}
