import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
// Self-hosted fonts (no request to Google): Inter for English, Noto Sans Devanagari for Hindi.
import "@fontsource-variable/inter";
import "@fontsource-variable/noto-sans-devanagari";
import "./globals.css";
import { ErrorMessages } from "@/components/error-messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("title"),
    description: t("description"),
    applicationName: "BedBoard",
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: "BedBoard", statusBarStyle: "default" },
  };
}

export const viewport: Viewport = { themeColor: "#1D4ED8", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider>
          <ErrorMessages locale={locale} messages={messages.errors as unknown as Record<string, string>} />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
