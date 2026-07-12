import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SITE } from "@/lib/data";
import { withBasePath } from "@/lib/paths";
import { getFaqPageJsonLd, getLocalBusinessJsonLd } from "@/lib/structured-data";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const description =
  "Professional airport taxi transfers across Northern Ireland. Flight tracking, meet & greet, and transfers from Belfast International, Dublin, and more. Book via WhatsApp.";

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
  alternates: {
    canonical: "/",
  },
  keywords: [
    "airport taxi",
    "Belfast airport transfer",
    "Northern Ireland taxi",
    "Dublin airport taxi",
    "airport shuttle NI",
  ],
  openGraph: {
    title: SITE.name,
    description: SITE.tagline,
    type: "website",
    locale: "en_GB",
    url: SITE.url,
    siteName: SITE.name,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${SITE.name} — Premium Airport Transfers`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.name,
    description: SITE.tagline,
    images: ["/og-image.png"],
  },
  icons: {
    icon: withBasePath("/favicon.png"),
    apple: withBasePath("/favicon.png"),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = [getLocalBusinessJsonLd(), getFaqPageJsonLd()];

  return (
    <html lang="en-GB" className={inter.variable}>
      <body className="antialiased">
        {structuredData.map((schema) => (
          <script
            key={schema["@type"]}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}
        {children}
      </body>
    </html>
  );
}
