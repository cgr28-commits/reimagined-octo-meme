import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import PersonalQuoteCustomerClient from "./PersonalQuoteCustomerClient";
import StandaloneBrandBar from "@/components/StandaloneBrandBar";

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
    <>
    <StandaloneBrandBar />
    <main data-customer-standalone className="min-h-screen bg-navy px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto mb-6 max-w-lg text-center sm:mb-8">
        <Link href="/" aria-label="My Airport Taxi NI — home" className="inline-block">
          <Logo className="mx-auto h-20 w-auto" priority />
        </Link>
      </div>
      <PersonalQuoteCustomerClient />
    </main>
    </>
  );
}
