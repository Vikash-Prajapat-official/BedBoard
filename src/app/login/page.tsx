import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // A brand-new install has no users: send the hospital to first-run setup.
  if ((await db.user.count()) === 0) redirect("/setup");
  if ((await auth())?.user) redirect("/dashboard");
  const { error } = await searchParams;

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
    <main className="mx-auto flex min-h-screen max-w-sm items-center p-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl text-blue-700">BedBoard login</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={login} className="space-y-4">
            {error && (
              <p role="alert" className="rounded-md border border-red-600 bg-red-100 p-2 text-sm text-red-900">
                Wrong phone number or password, or too many attempts. Wait a few minutes and try again.
              </p>
            )}
            <Field label="Mobile number">
              <Input name="phone" type="tel" inputMode="numeric" autoComplete="username" required maxLength={10} />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" autoComplete="current-password" required />
            </Field>
            <Button type="submit" className="w-full">Log in</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
