import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import QuoteNavLink from "@/components/QuoteNavLink";
import { SITE } from "@/lib/data";
import ManageBookingClient from "./ManageBookingClient";

export const metadata: Metadata = {
  title: "Manage Your Booking | My Airport Taxi NI",
  description: "Change your pickup date or time, subject to availability and our amendment policy.",
  robots: { index: false, follow: false },
};

export default function ManageBookingPage() {
  return (
    <main className="min-h-screen bg-navy px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto mb-6 flex w-full max-w-lg flex-col items-center gap-4 sm:mb-8">
        <div className="flex w-full items-center justify-between gap-3">
          <Link href="/" aria-label={`${SITE.name} home`} className="shrink-0">
            <Logo className="h-12 sm:h-14" />
          </Link>
          <QuoteNavLink
            href="/#quote"
            className="inline-flex min-h-11 items-center rounded-full bg-emerald px-4 py-2 text-sm font-semibold text-navy"
          >
            Get a Quote
          </QuoteNavLink>
        </div>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm text-white/55 transition-colors hover:text-emerald"
        >
          Back to website
        </Link>
        <div className="w-full text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald">
            My Airport Taxi NI
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Manage Your Booking</h1>
        </div>
      </div>
      <ManageBookingClient />
    </main>
  );
}
