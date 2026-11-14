import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist } from "next/font/google";

import { Analytics } from "@/components/consent/analytics";
import { CookieBanner } from "@/components/consent/cookie-banner";
import { DemoBanner } from "@/components/demo-banner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

/** Display face for headlines: chunky, a bit playful, like hand-written gift tags. */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  // Absolute base for Open Graph images and canonical URLs.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
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
    <html lang="pl" className={`${geistSans.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#tresc"
          className="sr-only z-50 rounded-md bg-background px-4 py-2 font-medium focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-[3px] focus:ring-ring"
        >
          Przejdź do treści
        </a>
        <DemoBanner />
        <SiteHeader />
        <main id="tresc" tabIndex={-1} className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 outline-none">
          {children}
        </main>
        <SiteFooter />
        <CookieBanner />
        <Analytics
          posthogKey={process.env.NEXT_PUBLIC_POSTHOG_KEY || null}
          posthogHost={process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com"}
        />
      </body>
    </html>
  );
}
