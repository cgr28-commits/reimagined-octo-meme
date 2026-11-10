import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import PreventHorizontalScroll from "@/components/PreventHorizontalScroll";
import CookieConsent from "@/components/CookieConsent";
import GoogleAdsTag from "@/components/GoogleAdsTag";
import AdsAttributionCapture from "@/components/AdsAttributionCapture";
import AdFraudMonitor from "@/components/AdFraudMonitor";
import SiteHashScroll from "@/components/SiteHashScroll";
import WhatsAppQrFloating from "@/components/WhatsAppQrLauncher";
import SiteOfflineGate from "@/components/SiteOfflineGate";
import { SITE, SITE_OFFLINE, SITE_PUBLIC_SEO_DESCRIPTION } from "@/lib/data";
import {
  arePublicLivePricesEnabled,
  getPublicUnapprovedPriceLabel,
} from "@/lib/pricing-config";
import { getGoogleAdsConfig } from "@/lib/google-ads";
import { absoluteSiteUrl } from "@/lib/paths";
import { getLocalBusinessJsonLd, getWebSiteJsonLd } from "@/lib/structured-data";
import { TIP_TOKEN_STRIP_SCRIPT } from "../../shared/journey-tip";

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
    : `${SITE.name} | Airport Transfers`,
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
  // No site-wide twitter:title/description: X falls back to each page's own
  // og:title/og:description, so shared links preview the actual page.
  twitter: {
    card: "summary_large_image",
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
  const structuredData = [getWebSiteJsonLd(), getLocalBusinessJsonLd()];

  const googleAdsConfig = getGoogleAdsConfig();

  return (
    <html lang="en-GB" className={`${manrope.variable} ${cormorant.variable}`} suppressHydrationWarning>
      <body className="overflow-x-clip antialiased">
        {/* Mobile Design 3 is the default on phones and portrait tablets (below 1024px); 1024-1199px keeps the
            existing tablet layout and 1200px+ is the desktop design. The switch follows window resizes.
            ?mobile=classic switches back to the previous mobile design on this browser; ?mobile=d3 returns.
            ?mobile=light (Design 2 preview) is only available away from the live domain.
            Browsers without :has()/color-mix() keep the previous mobile design. */}
        <Script id="matni-mobile-design" strategy="beforeInteractive">
          {`try{var k="matni-mobile-design",live=/myairporttaxini\.co\.uk$/i.test(location.hostname),q=new URLSearchParams(location.search).get("mobile");if(q==="classic"||q==="d3"||(!live&&q==="light"))localStorage.setItem(k,q);var m=localStorage.getItem(k);if(m!=="classic"&&(live||m!=="light"))m="d3";if(m!=="classic"&&window.CSS&&CSS.supports("color","color-mix(in oklab, red, red)")&&CSS.supports("selector(:has(a))")){var d=document.documentElement,mq=window.matchMedia("(max-width: 1199.98px)"),on=function(){if(mq.matches){if(!d.hasAttribute("data-mobile-light"))d.setAttribute("data-mobile-light","");if(m==="d3"&&!d.hasAttribute("data-mobile-d3"))d.setAttribute("data-mobile-d3","")}else{if(d.hasAttribute("data-mobile-light"))d.removeAttribute("data-mobile-light");if(d.hasAttribute("data-mobile-d3"))d.removeAttribute("data-mobile-d3")}};on();if(mq.addEventListener)mq.addEventListener("change",on);new MutationObserver(on).observe(d,{attributes:true,attributeFilter:["data-mobile-light","data-mobile-d3"]})}}catch(e){}`}
        </Script>
        <Script id="strip-tip-token" strategy="beforeInteractive">
          {TIP_TOKEN_STRIP_SCRIPT}
        </Script>
        <Script id="matni-landing-click-id" strategy="beforeInteractive">
          {`try{if(!window.__matniLandingSearch&&typeof window.location.search==="string"&&window.location.search.length>1){window.__matniLandingSearch=window.location.search}}catch(e){}`}
        </Script>
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
          <WhatsAppQrFloating />
          <CookieConsent />
        </SiteOfflineGate>
        <PreventHorizontalScroll />
      </body>
    </html>
  );
}
