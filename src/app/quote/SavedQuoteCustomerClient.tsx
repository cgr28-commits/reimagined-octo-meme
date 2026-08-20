"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { fetchSavedQuoteByToken, requoteSavedQuote, type SavedQuotePublicSummary } from "@/lib/saved-quote-api";
import { TERMS_LAST_UPDATED } from "@/lib/terms";
import { CANCELLATION_POLICY_VERSION } from "../../../shared/refund-ops";
import { getPaymentBookingBlockers } from "../../../shared/paid-booking-gate";
import { savedQuoteScheduleChanged } from "../../../shared/booking-amendment";

const fieldClass =
  "quote-text-input min-h-12 rounded-xl border border-white/15 bg-navy px-3 text-base text-white placeholder:text-white/35";

function readTokenFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("t")?.trim() ?? "";
}

function SavedQuoteInner() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(() => searchParams.get("t")?.trim() ?? "");
  const [quote, setQuote] = useState<SavedQuotePublicSummary | null>(null);
  const [error, setError] = useState("");
  const [state, setState] = useState<"loading" | "ok" | "booked" | "expired" | "not_found">(
    "loading",
  );
  const [paying, setPaying] = useState(false);
  const [bookingMode, setBookingMode] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [returnFlightNumber, setReturnFlightNumber] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [tripDate, setTripDate] = useState("");
  const [tripTime, setTripTime] = useState("");
  const [displayAmount, setDisplayAmount] = useState<number | null>(null);
  const [displayAmountLabel, setDisplayAmountLabel] = useState("");
  const [scheduleChanged, setScheduleChanged] = useState(false);
  const [requoting, setRequoting] = useState(false);

  useEffect(() => {
    const fromUrl = searchParams.get("t")?.trim() ?? readTokenFromLocation();
    setToken(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    if (!token) {
      setState("not_found");
      setQuote(null);
      setError("This quote link is invalid or no longer available.");
      return;
    }

    let cancelled = false;
    (async () => {
      setState("loading");
      setError("");
      try {
        const loaded = await fetchSavedQuoteByToken(token);
        if (cancelled) return;
        if (loaded.ok) {
          setQuote(loaded.quote);
          setCustomerName(loaded.quote.customerName || "");
          setCustomerEmail(loaded.quote.customerEmail || "");
          setFlightNumber(loaded.quote.journey.flightNumber || "");
          setReturnFlightNumber(loaded.quote.journey.returnFlightNumber || "");
          setTripDate(loaded.quote.journey.tripDate);
          setTripTime(loaded.quote.journey.tripTime);
          setDisplayAmount(loaded.quote.amount);
          setDisplayAmountLabel(loaded.quote.amountLabel);
          setScheduleChanged(false);
          setState("ok");
          return;
        }
        if (loaded.quote) setQuote(loaded.quote);
        if (loaded.error === "booked") {
          setState("booked");
          setError(loaded.message || "This journey has already been booked.");
        } else if (loaded.error === "expired") {
          setState("expired");
          setError(loaded.message || "This quote has expired.");
        } else {
          setState("not_found");
          setError(loaded.message || "Quote not found.");
        }
      } catch (err) {
        if (!cancelled) {
          setState("not_found");
          setError(
            err instanceof Error
              ? err.message
              : "This quote link is invalid or no longer available.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const journey = quote?.journey;

  const effectiveAmount = displayAmount ?? quote?.amount ?? 0;
  const effectiveAmountLabel = displayAmountLabel || quote?.amountLabel || "";

  useEffect(() => {
    if (!quote || state !== "ok") return;
    const changed = savedQuoteScheduleChanged(quote.journey, { tripDate, tripTime });
    if (!changed) {
      setScheduleChanged(false);
      setDisplayAmount(quote.amount);
      setDisplayAmountLabel(quote.amountLabel);
      return;
    }

    let cancelled = false;
    (async () => {
      setRequoting(true);
      setError("");
      try {
        const result = await requoteSavedQuote({
          token: quote.token,
          tripDate,
          tripTime,
          returnDate: quote.journey.returnDate,
          returnTime: quote.journey.returnTime,
        });
        if (cancelled) return;
        setScheduleChanged(result.scheduleChanged);
        setDisplayAmount(result.amount);
        setDisplayAmountLabel(result.amountLabel);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not recalculate this quote.");
        }
      } finally {
        if (!cancelled) setRequoting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quote, tripDate, tripTime, state]);

  const booking = useMemo((): BookingDetails | null => {
    if (!quote || !journey) return null;
    return {
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      mobileNumber: mobileNumber.trim(),
      tripLabel: journey.tripLabel || "Airport transfer",
      pickupLabel: journey.pickupLabel,
      dropoffLabel: journey.dropoffLabel,
      returnJourney: Boolean(journey.returnJourney),
      tripDate,
      tripTime,
      returnDate: journey.returnDate ?? "",
      returnTime: journey.returnTime ?? "",
      flightNumber: journey.isFromAirport ? flightNumber.trim().toUpperCase() : "",
      returnFlightNumber:
        journey.returnJourney && journey.isFromAirport === false
          ? returnFlightNumber.trim().toUpperCase()
          : undefined,
      passengers: journey.passengers,
      suitcases: journey.suitcases,
      childSeats: journey.childSeats,
      childSeatNotes: journey.childSeatNotes,
      vehicle: journey.vehicle || "Standard Saloon (1–4 passengers)",
      isAirportTrip: Boolean(journey.isAirportTrip || journey.airportCode),
      airportCode: journey.airportCode,
      isFromAirport: journey.isFromAirport,
      estimatedPrice: effectiveAmountLabel,
      journeyDistance: journey.journeyDistance,
      journeyDuration: journey.journeyDuration,
      termsAcceptedAt: termsAccepted ? new Date().toISOString() : undefined,
      termsVersion: TERMS_LAST_UPDATED,
      cancellationPolicyVersion: CANCELLATION_POLICY_VERSION,
    };
  }, [
    quote,
    journey,
    customerName,
    customerEmail,
    mobileNumber,
    flightNumber,
    returnFlightNumber,
    termsAccepted,
    tripDate,
    tripTime,
    effectiveAmountLabel,
  ]);

  async function pay() {
    setError("");
    if (!quote || !booking || state !== "ok") return;
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
      setError("Please accept the Terms & Conditions and Privacy Policy to continue.");
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
        amount: effectiveAmount,
        description: `My Airport Taxi NI booking · ${quote.reference}`,
        redirectUrl: buildPaymentRedirectUrl(returnToken),
        booking,
        savedQuoteToken: quote.token,
        standardWebsiteAmount: effectiveAmount,
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
          amountLabel: effectiveAmountLabel,
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

  if (state === "loading") {
    return (
      <div className="mx-auto w-full min-w-0 max-w-lg rounded-2xl border border-white/10 bg-navy-dark/70 p-6 text-center text-white/70">
        Loading your saved quote…
      </div>
    );
  }

  if (state === "not_found") {
    return (
      <div className="mx-auto w-full min-w-0 max-w-lg break-words rounded-2xl border border-red-400/30 bg-navy-dark/70 p-6 text-center text-red-200">
        <p>{error || "Quote not found."}</p>
        <Link
          href="/#quote"
          className="mt-5 inline-flex rounded-xl bg-emerald px-5 py-3 text-sm font-bold text-navy"
        >
          Get a New Quote
        </Link>
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className="mx-auto w-full min-w-0 max-w-lg break-words rounded-2xl border border-amber-400/30 bg-navy-dark/70 p-6 text-center text-white">
        <h1 className="text-xl font-semibold">This quote has expired</h1>
        <p className="mt-3 text-sm text-white/75">
          This saved quote is no longer available at the original price.
        </p>
        <p className="mt-2 text-sm text-white/75">
          Please get a new quote to see the current price.
        </p>
        {quote ? (
          <p className="mt-4 font-mono text-xs text-white/45">Reference: {quote.reference}</p>
        ) : null}
        <Link
          href="/#quote"
          className="mt-6 inline-flex rounded-xl bg-emerald px-5 py-3 text-sm font-bold text-navy"
        >
          Get a New Quote
        </Link>
      </div>
    );
  }

  if (state === "booked") {
    return (
      <div className="mx-auto w-full min-w-0 max-w-lg break-words rounded-2xl border border-emerald/30 bg-navy-dark/70 p-6 text-center text-white">
        <h1 className="text-xl font-semibold">This journey has already been booked.</h1>
        {quote?.paymentReference ? (
          <p className="mt-3 text-sm text-white/80">
            Booking reference:{" "}
            <span className="font-mono text-emerald">{quote.paymentReference}</span>
          </p>
        ) : null}
        {quote ? (
          <p className="mt-2 font-mono text-xs text-white/45">Quote: {quote.reference}</p>
        ) : null}
        <Link
          href="/"
          className="mt-6 inline-flex rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white"
        >
          Back to home
        </Link>
      </div>
    );
  }

  if (!quote || !journey) {
    return null;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-lg space-y-4">
      <div className="rounded-2xl border border-white/10 bg-navy-dark/70 p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-emerald">Saved quote</p>
        <p className="mt-1 font-mono text-sm text-white/55">{quote.reference}</p>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-white">
          {requoting ? "Updating…" : effectiveAmountLabel}
        </p>
        {scheduleChanged ? (
          <p className="mt-1 text-sm text-amber-200/90">
            Date/time changed — new calculated price (original locked quote {quote.amountLabel} no
            longer applies).
          </p>
        ) : (
          <p className="mt-1 text-sm text-white/60">Fixed price · valid until {quote.expiresAtLabel}</p>
        )}

        <dl className="mt-5 space-y-3 text-sm text-white/80">
          <div>
            <dt className="text-xs uppercase tracking-wider text-white/45">From</dt>
            <dd className="mt-0.5 break-words">{journey.pickupLabel}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-white/45">To</dt>
            <dd className="mt-0.5 break-words">{journey.dropoffLabel}</dd>
          </div>
          {journey.airportCode ? (
            <div>
              <dt className="text-xs uppercase tracking-wider text-white/45">Airport</dt>
              <dd className="mt-0.5">{journey.airportCode}</dd>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="mb-1 text-xs uppercase tracking-wider text-white/45">
                Date {!tripDate.trim() ? <span className="normal-case text-white/40">(Not set)</span> : null}
              </dt>
              <dd>
                <input
                  type="date"
                  className={`${fieldClass} w-full`}
                  value={tripDate}
                  onChange={(e) => setTripDate(e.target.value)}
                />
              </dd>
            </div>
            <div>
              <dt className="mb-1 text-xs uppercase tracking-wider text-white/45">
                Time {!tripTime.trim() ? <span className="normal-case text-white/40">(Not set)</span> : null}
              </dt>
              <dd>
                <input
                  type="time"
                  className={`${fieldClass} w-full`}
                  value={tripTime}
                  onChange={(e) => setTripTime(e.target.value)}
                />
              </dd>
            </div>
          </div>
          <p className="text-xs text-white/45">
            Date and time can be added later — they are required before payment. Changing date or
            time recalculates the fare.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs uppercase tracking-wider text-white/45">Passengers</dt>
              <dd className="mt-0.5">{journey.passengers}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-white/45">Luggage</dt>
              <dd className="mt-0.5">{journey.suitcases}</dd>
            </div>
          </div>
          {journey.flightNumber || flightNumber ? (
            <div>
              <dt className="text-xs uppercase tracking-wider text-white/45">Flight</dt>
              <dd className="mt-0.5">{journey.flightNumber || flightNumber}</dd>
            </div>
          ) : null}
          {typeof journey.childSeats === "number" && journey.childSeats > 0 ? (
            <div>
              <dt className="text-xs uppercase tracking-wider text-white/45">Child seats</dt>
              <dd className="mt-0.5">
                {journey.childSeats}
                {journey.childSeatNotes ? ` · ${journey.childSeatNotes}` : ""}
              </dd>
            </div>
          ) : null}
          {journey.returnJourney ? (
            <div>
              <dt className="text-xs uppercase tracking-wider text-white/45">Return</dt>
              <dd className="mt-0.5">
                {[journey.returnDate, journey.returnTime].filter(Boolean).join(" at ") || "Yes"}
                {journey.returnFlightNumber
                  ? ` · Flight ${journey.returnFlightNumber}`
                  : ""}
              </dd>
            </div>
          ) : null}
        </dl>

        {!bookingMode ? (
          <button
            type="button"
            onClick={() => setBookingMode(true)}
            className="mt-6 w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light"
          >
            Book This Journey
          </button>
        ) : null}
      </div>

      {bookingMode ? (
        <form
          className="space-y-4 rounded-2xl border border-white/10 bg-navy-dark/70 p-5 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void pay();
          }}
        >
          <h2 className="text-lg font-semibold text-white">Complete your booking</h2>
          <p className="text-sm text-white/65">
            Journey details are already filled from your saved quote. We just need a few details to
            finish booking.
          </p>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/60">Full name</label>
            <input
              className={`${fieldClass} w-full`}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/60">Email</label>
            <input
              className={`${fieldClass} w-full`}
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/60">
              Mobile / WhatsApp
            </label>
            <input
              className={`${fieldClass} w-full`}
              type="tel"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              autoComplete="tel"
              required
              placeholder="07…"
            />
          </div>
          {(journey.isFromAirport ||
            (journey.returnJourney &&
              (journey.isAirportTrip || journey.airportCode) &&
              journey.isFromAirport === false)) && (
            <div className="space-y-3">
              {journey.isFromAirport ? (
                <div>
                  <label
                    htmlFor="saved-quote-flight-number"
                    className="mb-1.5 block text-xs font-medium text-white/60"
                  >
                    Flight number <span className="font-normal text-white/40">(optional)</span>
                  </label>
                  <input
                    id="saved-quote-flight-number"
                    className={`${fieldClass} w-full uppercase placeholder:normal-case`}
                    value={flightNumber}
                    onChange={(e) => setFlightNumber(e.target.value)}
                    placeholder="e.g. EI123"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                  />
                  <p className="mt-1.5 text-xs leading-snug text-white/55">
                    Used to monitor your flight and adjust your collection time if your flight
                    arrives early or is delayed.
                  </p>
                </div>
              ) : null}
              {journey.returnJourney &&
              (journey.isAirportTrip || journey.airportCode) &&
              journey.isFromAirport === false ? (
                <div>
                  <label
                    htmlFor="saved-quote-return-flight-number"
                    className="mb-1.5 block text-xs font-medium text-white/60"
                  >
                    Return flight number{" "}
                    <span className="font-normal text-white/40">(optional)</span>
                  </label>
                  <input
                    id="saved-quote-return-flight-number"
                    className={`${fieldClass} w-full uppercase placeholder:normal-case`}
                    value={returnFlightNumber}
                    onChange={(e) => setReturnFlightNumber(e.target.value)}
                    placeholder="e.g. EI456"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                  />
                  <p className="mt-1.5 text-xs leading-snug text-white/55">
                    Used to monitor your flight and adjust your collection time if your flight
                    arrives early or is delayed.
                  </p>
                </div>
              ) : null}
            </div>
          )}

          <BookingTermsConsent
            accepted={termsAccepted}
            onAcceptedChange={setTermsAccepted}
            mode="card-payment"
            paymentAmountLabel={effectiveAmountLabel}
            error={!termsAccepted && error.includes("Terms") ? error : undefined}
          />

          {error ? (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={paying}
            className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light disabled:cursor-not-allowed disabled:opacity-70"
          >
            {paying ? "Starting secure payment…" : "Confirm Booking & Pay Securely"}
          </button>
          <p className="text-center text-xs text-white/45">
            Secure card payment powered by SumUp.
          </p>
        </form>
      ) : null}
    </div>
  );
}

export default function SavedQuoteCustomerClient() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-lg rounded-2xl border border-white/10 bg-navy-dark/70 p-6 text-center text-white/70">
          Loading your saved quote…
        </div>
      }
    >
      <SavedQuoteInner />
    </Suspense>
  );
}
