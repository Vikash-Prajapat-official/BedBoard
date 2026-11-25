import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { getTranslations } from "next-intl/server";
import { auth, signIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // A brand-new install has no users: send the hospital to first-run setup.
  if ((await db.user.count()) === 0) redirect("/setup");
  if ((await auth())?.user) redirect("/dashboard");
  const [{ error }, t] = await Promise.all([searchParams, getTranslations("login")]);

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        phone: String(formData.get("phone") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirectTo: "/dashboard",
      });
    } catch (e) {
      if (e instanceof AuthError) redirect("/login?error=1");
      throw e; // the success redirect is thrown by Next and must pass through
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-3 p-4">
      <div className="flex justify-end"><LocaleSwitcher /></div>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl text-blue-700">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={login} className="space-y-4">
            {error && (
              <p role="alert" className="rounded-md border border-red-600 bg-red-100 p-2 text-sm text-red-900">{t("error")}</p>
            )}
            <Field label={t("mobile")}>
              <Input name="phone" type="tel" inputMode="numeric" autoComplete="username" required maxLength={10} />
            </Field>
            <Field label={t("password")}>
              <Input name="password" type="password" autoComplete="current-password" required />
            </Field>
            <Button type="submit" className="w-full">{t("submit")}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
