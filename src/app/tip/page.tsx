import type { Metadata } from "next";
import TipPageClient from "./TipPageClient";

export const metadata: Metadata = {
  title: "Leave a tip | My Airport Taxi NI",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  referrer: "no-referrer",
};

/**
 * Static-export friendly. The opaque token is read in the browser from ?t=
 * and removed from the address bar before analytics scripts run.
 */
export default function TipPage() {
  return <TipPageClient />;
}
