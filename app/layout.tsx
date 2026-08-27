import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Cormorant_Garamond, Plus_Jakarta_Sans, Vazirmatn } from "next/font/google";
import "./globals.css";
import { isRtl, LANG_COOKIE, parseLang } from "../lib/i18n";

const sans = Plus_Jakarta_Sans({ variable: "--font-sans", subsets: ["latin"] });
// Persian needs a face with real Arabic-script coverage; Vazirmatn is the
// standard choice and carries Latin too, so mixed lines stay even.
const persian = Vazirmatn({ variable: "--font-persian", subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"] });
const serif = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["500", "600"],
});

/* viewport-fit=cover is what makes env(safe-area-inset-*) mean anything on a
   phone with a notch and a home indicator; without it iOS letterboxes the
   page and every inset reads as zero. Apple's guidance is to cover the screen
   and then keep content out of those insets yourself, which globals.css does. */
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" as const };

export const metadata: Metadata = {
  metadataBase: new URL("https://darabiha.com"),
  title: "Darabiha · Our family tree",
  description: "A living record of the Darabi family, built together.",
  openGraph: {
    title: "Darabiha",
    description: "A living record of the Darabi family.",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Darabiha",
    description: "A living record of the Darabi family.",
    images: ["/og.png"],
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <html lang={lang} dir={isRtl(lang) ? "rtl" : "ltr"}>
      <body className={`${sans.variable} ${serif.variable} ${persian.variable}`}><div className="grain-overlay" aria-hidden="true" />{children}</body>
    </html>
  );
}
