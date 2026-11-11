import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import A2aQuotePayClient from "./A2aQuotePayClient";
import StandaloneBrandBar from "@/components/StandaloneBrandBar";

export const metadata: Metadata = {
  title: "Pay personalised quote | My Airport Taxi NI",
  robots: { index: false, follow: false },
};

/**
 * Static-export friendly (GitHub Pages): token is read client-side from the URL.
 */
export default function A2aQuotePayPage() {
  return (
    <>
    <StandaloneBrandBar />
    <main data-customer-standalone className="min-h-screen bg-navy px-4 py-10 sm:px-6">
      <div className="mx-auto mb-8 max-w-lg text-center">
        <Link href="/" aria-label="My Airport Taxi NI — home" className="inline-block">
          <Logo className="mx-auto h-20 w-auto" priority />
        </Link>
      </div>
      <A2aQuotePayClient />
    </main>
    </>
  );
}
