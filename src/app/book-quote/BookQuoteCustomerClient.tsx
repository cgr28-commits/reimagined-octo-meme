"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import BookingTermsConsent from "@/components/BookingTermsConsent";
import {
  buildPaymentRedirectUrl,
  createPaymentCheckout,
  isSumUpPaymentEnabled,
} from "@/lib/create-payment";
import {
  isValidEmailAddress,
  isValidMobileNumber,
  type BookingDetails,
} from "@/lib/booking-message";
import { createPaymentReturnToken, savePendingPayment } from "@/lib/pending-payment";
import { fetchQuickQuoteById, type QuickQuotePublicSummary } from "@/lib/quick-quote-api";
import { TERMS_LAST_UPDATED } from "@/lib/terms";
import { getPaymentBookingBlockers } from "../../../shared/paid-booking-gate";

function readIdFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("id")?.trim() ?? "";
}

function BookQuoteInner() {
  const searchParams = useSearchParams();
  const [id, setId] = useState(() => searchParams.get("id")?.trim() ?? "");
  const [quote, setQuote] = useState<QuickQuotePublicSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [childSeatRequired, setChildSeatRequired] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    const fromUrl = searchParams.get("id")?.trim() ?? readIdFromLocation();
    setId(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setQuote(null);
      setError(
        "This quote link is invalid or no longer available. Please contact My Airport Taxi NI.",
      );
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const loaded = await fetchQuickQuoteById(id);
        if (cancelled) return;
        setQuote(loaded);
        setFlightNumber(loaded.journey.flightNumber ?? "");
        setChildSeatRequired(Boolean(loaded.journey.childSeatRequired));
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "This quote link is invalid or no longer available. Please contact My Airport Taxi NI.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const journey = quote?.journey;

  const booking = useMemo((): BookingDetails | null => {
    if (!quote || !journey) return null;
    return {
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      mobileNumber: mobileNumber.trim(),
      tripLabel: childSeatRequired
        ? "Airport transfer · Child seat required"
        : "Airport transfer",
      pickupLabel: journey.pickupAddress,
      dropoffLabel: journey.dropoffAddress,
      returnJourney: Boolean(journey.returnJourney),
      tripDate: journey.outboundDate,
      tripTime: journey.outboundTime,
      returnDate: journey.returnDate ?? "",
      returnTime: journey.returnTime ?? "",
      flightNumber: flightNumber.trim(),
      returnFlightNumber: journey.returnFlightNumber ?? "",
      passengers: journey.passengers,
      suitcases: journey.suitcases,
      vehicle: journey.vehicleType || "Standard Saloon (1–4 passengers)",
      isAirportTrip: Boolean(journey.airportCode),
      airportCode: journey.airportCode ?? undefined,
      isFromAirport: journey.fromAirport,
      estimatedPrice: quote.quotedAmountLabel,
      termsAcceptedAt: termsAccepted ? new Date().toISOString() : undefined,
      termsVersion: TERMS_LAST_UPDATED,
    };
  }, [quote, journey, customerName, customerEmail, mobileNumber, flightNumber, childSeatRequired, termsAccepted]);

  async function pay() {
    setError("");
    if (!quote || !booking) return;
    if (!isSumUpPaymentEnabled()) {
      setError("Secure payment is not available right now. Please contact My Airport Taxi NI.");
      return;
    }
    if (!customerName.trim() || customerName.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }
    if (!isValidEmailAddress(customerEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!isValidMobileNumber(mobileNumber)) {
      setError("Please enter a valid WhatsApp / mobile number.");
      return;
    }
    if (!termsAccepted) {
      setError("Please accept the Terms & Conditions to continue.");
      return;
    }
    if (journey?.returnJourney && (!journey.returnDate || !journey.returnTime)) {
      setError("This return quote is incomplete. Please contact My Airport Taxi NI.");
      return;
    }
    const blockers = getPaymentBookingBlockers(booking);
    if (blockers.length) {
      setError(blockers[0]);
      return;
    }

    setPaying(true);
    try {
      const returnToken = createPaymentReturnToken();
      const checkout = await createPaymentCheckout({
        amount: quote.quotedAmount,
        description: `My Airport Taxi NI booking`,
        redirectUrl: buildPaymentRedirectUrl(returnToken),
        booking,
        quickQuoteId: quote.id,
        standardWebsiteAmount: quote.quotedAmount,
      });
      if (checkout.shortNotice && checkout.whatsappUrl) {
        window.location.href = checkout.whatsappUrl;
        return;
      }
      if (!checkout.paymentUrl || !checkout.checkoutId) {
        throw new Error("Could not start secure payment");
      }
      savePendingPayment(
        {
          checkoutId: checkout.checkoutId,
          paymentUrl: checkout.paymentUrl,
          checkoutReference: checkout.checkoutReference,
          amountLabel: quote.quotedAmountLabel,
          booking,
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
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-navy-dark/70 p-6 text-center text-white/70">
        Loading your quote…
      </div>
    );
  }

  if (error && !quote) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-400/30 bg-navy-dark/70 p-6 text-center text-red-200">
        {error}
      </div>
    );
  }

  if (!quote || !journey) return null;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <section className="rounded-2xl border border-emerald/35 bg-emerald/10 px-5 py-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald">Fixed fare</p>
        <p className="mt-1 font-display text-4xl text-white">{quote.quotedAmountLabel}</p>
        <p className="mt-2 text-sm text-white/60">
          Secure card payment · quote expires{" "}
          {new Date(quote.expiresAt).toLocaleString("en-GB", {
            timeZone: "Europe/London",
          })}
        </p>
      </section>

      <section className="space-y-2 rounded-2xl border border-white/10 bg-navy-dark/70 p-5 text-sm text-white/80">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Journey</p>
        <p>
          <span className="text-white/50">Pickup:</span> {journey.pickupAddress}
        </p>
        <p>
          <span className="text-white/50">Drop-off:</span> {journey.dropoffAddress}
        </p>
        <p>
          <span className="text-white/50">When:</span> {journey.outboundDate} {journey.outboundTime}
        </p>
        {journey.returnJourney ? (
          <p>
            <span className="text-white/50">Return:</span> {journey.returnDate} {journey.returnTime}
          </p>
        ) : (
          <p>
            <span className="text-white/50">Type:</span> One-way
          </p>
        )}
        <p>
          <span className="text-white/50">Passengers / bags:</span> {journey.passengers} /{" "}
          {journey.suitcases}
        </p>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-navy-dark/70 p-5">
        <p className="text-sm font-semibold text-white">Confirm your details</p>
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Full name"
          className="min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
        />
        <input
          value={mobileNumber}
          onChange={(e) => setMobileNumber(e.target.value)}
          placeholder="WhatsApp / mobile number"
          className="min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
        />
        <input
          type="email"
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
          placeholder="Email for confirmation"
          className="min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
        />
        <input
          value={flightNumber}
          onChange={(e) => setFlightNumber(e.target.value)}
          placeholder="Flight number (if known)"
          className="min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
        />
        <label className="flex items-center gap-3 text-sm text-white/75">
          <input
            type="checkbox"
            checked={childSeatRequired}
            onChange={(e) => setChildSeatRequired(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          Child seat required
        </label>
      </section>

      <BookingTermsConsent
        accepted={termsAccepted}
        onAcceptedChange={setTermsAccepted}
        mode="card-payment"
        paymentAmountLabel={quote.quotedAmountLabel}
        error={!termsAccepted && error.includes("Terms") ? error : undefined}
      />

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <button
        type="button"
        disabled={paying}
        onClick={() => void pay()}
        className="min-h-12 w-full rounded-xl bg-emerald px-4 text-base font-semibold text-navy disabled:opacity-50"
      >
        {paying
          ? "Starting secure payment…"
          : `Confirm Booking & Pay ${quote.quotedAmountLabel}`}
      </button>
      <p className="text-center text-xs text-white/45">
        You will complete payment on SumUp’s secure hosted checkout. Card details are never entered
        on this site.
      </p>
    </div>
  );
}

export default function BookQuoteCustomerClient() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-navy-dark/70 p-6 text-center text-white/70">
          Loading…
        </div>
      }
    >
      <BookQuoteInner />
    </Suspense>
  );
}
