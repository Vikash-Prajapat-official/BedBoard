import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PinForm } from "./pin-form";

export default async function ProfilePage() {
  const user = await requireUser();
  const [t, tr] = await Promise.all([getTranslations("profile"), getTranslations("role")]);
  const me = await db.user.findUnique({ where: { id: user.id }, select: { phone: true, pinHash: true } });
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{user.name}</CardTitle>
        <p className="text-sm text-slate-700">{t("line", { role: tr(user.role), phone: me?.phone ?? "" })}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <h3 className="font-medium">{t("pinTitle")}</h3>
        <p className="text-sm text-slate-700">
          {me?.pinHash ? t("pinSet") : t("noPin")} {t("pinExplain")}
        </p>
        <PinForm />
      </CardContent>
    </Card>
  );
}
