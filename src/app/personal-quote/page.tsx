import type { Metadata } from "next";
import PersonalQuoteCustomerClient from "./PersonalQuoteCustomerClient";

export const metadata: Metadata = {
  title: "Your personal quote | My Airport Taxi NI",
  description: "Review your personally agreed airport transfer quote and pay securely.",
  robots: { index: false, follow: false },
};

/**
 * Static-export friendly (GitHub Pages): token is read from ?t= in the client.
 * Fare is never taken from the URL — only the opaque token.
 */
export default function PersonalQuotePage() {
  return (
    <main className="min-h-screen bg-navy px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto mb-6 max-w-lg text-center sm:mb-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald">
          My Airport Taxi NI
        </p>
      </div>
      <PersonalQuoteCustomerClient />
    </main>
  );
}
