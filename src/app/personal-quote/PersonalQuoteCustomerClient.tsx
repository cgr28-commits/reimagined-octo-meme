"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import BookingTermsConsent from "@/components/BookingTermsConsent";
import {
  buildPaymentRedirectUrl,
  createPaymentCheckout,
  isSumUpPaymentEnabled,
} from "@/lib/create-payment";
import { isValidEmailAddress, isValidMobileNumber, type BookingDetails } from "@/lib/booking-message";
import { VEHICLE_TYPES } from "@/lib/data";
import { createPaymentReturnToken, savePendingPayment } from "@/lib/pending-payment";
import { fetchPersonalQuoteByToken, type PersonalQuotePublicSummary } from "@/lib/personal-quote-api";
import { TERMS_LAST_UPDATED } from "@/lib/terms";
import { CANCELLATION_POLICY_VERSION } from "../../../shared/refund-ops";
import {
  PERSONAL_QUOTE_MAX_PASSENGERS,
  PERSONAL_QUOTE_MIN_PASSENGERS,
  PERSONAL_QUOTE_PASSENGER_LIMIT_ERROR,
  describePersonalQuotePayment,
  isValidPersonalQuotePassengerCount,
} from "../../../shared/personal-quote";
import { getPaymentBookingBlockers } from "../../../shared/paid-booking-gate";
import { formatReturnJourneyDiscountPercent } from "../../../shared/return-journey-discount";

/** Personal-quote links: saloon/estate only — no minibus / 5–7 options. */
const PERSONAL_QUOTE_VEHICLE_TYPES = VEHICLE_TYPES.filter(
  (v) => !v.toLowerCase().includes("minibus") && !v.includes("5–7"),
) as unknown as readonly (typeof VEHICLE_TYPES)[number][];

function readTokenFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("t")?.trim() ?? "";
}

function detectAirport(pickup: string, dropoff: string): {
  isAirportTrip: boolean;
  airportCode?: string;
  isFromAirport?: boolean;
} {
  const text = `${pickup} ${dropoff}`.toUpperCase();
  const codes = [
    { code: "BFS", patterns: ["BFS", "BELFAST INTERNATIONAL", "ALDERGROVE"] },
    { code: "BHD", patterns: ["BHD", "GEORGE BEST", "CITY AIRPORT", "BELFAST CITY"] },
    { code: "LDY", patterns: ["LDY", "CITY OF DERRY", "DERRY AIRPORT"] },
    { code: "DUB", patterns: ["DUB", "DUBLIN AIRPORT"] },
  ] as const;
  for (const entry of codes) {
    if (entry.patterns.some((p) => text.includes(p))) {
      const pickupUpper = pickup.toUpperCase();
      const isFromAirport = entry.patterns.some((p) => pickupUpper.includes(p));
      return { isAirportTrip: true, airportCode: entry.code, isFromAirport };
    }
  }
  if (text.includes("AIRPORT")) {
    return { isAirportTrip: true, isFromAirport: pickup.toUpperCase().includes("AIRPORT") };
  }
  return { isAirportTrip: false };
}

