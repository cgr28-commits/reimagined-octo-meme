import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { SITE } from "@/lib/data";
import StripeCardPayClient from "./StripeCardPayClient";

export const metadata: Metadata = {
  title: `Secure card payment | ${SITE.name}`,
  description: "Pay securely for your My Airport Taxi NI booking.",
  alternates: { canonical: "/pay/card/" },
  robots: { index: false, follow: false },
};

/** Static-export friendly: the checkout id is read from the URL in the client. */
export default function StripeCardPayPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-36 md:pt-28">
        <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8">
          <StripeCardPayClient />
        </div>
      </main>
      <Footer />
    </>
  );
}
