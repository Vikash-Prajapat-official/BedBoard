import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BedBoard",
  description: "Free, open-source live bed board for hospitals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
