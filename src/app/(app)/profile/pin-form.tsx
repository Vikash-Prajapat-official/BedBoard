"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { callApi } from "@/lib/client-api";

export function PinForm() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await callApi("/api/me/pin", "POST", { password: f.get("password"), pin: f.get("pin") });
    if (r.ok) {
      form.reset();
      setMsg({ ok: true, text: "PIN saved" });
      router.refresh();
    } else setMsg({ ok: false, text: r.message });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Current password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
      <Field label="New 4-digit PIN">
        <Input name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required />
      </Field>
      <Button type="submit">Save PIN</Button>
      {msg && (
        <p role="status" className={msg.ok ? "text-sm text-green-800" : "text-sm text-red-800"}>{msg.text}</p>
      )}
    </form>
  );
}
