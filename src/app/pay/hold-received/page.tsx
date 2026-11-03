import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { SITE } from "@/lib/data";
import HoldReceivedClient from "./HoldReceivedClient";

export const metadata: Metadata = {
  title: `Booking request received | ${SITE.name}`,
  description: "Your card is held while we confirm your booking.",
  alternates: { canonical: "/pay/hold-received/" },
  robots: { index: false, follow: false },
};

export default function HoldReceivedPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-36 md:pt-28">
        <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8">
          <HoldReceivedClient />
        </div>
      </main>
      <Footer />
    </>
  );
}
