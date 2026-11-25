"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { callApi } from "@/lib/client-api";

export function SetupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return setError("Passwords do not match");
    setBusy(true);
    setError("");
    const r = await callApi("/api/setup", "POST", {
      hospitalName: f.get("hospitalName"),
      name: f.get("name"),
      phone: f.get("phone"),
      password: f.get("password"),
    });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    router.push("/login");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <p role="alert" className="rounded-md border border-red-600 bg-red-100 p-2 text-sm text-red-900">
          {error}
        </p>
      )}
      <Field label="Hospital name"><Input name="hospitalName" required minLength={2} maxLength={120} /></Field>
      <Field label="Your name"><Input name="name" required maxLength={80} /></Field>
      <Field label="Your mobile number (used to log in)">
        <Input name="phone" type="tel" inputMode="numeric" required maxLength={10} />
      </Field>
      <Field label="Password (at least 8 characters)">
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
      </Field>
      <Field label="Confirm password">
        <Input name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating..." : "Create administrator"}</Button>
    </form>
  );
}
