import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import QuoteAssistant from "@/components/QuoteAssistant";
import { SITE } from "@/lib/data";
import { absoluteSiteUrl } from "@/lib/paths";
import { getFaqPageJsonLd, getLocalBusinessJsonLd, getWebSiteJsonLd } from "@/lib/structured-data";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const description =
  "Professional airport taxi transfers across Northern Ireland. Belfast International from £45, Dublin Airport, and City of Derry Airport transfers. Flight tracking, meet & greet. Get an instant price online or through WhatsApp.";

const ogImage = {
  url: absoluteSiteUrl("/og-image-square.png"),
  width: 1200,
  height: 1200,
  alt: `${SITE.name} — Premium Airport Transfers`,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: `${SITE.name} | Premium Airport Transfers Northern Ireland`,
  description,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  keywords: [
    "airport taxi",
    "Belfast airport transfer",
    "Northern Ireland taxi",
    "Dublin airport taxi",
    "airport shuttle NI",
    "chauffeur Belfast",
    "executive private hire NI",
  ],
  openGraph: {
    title: SITE.name,
    description: SITE.tagline,
    type: "website",
    locale: "en_GB",
    url: SITE.url,
    siteName: SITE.name,
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.name,
    description: SITE.tagline,
    images: [ogImage.url],
  },
  icons: {
    icon: [
      { url: absoluteSiteUrl("/favicon.ico"), sizes: "any" },
      {
        url: absoluteSiteUrl("/favicon.png"),
        type: "image/png",
        sizes: "256x256",
      },
      {
        url: absoluteSiteUrl("/favicon-32.png"),
        type: "image/png",
        sizes: "32x32",
      },
      {
        url: absoluteSiteUrl("/icon.png"),
        type: "image/png",
        sizes: "512x512",
      },
    ],
    apple: absoluteSiteUrl("/favicon.png"),
    shortcut: absoluteSiteUrl("/favicon.ico"),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = [getWebSiteJsonLd(), getLocalBusinessJsonLd(), getFaqPageJsonLd()];

  return (
    <html lang="en-GB" className={inter.variable}>
      <body className="overflow-x-hidden antialiased">
        {structuredData.map((schema) => (
          <script
            key={schema["@type"]}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}
        <div className="relative w-full max-w-full overflow-x-hidden">
          {children}
          <QuoteAssistant />
        </div>
      </body>
    </html>
  );
}
