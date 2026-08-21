import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import PreventHorizontalScroll from "@/components/PreventHorizontalScroll";
import CookieConsent from "@/components/CookieConsent";
import GoogleAdsTag from "@/components/GoogleAdsTag";
import AdsAttributionCapture from "@/components/AdsAttributionCapture";
import QuoteAssistant from "@/components/QuoteAssistant";
import QuoteHashScroll from "@/components/QuoteHashScroll";
import SiteOfflineGate from "@/components/SiteOfflineGate";
import { SITE, SITE_OFFLINE } from "@/lib/data";
import {
  arePublicLivePricesEnabled,
  getPublicUnapprovedPriceLabel,
} from "@/lib/pricing-config";
import { getGoogleAdsConfig } from "@/lib/google-ads";
import { absoluteSiteUrl } from "@/lib/paths";
import { getFaqPageJsonLd, getLocalBusinessJsonLd, getWebSiteJsonLd } from "@/lib/structured-data";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const offlineActive = SITE_OFFLINE.enabled && Date.parse(SITE_OFFLINE.until) > Date.now();

const livePrices = arePublicLivePricesEnabled();
const defaultSiteDescription =
  "Professional airport transfers across Northern Ireland and beyond. Clear fixed prices, airport pickup and drop-off options, flight monitoring and secure online booking.";
const description = offlineActive
  ? `${SITE.name} is temporarily offline. Call ${SITE.landlineDisplay} or WhatsApp @${SITE.whatsappUsername} for bookings.`
  : livePrices
    ? defaultSiteDescription
    : `${defaultSiteDescription} ${getPublicUnapprovedPriceLabel()} — request a quote online.`;

const ogImage = {
  url: absoluteSiteUrl("/og-image-square.png"),
  width: 1200,
  height: 1200,
  alt: `${SITE.name} — Premium Airport Transfers`,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: offlineActive
    ? `${SITE.name} | Temporarily offline`
    : `${SITE.name} | Premium Airport Transfers Northern Ireland`,
  description,
  robots: offlineActive
    ? {
        index: false,
        follow: false,
        googleBot: {
          index: false,
          follow: false,
        },
      }
    : {
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
    "Belfast City Airport taxi",
    "Belfast International Airport transfer",
    "Northern Ireland taxi",
    "Dublin airport taxi",
    "airport shuttle NI",
    "chauffeur Belfast",
    "executive private hire NI",
  ],
  openGraph: {
    title: SITE.name,
    description,
    type: "website",
    locale: "en_GB",
    url: SITE.url,
    siteName: SITE.name,
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.name,
    description,
    images: [ogImage.url],
  },
  // Navy circle brand mark (white car + green plane). ?v= busts sticky crawler/browser caches.
  icons: {
    icon: [
      { url: absoluteSiteUrl("/favicon.ico?v=20260811navy"), sizes: "any" },
      {
        url: absoluteSiteUrl("/favicon-32.png?v=20260811navy"),
        type: "image/png",
        sizes: "32x32",
      },
      {
        url: absoluteSiteUrl("/favicon.png?v=20260811navy"),
        type: "image/png",
        sizes: "256x256",
      },
      {
        url: absoluteSiteUrl("/icon.png?v=20260811navy"),
        type: "image/png",
        sizes: "512x512",
      },
    ],
    apple: absoluteSiteUrl("/icon.png?v=20260811navy"),
    shortcut: absoluteSiteUrl("/favicon.ico?v=20260811navy"),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = [getWebSiteJsonLd(), getLocalBusinessJsonLd(), getFaqPageJsonLd()];

  const googleAdsConfig = getGoogleAdsConfig();

  return (
    <html lang="en-GB" className={inter.variable}>
      <body className="overflow-x-clip antialiased">
        {googleAdsConfig.tagEnabled ? (
          <Script id="google-consent-default" strategy="beforeInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('consent', 'default', {
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied',
                analytics_storage: 'denied',
                wait_for_update: 500
              });
            `}
          </Script>
        ) : null}
        {structuredData.map((schema, index) => (
          <script
            key={Array.isArray(schema["@type"]) ? schema["@type"].join("-") : schema["@type"] ?? index}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}
        <SiteOfflineGate>
          <div className="relative w-full max-w-full overflow-x-clip">
            {children}
          </div>
          {/* Outside the overflow clip so position:fixed is viewport-relative on mobile */}
          <GoogleAdsTag />
          <AdsAttributionCapture />
          <QuoteHashScroll />
          <QuoteAssistant />
          <CookieConsent />
        </SiteOfflineGate>
        <PreventHorizontalScroll />
      </body>
    </html>
  );
}
