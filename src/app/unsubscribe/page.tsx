import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import WhatsAppButton from "@/components/WhatsAppButton";
import { SITE } from "@/lib/data";
import UnsubscribeForm from "./UnsubscribeForm";

export const metadata: Metadata = {
  title: `Unsubscribe | ${SITE.name}`,
  description: `Stop marketing emails from ${SITE.name}. Booking confirmations are not affected.`,
  alternates: {
    canonical: "/unsubscribe/",
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function UnsubscribePage() {
  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-44 md:pt-28">
        <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-emerald"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to home
          </Link>

          <header className="mt-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">Preferences</p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Unsubscribe</h1>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              Stop occasional marketing emails from {SITE.name}. You will still receive booking
              confirmations and messages about trips you have booked.
            </p>
          </header>

          <div className="mt-10">
            <Suspense
              fallback={
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/60">
                  Loading…
                </div>
              }
            >
              <UnsubscribeForm />
            </Suspense>
          </div>
        </div>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
