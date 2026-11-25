"use client";

import { setErrorMessages } from "@/lib/error-messages";

export function ErrorMessages({ locale, messages }: { locale: string; messages: Record<string, string> }) {
  // Set while rendering (not in an effect) so it is ready before any button can be pressed.
  setErrorMessages(locale, messages);
  return null;
}
