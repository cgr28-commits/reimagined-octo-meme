import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import PreventHorizontalScroll from "@/components/PreventHorizontalScroll";
import CookieConsent from "@/components/CookieConsent";
import GoogleAdsTag from "@/components/GoogleAdsTag";
import AdsAttributionCapture from "@/components/AdsAttributionCapture";
import AdFraudMonitor from "@/components/AdFraudMonitor";
import QuoteAssistant from "@/components/QuoteAssistant";
import SiteHashScroll from "@/components/SiteHashScroll";
import SiteOfflineGate from "@/components/SiteOfflineGate";
import { SITE, SITE_OFFLINE, SITE_PUBLIC_SEO_DESCRIPTION } from "@/lib/data";
import {
  arePublicLivePricesEnabled,
  getPublicUnapprovedPriceLabel,
} from "@/lib/pricing-config";
import { getGoogleAdsConfig } from "@/lib/google-ads";
import { absoluteSiteUrl } from "@/lib/paths";
import { getFaqPageJsonLd, getLocalBusinessJsonLd, getWebSiteJsonLd } from "@/lib/structured-data";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

const offlineActive = SITE_OFFLINE.enabled && Date.parse(SITE_OFFLINE.until) > Date.now();

const livePrices = arePublicLivePricesEnabled();
const description = offlineActive
  ? `${SITE.name} is temporarily offline. WhatsApp @${SITE.whatsappUsername} for bookings.`
  : livePrices
    ? SITE_PUBLIC_SEO_DESCRIPTION
    : `${SITE_PUBLIC_SEO_DESCRIPTION} ${getPublicUnapprovedPriceLabel()} — request a quote online.`;

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
    <html lang="en-GB" className={`${manrope.variable} ${cormorant.variable}`}>
      <body className="overflow-x-clip antialiased">
        {/* TrafficGuard sitewide pageview tracking */}
        <Script id="trafficguard-init" strategy="afterInteractive">
          {`
            window.dataTrafficGuard = window.dataTrafficGuard || [];
            window.dataTrafficGuard.push(['property_group_id', 'tg-g-026255-001']);
            window.dataTrafficGuard.push(['event', 'pageview']);
          `}
        </Script>
        <Script
          id="trafficguard-script"
          src="https://tgtag.io/tg.js?pid=tg-g-026255-001"
          strategy="afterInteractive"
        />
        <noscript>
          {/* TrafficGuard requires a raw tracking pixel when JavaScript is disabled. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://p.tgtag.io/event?property_group_id=tg-g-026255-001&event_name=pageview&no_script=1"
            width="1"
            height="1"
            style={{ border: 0 }}
            alt=""
          />
        </noscript>
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
          <AdFraudMonitor />
          <SiteHashScroll />
          <QuoteAssistant />
          <CookieConsent />
        </SiteOfflineGate>
        <PreventHorizontalScroll />
      </body>
    </html>
  );
}
