import type { Metadata } from "next";
import { Suspense } from "react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { SITE } from "@/lib/data";
import PromoCodeCopy from "./PromoCodeCopy";

export const metadata: Metadata = {
  title: `Your discount code | ${SITE.name}`,
  description: `Copy your ${SITE.name} discount code and book your transfer.`,
  alternates: { canonical: "/promo-code/" },
  robots: { index: false, follow: false },
};

/** Opened from the "Copy code" button in the discount-code email (emails can't copy text themselves). */
export default function PromoCodePage() {
  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-36 md:pt-28">
        <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8">
          <Suspense fallback={null}>
            <PromoCodeCopy />
          </Suspense>
        </div>
      </main>
      <Footer />
    </>
  );
}
