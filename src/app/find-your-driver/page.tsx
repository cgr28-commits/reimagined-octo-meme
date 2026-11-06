import type { Metadata } from "next";
import FindDriverClient from "./FindDriverClient";

export const metadata: Metadata = {
  title: "Find Your Driver | My Airport Taxi NI",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  // Origin only: OpenStreetMap tiles require a referrer; no path or link secret is ever sent
  // (the secret lives in the fragment, which browsers never put in a Referer).
  referrer: "strict-origin",
};

/**
 * Static-export friendly customer page. The booking-specific link secret is in
 * the URL fragment and is read in the browser only.
 */
export default function FindYourDriverPage() {
  return <FindDriverClient />;
}
