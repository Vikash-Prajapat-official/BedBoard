import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if ((await db.user.count()) > 0) redirect("/login");
  const t = await getTranslations("setup");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 p-4">
      <div className="flex justify-end"><LocaleSwitcher /></div>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl text-blue-700">{t("title")}</CardTitle>
          <p className="text-sm text-slate-700">{t("intro")}</p>
        </CardHeader>
        <CardContent>
          <SetupForm />
        </CardContent>
      </Card>
    </main>
  );
}
