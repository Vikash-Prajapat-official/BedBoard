import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SECTIONS = [
  { href: "/admin/wards", k: "wards" },
  { href: "/admin/beds", k: "beds" },
  { href: "/admin/users", k: "users" },
  { href: "/admin/audit", k: "audit" },
] as const;

export default async function AdminPage() {
  await requireUser(["ADMIN"]);
  const t = await getTranslations("admin.index");
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {SECTIONS.map((s) => (
        <Link key={s.href} href={s.href}>
          <Card className="h-full hover:border-blue-700">
            <CardHeader><CardTitle>{t(`${s.k}.title`)}</CardTitle></CardHeader>
            <CardContent className="text-sm text-slate-700">{t(`${s.k}.text`)}</CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
