import type { Metadata } from "next";
import TapPageClient from "./TapPageClient";
import "./tap.css";

export const metadata: Metadata = {
  title: "Thank you | My Airport Taxi NI",
  description: "Thank you for travelling with My Airport Taxi NI. Leave a review, tip, save our contact, book again, or WhatsApp us.",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  alternates: {
    canonical: "/tap/",
  },
};

/** Static-export friendly NFC / QR passenger landing page. */
export default function TapPage() {
  return <TapPageClient />;
}
