export const ROLES = ["ADMIN", "NURSE", "DESK", "DOCTOR", "HOUSEKEEPING", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const BED_TYPES = ["GENERAL", "OXYGEN", "VENTILATOR", "ICU", "COT", "ISOLATION"] as const;
export type BedType = (typeof BED_TYPES)[number];

export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Cookie wins; otherwise Hindi if the browser asks for it first; otherwise English. */
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (cookie === "hi" || cookie === "en") return cookie;
  const first = acceptLanguage?.split(",")[0]?.trim().toLowerCase() ?? "";
  return first === "hi" || first.startsWith("hi-") ? "hi" : "en";
}

export const WARD_GENDERS = ["MALE", "FEMALE", "ANY"] as const;
export type WardGender = (typeof WARD_GENDERS)[number];
