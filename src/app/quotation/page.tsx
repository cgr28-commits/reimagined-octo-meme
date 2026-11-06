import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import QuotationCustomerClient from "./QuotationCustomerClient";

export const metadata: Metadata = {
  title: "Your quotation | My Airport Taxi NI",
  description: "Review your personal Event or Business Class transfer quotation.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  // The private token lives in the URL fragment; never send this page as a referrer.
  referrer: "no-referrer",
};

/**
 * Private customer quotation page (Event Transfer / Business Class requests).
 * Static-export friendly: the token is read from the #fragment in the browser,
 * so it never reaches GitHub Pages logs. The price always comes from the Worker.
 */
export default function QuotationPage() {
  return (
    <main className="min-h-screen bg-navy px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto mb-6 max-w-lg text-center sm:mb-8">
        <Link href="/" aria-label="My Airport Taxi NI — home" className="inline-block">
          <Logo className="mx-auto h-20 w-auto" priority />
        </Link>
      </div>
      <QuotationCustomerClient />
    </main>
  );
}
