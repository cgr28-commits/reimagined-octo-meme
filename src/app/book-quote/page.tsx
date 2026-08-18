import type { Metadata } from "next";
import BookQuoteCustomerClient from "./BookQuoteCustomerClient";

export const metadata: Metadata = {
  title: "Confirm your quote | My Airport Taxi NI",
  description: "Review your fixed airport transfer quote and pay securely.",
  robots: { index: false, follow: false },
};

/**
 * Static-export friendly (GitHub Pages): quote id is read from ?id= in the client.
 * Fare is never taken from the URL — only the opaque token.
 */
export default function BookQuotePage() {
  return (
    <main className="min-h-screen bg-navy px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto mb-6 max-w-lg text-center sm:mb-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald">
          My Airport Taxi NI
        </p>
        <h1 className="mt-2 font-display text-3xl text-white">Your fixed quote</h1>
      </div>
      <BookQuoteCustomerClient />
    </main>
  );
}
