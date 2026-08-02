"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import {
  activateTestBooking,
  buildTestBookingPrefill,
  formatTestTripDate,
} from "@/lib/test-booking";

export default function TestBookingPageClient() {
  const searchParams = useSearchParams();
  const prefill = buildTestBookingPrefill();
  const autoStart = searchParams.get("start") === "1";

  function startTestBooking() {
    activateTestBooking();
    window.location.href = "/#quote";
  }

  useEffect(() => {
    if (!autoStart) {
      return;
    }

    activateTestBooking();
    window.location.href = "/#quote";
  }, [autoStart]);

  if (autoStart) {
    return (
      <>
        <Header />
        <main className="flex min-h-screen items-center justify-center bg-navy px-4 pt-28 pb-16">
          <p className="text-sm text-white/70">Opening £1 test booking…</p>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-44 md:pt-28">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <header className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-amber-300">
              Owner test only
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">£1 test booking</h1>
            <p className="mt-3 text-white/70">
              Use this to complete a real SumUp payment for £1 and see exactly what a customer
              receives — invoice email, tracking link, and driver dashboard entry.
            </p>
          </header>

          <section className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">Test route</h2>
            <dl className="mt-4 space-y-3 text-sm text-white/80">
              <div>
                <dt className="font-medium text-white">Route</dt>
                <dd>{prefill.routeLabel}</dd>
              </div>
              <div>
                <dt className="font-medium text-white">Pickup</dt>
                <dd>{prefill.pickupAddress}</dd>
              </div>
              <div>
                <dt className="font-medium text-white">When</dt>
                <dd>
                  {formatTestTripDate(prefill.tripDate)} at {prefill.tripTime}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-white">SumUp charge</dt>
                <dd className="text-emerald">£1.00 only (route price is not charged)</dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={startTestBooking}
              className="mt-8 w-full rounded-xl bg-emerald px-6 py-4 text-sm font-semibold text-navy transition-colors hover:bg-emerald/90"
            >
              Start test booking in quote tool
            </button>
          </section>

          <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">What to do next</h2>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-white/70">
              <li>Click the button above — the quote form opens with this route pre-filled.</li>
              <li>Enter your real name, mobile, and email (use an inbox you can check).</li>
              <li>Accept Terms &amp; Conditions, then pay £1 with SumUp.</li>
              <li>Check your email for the branded invoice and live tracking link.</li>
              <li>
                Open the{" "}
                <a href="/driver/" className="text-emerald underline">
                  driver dashboard
                </a>{" "}
                with Colin&apos;s access key to see the job listed.
              </li>
            </ol>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
