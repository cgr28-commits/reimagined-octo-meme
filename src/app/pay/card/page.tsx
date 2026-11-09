import type { Metadata } from "next";
import { SITE } from "@/lib/data";
import StripeCardPayClient from "./StripeCardPayClient";
import StandaloneBrandBar from "@/components/StandaloneBrandBar";

export const metadata: Metadata = {
  title: `Secure card payment | ${SITE.name}`,
  description: "Pay securely for your My Airport Taxi NI booking.",
  alternates: { canonical: "/pay/card/" },
  robots: { index: false, follow: false },
};

/** Static-export friendly: the checkout id is read from the URL in the client. */
export default function StripeCardPayPage() {
  return (
    // No site header/footer here: the payment fits on one screen. The card
    // shows the logo, and the amount/reference stay at the top. 1200px+: slim brand bar with Call Us.
    <>
    <StandaloneBrandBar />
    <main data-customer-standalone data-focused-payment className="min-h-[100dvh] overflow-x-clip bg-navy px-3 py-3 sm:flex sm:items-center sm:py-6">
      <div className="mx-auto w-full max-w-md">
        <StripeCardPayClient />
      </div>
    </main>
    </>
  );
}
