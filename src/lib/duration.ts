type Time = (key: "min" | "hoursMin", values: { n?: number; h?: number; m?: number }) => string;

/** "45 min" or "2 h 10 min", in the screen's language. `t` is useTranslations("time"). */
export function formatMinutes(minutes: number, t: Time): string {
  const m = Math.max(0, Math.round(minutes));
  return m < 60 ? t("min", { n: m }) : t("hoursMin", { h: Math.floor(m / 60), m: m % 60 });
}
