import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import ReturnOfferBookClient from "./ReturnOfferBookClient";
import StandaloneBrandBar from "@/components/StandaloneBrandBar";

export const metadata: Metadata = {
  title: "Book your return | My Airport Taxi NI",
  description: "Book your return airport transfer with a 5% return journey saving.",
  robots: { index: false, follow: false },
};

/**
 * Static-export friendly: the secure token is read from ?returnOffer= in the client.
 * Fare is never taken from the URL — the Worker validates the token and requotes.
 */
export default function BookReturnOfferPage() {
  return (
    <>
    <StandaloneBrandBar />
    <main data-customer-standalone className="min-h-screen min-w-0 max-w-[100%] overflow-x-clip bg-navy px-3 py-8 text-white sm:px-6 sm:py-10">
      <div className="mx-auto mb-6 w-full min-w-0 max-w-lg px-0 text-center sm:mb-8">
        <Link href="/" aria-label="My Airport Taxi NI — home" className="inline-block">
          <Logo className="mx-auto h-20 w-auto" priority />
        </Link>
        <h1 className="mt-2 break-words font-display text-3xl text-white">
          Your 5% Return Journey Offer
        </h1>
        <p className="mt-2 text-sm text-white/70">
          Your 5% saving has been applied automatically.
        </p>
      </div>
      <div className="mx-auto w-full min-w-0 max-w-lg">
        <ReturnOfferBookClient />
      </div>
    </main>
    </>
  );
}
