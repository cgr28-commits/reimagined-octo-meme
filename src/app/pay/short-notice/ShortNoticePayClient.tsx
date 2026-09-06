"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CustomerSmartAvailabilityBlocked } from "@/components/CustomerSmartAvailabilityBlocked";
import { isCustomerSmartAvailabilityBlockMessage } from "@/lib/customer-smart-availability-client";
import {
  buildPaymentRedirectUrl,
  createPaymentCheckout,
  isSumUpPaymentEnabled,
} from "@/lib/create-payment";
import { createPaymentReturnToken, savePendingPayment } from "@/lib/pending-payment";
import { fetchPublicShortNotice, type PublicShortNoticeSummary } from "@/lib/short-notice-api";

function readTokenFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
}

function ShortNoticePayInner() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(() => searchParams.get("token")?.trim() ?? "");
  const [summary, setSummary] = useState<PublicShortNoticeSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    const fromUrl = searchParams.get("token")?.trim() ?? readTokenFromLocation();
    setToken(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setSummary(null);
      setError("This page needs a secure payment token from your approved booking link.");
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const booking = await fetchPublicShortNotice(token);
        if (!cancelled) setSummary(booking);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load booking");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handlePay() {
    if (!summary?.payable || !token) return;
    setPaying(true);
    setError("");
    try {
      if (!isSumUpPaymentEnabled()) {
        throw new Error("Online payment is not configured");
      }
      const returnToken = createPaymentReturnToken();
      const checkout = await createPaymentCheckout({
        amount: summary.amount,
        description: `Short-notice booking ${summary.reference}`,
        redirectUrl: buildPaymentRedirectUrl(returnToken),
        shortNoticeToken: token,
      });
      if (!checkout.paymentUrl || !checkout.checkoutId) {
        throw new Error("Could not start secure payment");
      }
      savePendingPayment(
        {
          checkoutId: checkout.checkoutId,
          paymentUrl: checkout.paymentUrl,
          checkoutReference: checkout.checkoutReference,
          amountLabel: summary.amountLabel,
          booking: {
            customerName: summary.customerName,
            customerEmail: "",
            mobileNumber: "",
            tripLabel: `${summary.pickupLabel} → ${summary.dropoffLabel}`,
            pickupLabel: summary.pickupLabel,
            dropoffLabel: summary.dropoffLabel,
            returnJourney: summary.returnJourney,
            tripDate: summary.tripDate,
            tripTime: summary.tripTime,
            returnDate: summary.returnDate || "",
            returnTime: summary.returnTime || "",
            flightNumber: summary.flightNumber || "",
            passengers: summary.passengers,
            suitcases: summary.suitcases,
            vehicle: summary.vehicle,
            estimatedPrice: summary.amountLabel,
            isAirportTrip: false,
          },
        },
        returnToken,
      );
      window.location.assign(checkout.paymentUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment");
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-navy/80 p-6 text-white">
        <p className="text-sm text-white/70">Loading your booking…</p>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-400/30 bg-navy/80 p-6 text-white">
        <h1 className="text-xl font-bold">Payment link unavailable</h1>
        <p className="mt-3 text-sm text-white/75">{error}</p>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-navy/80 p-6 text-white sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
        Pay securely
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Your approved booking</h1>
      <p className="mt-2 text-sm text-white/65">
        Reference <span className="font-semibold text-white">{summary.reference}</span>
      </p>

      <dl className="mt-6 grid gap-3 text-sm text-white/75">
        <div>
          <dt className="text-white/40">Pickup</dt>
          <dd className="break-words text-white">{summary.pickupLabel}</dd>
        </div>
        <div>
          <dt className="text-white/40">Destination</dt>
          <dd className="break-words text-white">{summary.dropoffLabel}</dd>
        </div>
        <div>
          <dt className="text-white/40">Pickup date / time</dt>
          <dd className="text-white">
            {summary.tripDate} · {summary.tripTime}
          </dd>
        </div>
        <div>
          <dt className="text-white/40">Service</dt>
          <dd className="font-semibold text-white">{summary.service}</dd>
        </div>
        {summary.returnJourney ? (
          <div>
            <dt className="text-white/40">Return</dt>
            <dd className="text-white">
              {summary.returnDate || "—"} · {summary.returnTime || "—"}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-white/40">Total amount</dt>
          <dd className="text-2xl font-bold text-white">{summary.amountLabel}</dd>
        </div>
      </dl>

      {isCustomerSmartAvailabilityBlockMessage(error) ? (
        <div className="mt-4">
          <CustomerSmartAvailabilityBlocked message={error} />
        </div>
      ) : error ? (
        <p className="mt-4 text-sm text-red-300">{error}</p>
      ) : null}

      {summary.payable && !isCustomerSmartAvailabilityBlockMessage(error) ? (
        <button
          type="button"
          disabled={paying}
          onClick={() => void handlePay()}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald px-5 py-3 text-base font-bold text-navy disabled:opacity-60"
        >
          {paying ? "Opening secure payment…" : "Pay Securely"}
        </button>
      ) : !isCustomerSmartAvailabilityBlockMessage(error) && !summary.payable ? (
        <p className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {summary.status === "SHORT_NOTICE_AWAITING_APPROVAL"
            ? "This booking is still awaiting Owner approval."
            : summary.status === "SHORT_NOTICE_DECLINED"
              ? "This booking request was declined and cannot be paid."
              : summary.status === "SHORT_NOTICE_PAID"
                ? "This booking is already paid."
                : "This payment link is no longer payable."}
        </p>
      ) : null}
    </div>
  );
}

export default function ShortNoticePayClient() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-navy/80 p-6 text-white">
          <p className="text-sm text-white/70">Loading your booking…</p>
        </div>
      }
    >
      <ShortNoticePayInner />
    </Suspense>
  );
}
