import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Prezentownik AI – trafione prezenty w 60 sekund",
  description:
    "Wrzuć zdjęcie, odpowiedz na 6 pytań i dostań 5 trafionych prezentów z polskich sklepów.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
