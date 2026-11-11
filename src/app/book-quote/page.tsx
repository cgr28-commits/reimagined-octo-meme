import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import BookQuoteCustomerClient from "./BookQuoteCustomerClient";
import StandaloneBrandBar from "@/components/StandaloneBrandBar";

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
    <>
    <StandaloneBrandBar />
    <main data-customer-standalone className="min-h-screen min-w-0 max-w-[100%] overflow-x-clip bg-navy px-3 py-8 text-white sm:px-6 sm:py-10">
      <div className="mx-auto mb-6 w-full min-w-0 max-w-lg px-0 text-center sm:mb-8">
        <Link href="/" aria-label="My Airport Taxi NI — home" className="inline-block">
          <Logo className="mx-auto h-20 w-auto" priority />
        </Link>
        <h1 className="mt-3 break-words font-display text-3xl text-white">Your fixed quote</h1>
        <p className="mt-1 text-sm text-white/65">Pre-booked driver · Fixed price · Secure card payment</p>
      </div>
      <BookQuoteCustomerClient />
    </main>
    </>
  );
}
