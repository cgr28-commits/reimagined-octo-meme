import type { Metadata } from "next";
import A2aQuotePayClient from "./A2aQuotePayClient";

export const metadata: Metadata = {
  title: "Pay personalised quote | My Airport Taxi NI",
  robots: { index: false, follow: false },
};

/**
 * Static-export friendly (GitHub Pages): token is read client-side from the URL.
 */
export default function A2aQuotePayPage() {
  return (
    <main className="min-h-screen bg-navy px-4 py-10 sm:px-6">
      <div className="mx-auto mb-8 max-w-lg text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald">
          My Airport Taxi NI
        </p>
      </div>
      <A2aQuotePayClient />
    </main>
  );
}