function PersonalQuoteInner() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(() => searchParams.get("t")?.trim() ?? "");
  const [quote, setQuote] = useState<PersonalQuotePublicSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [tripDate, setTripDate] = useState("");
  const [tripTime, setTripTime] = useState("");
  const [returnJourney, setReturnJourney] = useState(false);
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [passengers, setPassengers] = useState(2);
  const [suitcases, setSuitcases] = useState(2);
  const [vehicle, setVehicle] = useState<(typeof VEHICLE_TYPES)[number]>(
    PERSONAL_QUOTE_VEHICLE_TYPES[0] ?? VEHICLE_TYPES[0],
  );
  const [flightNumber, setFlightNumber] = useState("");
  const [returnFlightNumber, setReturnFlightNumber] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    const fromUrl = searchParams.get("t")?.trim() ?? readTokenFromLocation();
    setToken(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setQuote(null);
      setError(
        "This personal quote link is invalid or no longer available. Please contact My Airport Taxi NI.",
      );
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const loaded = await fetchPersonalQuoteByToken(token);
        if (cancelled) return;
        setQuote(loaded);
        setCustomerName(loaded.customerName || "");
        // Email/mobile are never returned by the public token endpoint — customer enters them.
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "This personal quote link is invalid or no longer available. Please contact My Airport Taxi NI.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const airportMeta = useMemo(() => {
    if (!quote) return { isAirportTrip: false as const };
    return detectAirport(quote.pickupLabel || "", quote.dropoffLabel || "");
  }, [quote]);

  const paymentDisplay = useMemo(() => {
    if (!quote) return null;
    return describePersonalQuotePayment({
      agreedAmount: quote.agreedAmount,
      standardWebsiteAmount: quote.standardWebsiteAmount,
      returnJourney,
    });
  }, [quote, returnJourney]);

  function buildBooking(): BookingDetails | null {
    if (!quote || !paymentDisplay) return null;
    const pickup = (quote.pickupLabel || "").trim();
    const dropoff = (quote.dropoffLabel || "").trim();
    return {
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      mobileNumber: mobileNumber.trim(),
      tripLabel: airportMeta.isAirportTrip ? "Airport transfer" : "Private transfer",
      pickupLabel: pickup,
      dropoffLabel: dropoff,
      returnJourney,
      tripDate,
      tripTime,
      returnDate: returnJourney ? returnDate : "",
      returnTime: returnJourney ? returnTime : "",
      flightNumber: airportMeta.isAirportTrip ? flightNumber.trim() : "",
      returnFlightNumber:
        airportMeta.isAirportTrip && returnJourney ? returnFlightNumber.trim() : "",
      passengers,
      suitcases,
      vehicle,
      estimatedPrice: paymentDisplay.paymentAmountLabel,
      isAirportTrip: airportMeta.isAirportTrip,
      ...(airportMeta.airportCode ? { airportCode: airportMeta.airportCode } : {}),
      ...(typeof airportMeta.isFromAirport === "boolean"
        ? { isFromAirport: airportMeta.isFromAirport }
        : {}),
      termsAcceptedAt: new Date().toISOString(),
      termsVersion: TERMS_LAST_UPDATED,
      cancellationPolicyVersion: CANCELLATION_POLICY_VERSION,
    };
  }

  async function handlePay(event: React.FormEvent) {
    event.preventDefault();
    if (!quote || paying) return;
    setPaying(true);
    setError("");
    try {
      if (!isSumUpPaymentEnabled()) {
        throw new Error("Online payment is not configured");
      }
      if (!termsAccepted) {
        throw new Error("Please accept the Terms & Conditions before paying.");
      }
      if (!isValidEmailAddress(customerEmail)) {
        throw new Error("Please enter a valid email address.");
      }
      if (!isValidMobileNumber(mobileNumber)) {
        throw new Error("Please enter a valid mobile number.");
      }
      if (!isValidPersonalQuotePassengerCount(passengers)) {
        throw new Error(PERSONAL_QUOTE_PASSENGER_LIMIT_ERROR);
      }
      if (!paymentDisplay) {
        throw new Error("Could not calculate payment amount.");
      }
      const booking = buildBooking();
      if (!booking) throw new Error("Quote details are missing.");
      if (!booking.pickupLabel || !booking.dropoffLabel) {
        throw new Error(
          "This quote is missing pickup or drop-off details. Please contact My Airport Taxi NI.",
        );
      }
      const blockers = getPaymentBookingBlockers(booking);
      if (blockers.length > 0) {
        throw new Error(blockers[0]);
      }

      // Amount here is display-only — Worker recalculates from KV + returnJourney.
      const returnToken = createPaymentReturnToken();
      const checkout = await createPaymentCheckout({
        amount: paymentDisplay!.paymentAmount,
        description: `Personal quote ${quote.code}`,
        redirectUrl: buildPaymentRedirectUrl(returnToken),
        booking,
        personalQuoteCode: quote.code,
        ...(typeof quote.standardWebsiteAmount === "number"
          ? { standardWebsiteAmount: quote.standardWebsiteAmount }
          : {}),
      });
      if (!checkout.paymentUrl || !checkout.checkoutId) {
        throw new Error("Could not start secure payment");
      }
      savePendingPayment(
        {
          checkoutId: checkout.checkoutId,
          paymentUrl: checkout.paymentUrl,
          checkoutReference: checkout.checkoutReference,
          amountLabel: paymentDisplay!.paymentAmountLabel,
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
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-navy/80 p-6 text-white">
        <p className="text-sm text-white/70">Loading your personal quote…</p>
      </div>
    );
  }

  if (error && !quote) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-400/30 bg-navy/80 p-6 text-white">
        <h1 className="text-xl font-bold">Personal quote unavailable</h1>
        <p className="mt-3 text-sm text-white/75">{error}</p>
      </div>
    );
  }

  if (!quote || !paymentDisplay) return null;

  const showSaving =
    typeof quote.standardWebsiteAmount === "number" &&
    typeof quote.discountAmount === "number" &&
    quote.discountAmount > 0;

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-navy/80 p-5 text-white sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald">Personal quote</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Your private airport transfer quote</h1>
      <p className="mt-2 text-sm text-white/65">
        This is a personally agreed fare from My Airport Taxi NI. Complete your trip details below
        and pay securely with SumUp.
      </p>

      <dl className="mt-6 grid gap-3 text-sm text-white/75">
        {quote.customerName ? (
          <div>
            <dt className="text-white/40">Prepared for</dt>
            <dd className="text-white">{quote.customerName}</dd>
          </div>
        ) : null}
        {quote.pickupLabel ? (
          <div>
            <dt className="text-white/40">Pickup</dt>
            <dd className="break-words text-white">{quote.pickupLabel}</dd>
          </div>
        ) : null}
        {quote.dropoffLabel ? (
          <div>
            <dt className="text-white/40">Destination</dt>
            <dd className="break-words text-white">{quote.dropoffLabel}</dd>
          </div>
        ) : null}
        {quote.notes ? (
          <div>
            <dt className="text-white/40">Journey notes</dt>
            <dd className="break-words text-white">{quote.notes}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-white/40">Expires</dt>
          <dd className="text-white">{quote.expiresOn}</dd>
        </div>
      </dl>

      <div className="mt-5 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-4">
        {showSaving ? (
          <div className="space-y-1 text-sm">
            <p className="text-white/70">
              Standard fare:{" "}
              <span className="line-through">{quote.standardWebsiteAmountLabel}</span>
            </p>
            <p className="text-lg font-bold text-white">
              Your agreed fare: {quote.amountLabel}
              {paymentDisplay.returnJourney ? " each way" : ""}
            </p>
            <p className="font-medium text-emerald">You save {quote.discountAmountLabel}</p>
          </div>
        ) : (
          <p className="text-lg font-bold text-white">
            Agreed fare: {quote.amountLabel}
            {paymentDisplay.returnJourney ? " each way" : ""}
          </p>
        )}

        {paymentDisplay.returnJourney ? (
          <div className="mt-3 space-y-1 border-t border-white/10 pt-3 text-sm">
            {paymentDisplay.appliesWebsiteReturnDiscount ? (
              <>
                <p className="text-white/70">One-way fare: {paymentDisplay.oneWayAgreedLabel}</p>
                <p className="text-white/70">
                  Return journey discount: {formatReturnJourneyDiscountPercent()}
                </p>
                <p className="text-lg font-bold text-white">
                  Return total: {paymentDisplay.paymentAmountLabel}
                </p>
              </>
            ) : (
              <>
                <p className="text-white/70">
                  Personal agreed fare: {paymentDisplay.oneWayAgreedLabel} each way
                </p>
                <p className="text-lg font-bold text-white">
                  Return total: {paymentDisplay.paymentAmountLabel}
                </p>
              </>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm font-semibold text-white">
            Total to pay: {paymentDisplay.paymentAmountLabel}
          </p>
        )}

        <p className="mt-2 text-xs text-white/55">
          Fixed price — your payment amount is authorised server-side and cannot be changed via this
          link.
        </p>
      </div>

      <form onSubmit={(e) => void handlePay(e)} className="mt-6 grid gap-3">
        <label className="block text-sm text-white/80">
          Full name
          <input
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2.5 text-base text-white"
          />
        </label>
        <label className="block text-sm text-white/80">
          Email
          <input
            required
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2.5 text-base text-white"
          />
        </label>
        <label className="block text-sm text-white/80">
          Mobile
          <input
            required
            type="tel"
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2.5 text-base text-white"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-white/80">
            Journey date
            <input
              required
              type="date"
              value={tripDate}
              onChange={(e) => setTripDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2.5 text-base text-white"
            />
          </label>
          <label className="block text-sm text-white/80">
            Pickup time
            <input
              required
              type="time"
              value={tripTime}
              onChange={(e) => setTripTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2.5 text-base text-white"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-white/80">
            Passengers
            <input
              required
              type="number"
              min={PERSONAL_QUOTE_MIN_PASSENGERS}
              max={PERSONAL_QUOTE_MAX_PASSENGERS}
              value={passengers}
              onChange={(e) => {
                const next = Number(e.target.value) || PERSONAL_QUOTE_MIN_PASSENGERS;
                setPassengers(
                  Math.min(
                    PERSONAL_QUOTE_MAX_PASSENGERS,
                    Math.max(PERSONAL_QUOTE_MIN_PASSENGERS, next),
                  ),
                );
              }}
              className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2.5 text-base text-white"
            />
          </label>
          <label className="block text-sm text-white/80">
            Suitcases
            <input
              required
              type="number"
              min={0}
              max={12}
              value={suitcases}
              onChange={(e) => setSuitcases(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2.5 text-base text-white"
            />
          </label>
        </div>
        <label className="block text-sm text-white/80">
          Vehicle
          <select
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value as (typeof VEHICLE_TYPES)[number])}
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2.5 text-base text-white"
          >
            {PERSONAL_QUOTE_VEHICLE_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        {airportMeta.isAirportTrip ? (
          <label className="block text-sm text-white/80">
            Flight number
            <input
              value={flightNumber}
              onChange={(e) => setFlightNumber(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2.5 text-base text-white"
              placeholder="e.g. EI3045"
            />
          </label>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={returnJourney}
            onChange={(e) => setReturnJourney(e.target.checked)}
            className="h-4 w-4 rounded border-white/30 bg-navy text-emerald"
          />
          Return journey
        </label>
        {returnJourney ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-white/80">
              Return date
              <input
                required
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2.5 text-base text-white"
              />
            </label>
            <label className="block text-sm text-white/80">
              Return time
              <input
                required
                type="time"
                value={returnTime}
                onChange={(e) => setReturnTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2.5 text-base text-white"
              />
            </label>
            {airportMeta.isAirportTrip ? (
              <label className="col-span-2 block text-sm text-white/80">
                Return flight number
                <input
                  value={returnFlightNumber}
                  onChange={(e) => setReturnFlightNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-navy/60 px-3 py-2.5 text-base text-white"
                />
              </label>
            ) : null}
          </div>
        ) : null}

        <BookingTermsConsent
          accepted={termsAccepted}
          onAcceptedChange={setTermsAccepted}
          mode="card-payment"
          paymentAmountLabel={paymentDisplay.paymentAmountLabel}
        />

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <button
          type="submit"
          disabled={paying || !termsAccepted}
          className="mt-1 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald px-5 py-3 text-base font-bold text-navy disabled:opacity-60"
        >
          {paying
            ? "Opening secure payment…"
            : `Pay ${paymentDisplay.paymentAmountLabel} securely with SumUp`}
        </button>
        <p className="text-center text-xs text-white/45">
          You will not be asked to run the website quote tool. The agreed fare stays fixed.
        </p>
      </form>
    </div>
  );
}

export default function PersonalQuoteCustomerClient() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-navy/80 p-6 text-white">
          <p className="text-sm text-white/70">Loading your personal quote…</p>
        </div>
      }
    >
      <PersonalQuoteInner />
    </Suspense>
  );
}
