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
import { fetchPublicA2aQuote, type PublicA2aQuoteSummary } from "@/lib/a2a-quote-api";
import { A2A_QUOTE_EXPIRED_CUSTOMER_MESSAGE } from "../../../../shared/a2a-personalised-quote";

function readTokenFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
}

function A2aQuotePayInner() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(() => searchParams.get("token")?.trim() ?? "");
  const [summary, setSummary] = useState<PublicA2aQuoteSummary | null>(null);
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
      setError("This page needs a secure payment token from your quote email.");
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const quote = await fetchPublicA2aQuote(token);
        if (!cancelled) setSummary(quote);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load quote");
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
    if (!summary?.payable || !token || summary.amount == null) return;
    setPaying(true);
    setError("");
    try {
      if (!isSumUpPaymentEnabled()) {
        throw new Error("Online payment is not configured");
      }
      const returnToken = createPaymentReturnToken();
      const checkout = await createPaymentCheckout({
        amount: summary.amount,
        description: `Personalised quote ${summary.reference}`,
        redirectUrl: buildPaymentRedirectUrl(returnToken),
        a2aQuoteToken: token,
      });
      if (!checkout.paymentUrl || !checkout.checkoutId) {
        throw new Error("Could not start secure payment");
      }
      savePendingPayment(
        {
          checkoutId: checkout.checkoutId,
          paymentUrl: checkout.paymentUrl,
          checkoutReference: checkout.checkoutReference,
          amountLabel: summary.amountLabel ?? undefined,
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
            flightNumber: "",
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
        <p className="text-sm text-white/70">Loading your personalised quote…</p>
      </div>
    );
  }

  if ((error && !summary) || summary?.expired) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-amber-400/30 bg-navy/80 p-6 text-white">
        <h1 className="text-xl font-bold">Quote expired</h1>
        <p className="mt-3 text-sm text-white/75">
          {summary?.expiredMessage || error || A2A_QUOTE_EXPIRED_CUSTOMER_MESSAGE}
        </p>
      </div>
    );
  }

  if (!summary) return null;

  const isCounterOffer = Boolean(summary.isCounterOffer);
  const payLabel = isCounterOffer ? "Accept Changes & Pay Securely" : "Pay Securely";

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-navy/80 p-6 text-white sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
        {isCounterOffer ? "Alternative Journey Offer" : "Personalised Quote"}
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">
        {summary.amountLabel ?? "Your quote"}
      </h1>
      <p className="mt-2 text-sm text-white/65">
        Reference <span className="font-semibold text-white">{summary.reference}</span>
        {summary.quoteValidityLabel ? ` · valid for ${summary.quoteValidityLabel}` : ""}
      </p>

      {isCounterOffer ? (
        <div className="mt-6 space-y-4 text-sm">
          <p className="text-white/75">
            Unfortunately, we’re unable to offer your journey exactly as originally requested.
            However, we can offer the alternative shown below. Please review the updated journey
            details carefully before making payment.
          </p>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Your original request
            </p>
            <dl className="mt-3 grid gap-2 text-white/75">
              <div>
                <dt className="text-white/40">Pickup</dt>
                <dd className="break-words text-white">
                  {summary.originalPickupLabel || summary.pickupLabel}
                </dd>
              </div>
              <div>
                <dt className="text-white/40">Destination</dt>
                <dd className="break-words text-white">
                  {summary.originalDropoffLabel || summary.dropoffLabel}
                </dd>
              </div>
              <div>
                <dt className="text-white/40">Date / time</dt>
                <dd className="text-white">
                  {summary.originalTripDate || summary.tripDate} ·{" "}
                  {summary.originalTripTime || summary.tripTime}
                </dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-emerald/35 bg-emerald/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
              What we can offer
            </p>
            <dl className="mt-3 grid gap-2 text-white/75">
              <div>
                <dt className="text-white/40">Pickup</dt>
                <dd className="break-words text-white">{summary.pickupLabel}</dd>
              </div>
              <div>
                <dt className="text-white/40">Destination</dt>
                <dd className="break-words text-white">{summary.dropoffLabel}</dd>
              </div>
              <div>
                <dt className="text-white/40">Date / time</dt>
                <dd className="text-white">
                  {summary.tripDate} · {summary.tripTime}
                </dd>
              </div>
              {summary.returnJourney && (summary.returnDate || summary.returnTime) ? (
                <div>
                  <dt className="text-white/40">Return date / time</dt>
                  <dd className="text-white">
                    {[summary.returnDate, summary.returnTime].filter(Boolean).join(" · ")}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-white/40">Fixed price</dt>
                <dd className="font-semibold text-white">{summary.amountLabel}</dd>
              </div>
            </dl>
          </div>
          <p className="text-white/70">
            Payment accepts these amended journey details. Your booking is only confirmed once
            payment has been completed.
          </p>
        </div>
      ) : (
        <>
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
            {summary.returnJourney && (summary.returnDate || summary.returnTime) ? (
              <div>
                <dt className="text-white/40">Return date / time</dt>
                <dd className="text-white">
                  {[summary.returnDate, summary.returnTime].filter(Boolean).join(" · ")}
                </dd>
              </div>
            ) : null}
          </dl>

          <p className="mt-4 text-sm text-white/70">
            Your requested journey has been approved. Your booking is only confirmed once payment
            has been completed. Availability may change if payment is not made within the quote
            time.
          </p>
        </>
      )}

      {isCustomerSmartAvailabilityBlockMessage(error) ? (
        <div className="mt-4">
          <CustomerSmartAvailabilityBlocked
            message={error}
            onChooseAnotherTime={() => {
              window.location.assign("/");
            }}
          />
        </div>
      ) : error ? (
        <p className="mt-4 text-sm text-red-300">{error}</p>
      ) : null}

      {summary.payable && !isCustomerSmartAvailabilityBlockMessage(error) ? (
        <>
          <button
            type="button"
            disabled={paying}
            onClick={() => void handlePay()}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald px-5 py-3 text-base font-bold text-navy disabled:opacity-60"
          >
            {paying ? "Opening secure payment…" : payLabel}
          </button>
          <p className="mt-3 text-center text-xs text-white/50">
            Secure card payment powered by SumUp.
          </p>
        </>
      ) : !isCustomerSmartAvailabilityBlockMessage(error) && !summary.payable ? (
        <p className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {summary.status === "AWAITING_QUOTE"
            ? "This request is still awaiting a quote from us."
            : summary.status === "CONFIRMED"
              ? "This quote has already been paid."
              : A2A_QUOTE_EXPIRED_CUSTOMER_MESSAGE}
        </p>
      ) : null}
    </div>
  );
}

export default function A2aQuotePayClient() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-navy/80 p-6 text-white">
          <p className="text-sm text-white/70">Loading…</p>
        </div>
      }
    >
      <A2aQuotePayInner />
    </Suspense>
  );
}
