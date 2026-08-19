import type { Metadata } from "next";
import SavedQuoteCustomerClient from "./SavedQuoteCustomerClient";

export const metadata: Metadata = {
  title: "Your saved quote | My Airport Taxi NI",
  description: "Review your fixed-price airport transfer quote and book securely.",
  robots: { index: false, follow: false },
};

/**
 * Static-export friendly (GitHub Pages): token is read from ?t= in the client.
 * Fare is never taken from the URL — only the opaque token; price comes from KV.
 */
export default function SavedQuotePage() {
  return (
    <main className="min-h-screen bg-navy px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto mb-6 max-w-lg text-center sm:mb-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald">
          My Airport Taxi NI
        </p>
      </div>
      <SavedQuoteCustomerClient />
    </main>
  );
}
