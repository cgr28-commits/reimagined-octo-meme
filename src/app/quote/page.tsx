import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SavedQuoteCustomerClient from "./SavedQuoteCustomerClient";

export const metadata: Metadata = {
  title: "Your saved quote | My Airport Taxi NI",
  description: "Retrieve your airport transfer details and recalculate your fare before booking.",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

/**
 * Static-export friendly (GitHub Pages): token is read from the URL in the client.
 * Fare is never taken from the URL — only the opaque token; price comes from KV.
 * Same header, quote tool and footer as the homepage (owner, 13 Nov 2026).
 */
export default function SavedQuotePage() {
  return (
    <>
      <Header />
      <main className="overflow-x-clip bg-navy">
        <SavedQuoteCustomerClient />
      </main>
      <Footer />
    </>
  );
}
