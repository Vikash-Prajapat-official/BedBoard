/**
 * The API answers in English with a stable `code`. In Hindi the screen swaps the sentence for the
 * Hindi one with the same code. Set once per page by <ErrorMessages /> in the root layout.
 */
let current: { locale: string; messages: Record<string, string> } = { locale: "en", messages: {} };

export function setErrorMessages(locale: string, messages: Record<string, string>) {
  current = { locale, messages };
}

export function localizedError(code: string | undefined, fallback: string): string {
  if (current.locale === "en" || !code) return fallback;
  const m = current.messages[code];
  if (!m) return fallback;
  // The server's detail (which field, what is wrong) is only in English: keep it next to the Hindi sentence.
  return code === "VALIDATION" && fallback ? `${m} (${fallback})` : m;
}
