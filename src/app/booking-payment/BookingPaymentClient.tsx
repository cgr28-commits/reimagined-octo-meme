"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { confirmBookingJobPayment } from "@/lib/booking-jobs-api";
import { SITE } from "@/lib/data";
import { resolveCheckoutIdFromUrl } from "@/lib/pending-payment";

export default function BookingPaymentClient() {
  const [status, setStatus] = useState<"loading" | "success" | "pending" | "error">("loading");
  const [message, setMessage] = useState("Checking your payment…");
  const [reference, setReference] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("job")?.trim() || undefined;
    const checkoutId =
      resolveCheckoutIdFromUrl(window.location.search) ||
      params.get("id")?.trim() ||
      "";

    if (!checkoutId && !jobId) {
      setStatus("error");
      setMessage(
        "We couldn’t find a payment checkout on this page. If you just paid, check your email for confirmation or contact us.",
      );
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        // When SumUp only returns us to ?job=, the worker looks up the stored checkout id.
        const result = await confirmBookingJobPayment({
          checkoutId: checkoutId || "from-job",
          jobId,
        });
        if (cancelled) return;
        setReference(result.job?.id || result.paymentReference || "");
        if (result.alreadyPaid || result.ok) {
          setStatus("success");
          setMessage(
            result.alreadyPaid
              ? "This payment was already confirmed. You’re all set — check your email for the booking confirmation."
              : `Payment received${result.amountPaid ? ` (${result.amountPaid})` : ""}. We’ve emailed your confirmation and added the trip to our calendar.`,
          );
          return;
        }
        setStatus("pending");
        setMessage("Payment is still processing. Please wait a moment, then refresh this page.");
      } catch (error) {
        if (cancelled) return;
        const detail = error instanceof Error ? error.message : "Could not confirm payment";
        if (/not been completed|402/i.test(detail)) {
          setStatus("pending");
          setMessage(
            "Payment isn’t showing as complete yet. If you finished paying, wait a few seconds and refresh — or open the SumUp link from your email again.",
          );
          return;
        }
        setStatus("error");
        setMessage(
          `${detail}. If money left your account, email ${SITE.email} with your booking details.`,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-16">
      <div className="rounded-2xl border border-white/10 bg-navy/70 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald">{SITE.name}</p>
        <h1 className="mt-2 text-2xl font-bold text-white">Booking payment</h1>
        <p
          className={`mt-4 text-sm leading-relaxed ${
            status === "error"
              ? "text-red-100"
              : status === "success"
                ? "text-emerald-light"
                : "text-white/75"
          }`}
        >
          {message}
        </p>
        {reference ? <p className="mt-3 text-sm text-white/50">Reference: {reference}</p> : null}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-emerald-light"
          >
            Back to home
          </Link>
          <a
            href={`mailto:${SITE.email}`}
            className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/40"
          >
            Email us
          </a>
        </div>
      </div>
    </main>
  );
}
