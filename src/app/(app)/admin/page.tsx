import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SECTIONS = [
  { href: "/admin/wards", title: "Wards", text: "Add wards, set gender, floor and specialty." },
  { href: "/admin/beds", title: "Beds", text: "Add beds in bulk (for example Bed 1 to 30), set bed types." },
  { href: "/admin/users", title: "Staff", text: "Create logins, choose roles, give nurses their wards." },
];

export default async function AdminPage() {
  await requireUser(["ADMIN"]);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {SECTIONS.map((s) => (
        <Link key={s.href} href={s.href}>
          <Card className="h-full hover:border-blue-700">
            <CardHeader><CardTitle>{s.title}</CardTitle></CardHeader>
            <CardContent className="text-sm text-slate-600">{s.text}</CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
