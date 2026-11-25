import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, pickLocale } from "@/lib/constants";

// No /en or /hi in the URL: the language is a cookie set by the switcher, so every address (and the
// installed app's start page) stays the same for everyone.
export default getRequestConfig(async () => {
  const locale = pickLocale((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get("accept-language"));
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
