import type { Metadata } from "next";
import DigitalCardClient from "./DigitalCardClient";
import { SITE } from "@/lib/data";
import { absoluteSiteUrl } from "@/lib/paths";

const title = `${SITE.name} | Belfast & Dublin Airport Transfers`;
const description =
  "Belfast International, Belfast City & Dublin Airport transfers. Get an instant quote, book securely online, call 028 9602 2952 or save our contact details.";

/** Branded 1200×630 link preview (WhatsApp, iMessage, Facebook). ?v= busts WhatsApp's preview cache. */
const ogImage = {
  url: absoluteSiteUrl("/og-card.png?v=20261114"),
  width: 1200,
  height: 630,
  type: "image/png",
  alt: `${SITE.name} — Belfast & Dublin Airport Transfers`,
};

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/card/",
  },
  openGraph: {
    title: SITE.name,
    description,
    type: "website",
    locale: "en_GB",
    url: absoluteSiteUrl("/card/"),
    siteName: SITE.name,
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.name,
    description,
    images: [ogImage.url],
  },
  // Label under the icon when a customer adds the card to their iPhone home screen. Set as a plain
  // meta tag (not `appleWebApp`), so the shortcut still opens in Safari like the rest of the site.
  other: {
    "apple-mobile-web-app-title": "Airport Taxi NI",
  },
};

export default function DigitalCardPage() {
  return <DigitalCardClient />;
}
