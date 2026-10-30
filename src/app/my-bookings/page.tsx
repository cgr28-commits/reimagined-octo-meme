import type { Metadata } from "next";
import { Suspense } from "react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { SITE } from "@/lib/data";
import MyBookingsClient from "./MyBookingsClient";

export const metadata: Metadata = {
  title: `My Bookings | ${SITE.name}`,
  description: `See all your ${SITE.name} bookings in one place and book the same journey again in one tap.`,
  alternates: { canonical: "/my-bookings/" },
  robots: { index: false, follow: true },
};

export default function MyBookingsPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-36 md:pt-28">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <header className="mt-4">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">{SITE.name}</p>
            <h1
              data-site-nav-heading="my-bookings"
              tabIndex={-1}
              className="mt-2 text-3xl font-bold text-white outline-none sm:text-4xl"
            >
              My bookings
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              All your journeys in one place. No password — we email you a 6-digit code.
            </p>
          </header>
          <div className="mt-8">
            <Suspense
              fallback={
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/60">
                  Loading…
                </div>
              }
            >
              <MyBookingsClient />
            </Suspense>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
