"use client";

import { FormEvent, memo, useCallback, useEffect, useMemo, useState } from "react";
import AddressInput from "@/components/AddressInput";
import TripMap from "@/components/TripMap";
import { buildBookingMessage, isValidEmailAddress, isValidMobileNumber, type BookingDetails } from "@/lib/booking-message";
import { detectMobileDevice, useIsMobileDevice } from "@/lib/device";
import { AIRPORTS, SITE, VEHICLE_TYPES } from "@/lib/data";
import { readPrefillAirport } from "@/lib/quote-prefill";
import {
  calculatePointToPointQuote,
  calculateQuote,
  formatQuote,
} from "@/lib/quote";
import { submitBookingByEmail } from "@/lib/submit-booking";
import type { RouteSummary } from "@/lib/trip-route";

type TripMode = "airport" | "address";
type TripDirection = "to-airport" | "from-airport";

const PICKUP_STORAGE_KEY = "my-airport-taxi-ni-pickup-address";
const DROPOFF_STORAGE_KEY = "my-airport-taxi-ni-dropoff-address";

const ESTATE = "Estate Car (1–4 passengers)" as const;
const MINIBUS = "Minibus (7–8 passengers)" as const;

type VehicleType = (typeof VEHICLE_TYPES)[number];

function getAutoVehicle(passengers: number, suitcases: number): VehicleType | null {
  if (passengers >= 8 || suitcases >= 5) {
    return MINIBUS;
  }
  if (suitcases === 4) {
    return ESTATE;
  }
  return null;
}

function formatDisplayDate(date: string): string {
  if (!date) {
    return "";
  }

  return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDisplayTime(time: string): string {
  if (!time) {
    return "";
  }

  const [hours, minutes] = time.split(":");
  const parsed = new Date();
  parsed.setHours(Number(hours), Number(minutes));
  return parsed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-white/10 py-2.5 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-wider text-white/45">{label}</dt>
      <dd className="text-sm text-white sm:max-w-[65%] sm:text-right">{value}</dd>
    </div>
  );
}

function parseDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}`);
}

function isReturnAfterOutbound(
  outboundDate: string,
  outboundTime: string,
  returnDate: string,
  returnTime: string,
): boolean {
  return parseDateTime(returnDate, returnTime) > parseDateTime(outboundDate, outboundTime);
}

function QuoteCard() {
  const isMobileDevice = useIsMobileDevice();
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [bookingSent, setBookingSent] = useState(false);
  const [showBookingPreview, setShowBookingPreview] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [mobileNumberError, setMobileNumberError] = useState("");
  const [emailAddressError, setEmailAddressError] = useState("");
  const [tripMode, setTripMode] = useState<TripMode>("airport");
  const [tripDirection, setTripDirection] = useState<TripDirection>("to-airport");
  const [airportCode, setAirportCode] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [returnJourney, setReturnJourney] = useState(false);
  const [returnDateError, setReturnDateError] = useState("");
  const [flightNumberError, setFlightNumberError] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [tripDate, setTripDate] = useState("");
  const [tripTime, setTripTime] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [vehicle, setVehicle] = useState<VehicleType>(VEHICLE_TYPES[0]);
  const [passengers, setPassengers] = useState(1);
  const [suitcases, setSuitcases] = useState(1);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);

  const handleRouteInfo = useCallback((summary: RouteSummary | null) => {
    setRouteSummary(summary);
  }, []);

  const autoVehicle = getAutoVehicle(passengers, suitcases);
  const quoteVehicle = autoVehicle ?? vehicle;
  const isVehicleAutoSelected = autoVehicle != null;

  const isAirportTrip = tripMode === "airport";
  const isFromAirport = tripDirection === "from-airport";
  const addressLookupCode = isAirportTrip ? airportCode : "BFS";

  useEffect(() => {
    const savedPickup = localStorage.getItem(PICKUP_STORAGE_KEY);
    const savedDropoff = localStorage.getItem(DROPOFF_STORAGE_KEY);
    if (savedPickup) {
      setPickupAddress(savedPickup);
    }
    if (savedDropoff) {
      setDropoffAddress(savedDropoff);
    }
  }, []);

  useEffect(() => {
    function applyAirportPrefill(code: string) {
      if (AIRPORTS.some((airport) => airport.code === code)) {
        setTripMode("airport");
        setAirportCode(code);
        setTripDirection("to-airport");
      }
    }

    if (window.location.hash === "#quote") {
      const params = new URLSearchParams(window.location.search);
      const airportFromQuery = params.get("airport")?.trim().toUpperCase();
      if (airportFromQuery) {
        applyAirportPrefill(airportFromQuery);
      }
    }

    const stored = readPrefillAirport();
    if (stored) {
      applyAirportPrefill(stored);
    }

    function handlePrefill(event: Event) {
      const code = (event as CustomEvent<string>).detail;
      if (code) {
        applyAirportPrefill(code);
      }
    }

    window.addEventListener("quote-prefill-airport", handlePrefill);
    return () => window.removeEventListener("quote-prefill-airport", handlePrefill);
  }, []);

  const isScheduleComplete =
    Boolean(tripDate && tripTime) &&
    (!returnJourney || Boolean(returnDate && returnTime));

  const quoteAddress = isFromAirport ? dropoffAddress : pickupAddress;
  const isAirportAddressComplete = Boolean(airportCode && quoteAddress.trim());
  const isPointToPointAddressComplete = Boolean(
    pickupAddress.trim() && dropoffAddress.trim(),
  );
  const isAddressComplete = isAirportTrip
    ? isAirportAddressComplete
    : isPointToPointAddressComplete;

  const canShowPrice = isScheduleComplete && isAddressComplete;

  const liveQuote = useMemo(() => {
    if (!canShowPrice) {
      return null;
    }

    const schedule = {
      outboundDate: tripDate,
      outboundTime: tripTime,
      returnDate,
      returnTime,
      returnJourney,
    };

    if (isAirportTrip) {
      return calculateQuote(quoteAddress, airportCode, quoteVehicle, returnJourney, schedule);
    }

    return calculatePointToPointQuote(
      pickupAddress,
      dropoffAddress,
      quoteVehicle,
      returnJourney,
      schedule,
    );
  }, [
    airportCode,
    canShowPrice,
    dropoffAddress,
    isAirportTrip,
    pickupAddress,
    quoteAddress,
    returnDate,
    returnJourney,
    returnTime,
    tripDate,
    tripTime,
    quoteVehicle,
  ]);

  function handlePickupChange(value: string) {
    setPickupAddress(value);
    if (value.trim()) {
      localStorage.setItem(PICKUP_STORAGE_KEY, value.trim());
    }
  }

  function handleDropoffChange(value: string) {
    setDropoffAddress(value);
    if (value.trim()) {
      localStorage.setItem(DROPOFF_STORAGE_KEY, value.trim());
    }
  }

  const canBookAirport = !isAirportTrip || Boolean(flightNumber.trim());

  const airportName =
    AIRPORTS.find((a) => a.code === airportCode)?.name ?? airportCode;

  const pickupLabel = isAirportTrip
    ? isFromAirport
      ? airportName
      : pickupAddress.trim()
    : pickupAddress.trim();

  const dropoffLabel = isAirportTrip
    ? isFromAirport
      ? dropoffAddress.trim()
      : airportName
    : dropoffAddress.trim();

  function validateBooking(): boolean {
    if (returnJourney) {
      if (!returnDate || !returnTime) {
        setReturnDateError("Please select a return date and time.");
        return false;
      }
      if (!isReturnAfterOutbound(tripDate, tripTime, returnDate, returnTime)) {
        setReturnDateError("Return date and time must be after your outbound trip.");
        return false;
      }
    }
    setReturnDateError("");

    if (isAirportTrip && !flightNumber.trim()) {
      setFlightNumberError("Please enter your flight number to book.");
      return false;
    }
    setFlightNumberError("");

    const onDesktop = !(isMobileDevice ?? detectMobileDevice());
    if (onDesktop) {
      if (!customerEmail.trim()) {
        setEmailAddressError("Please enter your email address so we can send your payment link.");
        return false;
      }
      if (!isValidEmailAddress(customerEmail)) {
        setEmailAddressError("Please enter a valid email address.");
        return false;
      }
      if (!customerMobile.trim()) {
        setMobileNumberError("Please enter your mobile number so we can contact you.");
        return false;
      }
      if (!isValidMobileNumber(customerMobile)) {
        setMobileNumberError("Please enter a valid mobile number.");
        return false;
      }
    }
    setEmailAddressError("");
    setMobileNumberError("");

    return true;
  }

  function buildBookingDetails(): BookingDetails {
    const tripLabel = isAirportTrip
      ? isFromAirport
        ? "Airport pickup"
        : "Airport drop-off"
      : "Address to address";

    const estimatedPrice = liveQuote ? formatQuote(liveQuote.amount) : null;
    const journeySuffix = returnJourney ? " (return)" : "";

    return {
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      mobileNumber: customerMobile.trim(),
      tripLabel,
      pickupLabel,
      dropoffLabel,
      returnJourney,
      tripDate,
      tripTime,
      returnDate,
      returnTime,
      flightNumber: flightNumber.trim().toUpperCase(),
      passengers,
      suitcases,
      vehicle: quoteVehicle,
      estimatedPrice,
      journeyDistance: routeSummary
        ? `${routeSummary.distanceLabel}${journeySuffix}`
        : null,
      journeyDuration: routeSummary
        ? `${routeSummary.durationLabel}${journeySuffix}`
        : null,
      isAirportTrip,
    };
  }

  function openWhatsAppBooking(details: BookingDetails) {
    const message = encodeURIComponent(buildBookingMessage(details));
    window.open(`https://wa.me/${SITE.whatsapp}?text=${message}`, "_blank");
    setSubmitted(true);
    setShowBookingPreview(false);
    setBookingSent(true);
    setTimeout(() => setSubmitted(false), 4000);
  }

  async function submitDesktopBooking(details: BookingDetails) {
    setSubmitted(true);
    setSubmitError("");

    try {
      await submitBookingByEmail(details);
      setShowBookingPreview(false);
      setBookingSent(true);
    } catch {
      setSubmitError(
        `We couldn't confirm your booking automatically. Please email ${SITE.email} with your trip details and we'll confirm your booking.`,
      );
    } finally {
      setSubmitted(false);
    }
  }

  async function confirmBooking() {
    const details = buildBookingDetails();
    const mobile = isMobileDevice ?? detectMobileDevice();

    if (mobile) {
      openWhatsAppBooking(details);
      return;
    }

    await submitDesktopBooking(details);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError("");
    setBookingSent(false);

    if (!validateBooking()) {
      return;
    }

    if (!showBookingPreview) {
      setShowBookingPreview(true);
      return;
    }

    void confirmBooking();
  }

  function handleEditBooking() {
    setShowBookingPreview(false);
    setSubmitError("");
    setBookingSent(false);
  }

  const usesWhatsApp = isMobileDevice === true;
  const usesEmail = isMobileDevice !== true;

  const submitInProgressLabel = usesWhatsApp
    ? "Opening WhatsApp…"
    : "Confirming booking…";

  const confirmButtonLabel = liveQuote
    ? `Confirm & book for ${formatQuote(liveQuote.amount)}`
    : usesWhatsApp
      ? "Confirm & send via WhatsApp"
      : "Confirm & book";

  const reviewButtonLabel = liveQuote ? "Review booking" : "Review booking details";

  const initialButtonLabel =
    isAirportTrip && liveQuote && !canBookAirport
      ? "Enter flight number to book"
      : liveQuote
        ? reviewButtonLabel
        : isAirportTrip
          ? usesWhatsApp
            ? "Send via WhatsApp"
            : reviewButtonLabel
          : reviewButtonLabel;

  const quoteHint = isAirportTrip
    ? !airportCode
      ? "Select an airport to see your estimated price"
      : !isScheduleComplete
        ? returnJourney && tripDate && tripTime && (!returnDate || !returnTime)
          ? "Select your return date and time to see your estimated price"
          : "Select your date and time to see your estimated price"
        : !isAddressComplete
          ? `Enter your ${isFromAirport ? "drop-off" : "pickup"} address to see your estimated price`
          : ""
    : !isScheduleComplete
      ? returnJourney && tripDate && tripTime && (!returnDate || !returnTime)
        ? "Select your return date and time to see your estimated price"
        : "Select your date and time to see your estimated price"
      : !pickupAddress.trim()
        ? "Enter your pickup address to see your estimated price"
        : !dropoffAddress.trim()
          ? "Enter your drop-off address to see your estimated price"
          : "";

  return (
    <div className="glass-card rounded-2xl p-6 sm:p-8 lg:animate-float">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white sm:text-2xl">Get a Live Quote</h2>
        <p className="mt-1 text-sm text-white/60">
          {isAirportTrip
            ? usesWhatsApp
              ? "See your estimated price instantly, then book via WhatsApp"
              : "See your estimated price instantly, then review and confirm your booking"
            : usesWhatsApp
              ? "See your estimated price instantly, then book via WhatsApp"
              : "See your estimated price instantly, then review and confirm your booking"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">
            Service Type
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => {
                setTripMode("airport");
                setReturnDateError("");
              }}
              className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                isAirportTrip
                  ? "bg-emerald text-navy shadow-sm"
                  : "text-white/70 hover:text-white"
              }`}
            >
              Airport transfer
            </button>
            <button
              type="button"
              onClick={() => {
                setTripMode("address");
                setReturnDateError("");
              }}
              className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                !isAirportTrip
                  ? "bg-emerald text-navy shadow-sm"
                  : "text-white/70 hover:text-white"
              }`}
            >
              Address to address
            </button>
          </div>
        </div>

        {isAirportTrip && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">
              Trip Type
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setTripDirection("to-airport")}
                className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                  tripDirection === "to-airport"
                    ? "bg-emerald text-navy shadow-sm"
                    : "text-white/70 hover:text-white"
                }`}
              >
                To airport
              </button>
              <button
                type="button"
                onClick={() => setTripDirection("from-airport")}
                className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                  tripDirection === "from-airport"
                    ? "bg-emerald text-navy shadow-sm"
                    : "text-white/70 hover:text-white"
                }`}
              >
                From airport
              </button>
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">
            Journey
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => {
                setReturnJourney(false);
                setReturnDateError("");
              }}
              className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                !returnJourney
                  ? "bg-emerald text-navy shadow-sm"
                  : "text-white/70 hover:text-white"
              }`}
            >
              One way
            </button>
            <button
              type="button"
              onClick={() => setReturnJourney(true)}
              className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                returnJourney
                  ? "bg-emerald text-navy shadow-sm"
                  : "text-white/70 hover:text-white"
              }`}
            >
              Return journey
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="name"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
          >
            Your Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            value={customerName}
            onChange={(e) => {
              setCustomerName(e.target.value);
              setShowBookingPreview(false);
              setBookingSent(false);
            }}
            placeholder="John Smith"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
          />
        </div>

        {isMobileDevice !== true && (
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={customerEmail}
              onChange={(e) => {
                setCustomerEmail(e.target.value);
                setShowBookingPreview(false);
                setBookingSent(false);
                setEmailAddressError("");
              }}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
            />
            <p className="mt-1.5 text-xs text-white/40">
              We&apos;ll send your payment link here.
            </p>
            {emailAddressError && (
              <p className="mt-1.5 text-xs text-red-300">{emailAddressError}</p>
            )}
          </div>
        )}

        {isMobileDevice !== true && (
          <div>
            <label
              htmlFor="mobile"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              Mobile Number
            </label>
            <input
              id="mobile"
              name="mobile"
              type="tel"
              required
              autoComplete="tel"
              value={customerMobile}
              onChange={(e) => {
                setCustomerMobile(e.target.value);
                setShowBookingPreview(false);
                setBookingSent(false);
                setMobileNumberError("");
              }}
              placeholder="07xxx xxxxxx"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
            />
            <p className="mt-1.5 text-xs text-white/40">
              So we can contact you about your booking.
            </p>
            {mobileNumberError && (
              <p className="mt-1.5 text-xs text-red-300">{mobileNumberError}</p>
            )}
          </div>
        )}

        {isAirportTrip && (
          <div>
            <label
              htmlFor="destination"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              {isFromAirport ? "Pickup Airport" : "Destination Airport"}
            </label>
            <select
              id="destination"
              name="destination"
              required
              value={airportCode}
              onChange={(e) => setAirportCode(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-navy-light px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
            >
              <option value="">Select airport</option>
              {AIRPORTS.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name} ({a.code}) — {a.distance}
                </option>
              ))}
            </select>
          </div>
        )}

        {!isAirportTrip && <input type="hidden" name="destination" value="" />}

        {isAirportTrip ? (
          isFromAirport ? (
            <>
              <AddressInput
                id="dropoff"
                name="dropoff"
                value={dropoffAddress}
                onChange={handleDropoffChange}
                airportCode={addressLookupCode}
                label="Your Drop-off Address"
                placeholder="e.g. Donegall Square, Belfast or 12 Donegall Square"
                helperText="Type your street name or full address — numbered addresses appear in the list for you to pick"
              />
              <input type="hidden" name="pickup" value={airportCode ? AIRPORTS.find((a) => a.code === airportCode)?.name ?? "" : ""} />
            </>
          ) : (
            <>
              <AddressInput
                id="pickup"
                name="pickup"
                value={pickupAddress}
                onChange={handlePickupChange}
                airportCode={addressLookupCode}
                label="Your Pickup Address"
                placeholder="e.g. Donegall Square, Belfast or 12 Donegall Square"
                helperText="Type your street name or full address — numbered addresses appear in the list for you to pick"
              />
              <input type="hidden" name="dropoff" value={airportCode ? AIRPORTS.find((a) => a.code === airportCode)?.name ?? "" : ""} />
            </>
          )
        ) : (
          <>
            <AddressInput
              id="pickup"
              name="pickup"
              value={pickupAddress}
              onChange={handlePickupChange}
              airportCode={addressLookupCode}
              label="Pickup Address"
              placeholder="e.g. 12 High Street, Bangor"
              helperText="Where should we collect you?"
            />
            <AddressInput
              id="dropoff"
              name="dropoff"
              value={dropoffAddress}
              onChange={handleDropoffChange}
              airportCode={addressLookupCode}
              label="Drop-off Address"
              placeholder="e.g. 45 Main Street, Lisburn"
              helperText="Where are you going?"
            />
          </>
        )}

        <TripMap
          tripMode={tripMode}
          originAddress={
            isAirportTrip
              ? isFromAirport
                ? (AIRPORTS.find((a) => a.code === airportCode)?.mapLabel ?? "")
                : pickupAddress
              : pickupAddress
          }
          destinationAddress={
            isAirportTrip
              ? isFromAirport
                ? dropoffAddress
                : (AIRPORTS.find((a) => a.code === airportCode)?.mapLabel ?? "")
              : dropoffAddress
          }
          airportCode={airportCode}
          tripDirection={tripDirection}
          returnJourney={returnJourney}
          onRouteInfo={handleRouteInfo}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="date"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              {returnJourney ? "Outbound Date" : "Date"}
            </label>
            <input
              id="date"
              name="date"
              type="date"
              required
              value={tripDate}
              onChange={(e) => setTripDate(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
            />
          </div>
          <div>
            <label
              htmlFor="time"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              {returnJourney ? "Outbound Time" : "Time"}
            </label>
            <input
              id="time"
              name="time"
              type="time"
              required
              value={tripTime}
              onChange={(e) => setTripTime(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
            />
          </div>
        </div>

        {returnJourney && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="returnDate"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
              >
                Return Date
              </label>
              <input
                id="returnDate"
                name="returnDate"
                type="date"
                required
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
              />
            </div>
            <div>
              <label
                htmlFor="returnTime"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
              >
                Return Time
              </label>
              <input
                id="returnTime"
                name="returnTime"
                type="time"
                required
                value={returnTime}
                onChange={(e) => setReturnTime(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
              />
            </div>
            {returnDateError && (
              <p className="sm:col-span-2 text-xs text-red-400">{returnDateError}</p>
            )}
          </div>
        )}

        {isAirportTrip && (
          <div>
            <label
              htmlFor="flightNumber"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              Flight Number
            </label>
            <input
              id="flightNumber"
              name="flightNumber"
              type="text"
              value={flightNumber}
              onChange={(e) => {
                setFlightNumber(e.target.value);
                if (e.target.value.trim()) {
                  setFlightNumberError("");
                }
              }}
              placeholder="e.g. BA1234"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm uppercase text-white placeholder:normal-case placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
            />
            <p className="mt-1.5 text-xs text-white/40">
              Required to book — used for flight monitoring and complimentary airport waiting time.
            </p>
            {flightNumberError && (
              <p className="mt-1.5 text-xs text-red-400">{flightNumberError}</p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="passengers"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              Passengers
            </label>
            <select
              id="passengers"
              name="passengers"
              required
              value={passengers}
              onChange={(e) => setPassengers(Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-navy-light px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
            >
              {Array.from({ length: 8 }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="suitcases"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              Suitcases (23kg each)
            </label>
            <select
              id="suitcases"
              name="suitcases"
              required
              value={suitcases}
              onChange={(e) => setSuitcases(Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-navy-light px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
            >
              {Array.from({ length: 9 }, (_, index) => index).map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="vehicle"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              Vehicle Type
            </label>
            <input type="hidden" name="vehicle" value={quoteVehicle} />
            <select
              id="vehicle"
              required
              value={quoteVehicle}
              onChange={(e) => setVehicle(e.target.value as VehicleType)}
              disabled={isVehicleAutoSelected}
              className="w-full rounded-xl border border-white/10 bg-navy-light px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            {passengers >= 8 ? (
              <p className="mt-1.5 text-xs text-white/40">
                Minibus selected automatically for 8 passengers.
              </p>
            ) : suitcases >= 5 ? (
              <p className="mt-1.5 text-xs text-white/40">
                Minibus selected automatically for 5 or more suitcases.
              </p>
            ) : suitcases === 4 ? (
              <p className="mt-1.5 text-xs text-white/40">
                Estate car selected automatically for 4 suitcases.
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-4">
          {liveQuote ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                {returnJourney ? "Estimated return price" : "Estimated price"}
              </p>
              <p className="mt-1 text-3xl font-bold text-white">{formatQuote(liveQuote.amount)}</p>
              <p className="mt-2 text-xs text-white/60">{quoteVehicle.split(" (")[0]}</p>
              {isAirportTrip && (
                <p className="mt-3 text-xs leading-relaxed text-white/60">
                  Includes express drop-off and pickup fees, and 60 minutes complimentary waiting
                  time from when your plane lands.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-white/50">
                Estimated price
              </p>
              <p className="mt-1 text-sm text-white/70">{quoteHint}</p>
            </>
          )}
          <p className="mt-3 text-[11px] text-white/40">
            Includes vehicle, driver, fuel, and tolls.
          </p>
        </div>

        {showBookingPreview && (
          <div className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-4 sm:px-5">
            <div className="mb-4">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                Review your booking
              </p>
              <p className="mt-1 text-sm text-white/60">
                Please check everything is correct before booking — wrong details can change your
                price.
              </p>
            </div>
            <dl>
              <PreviewRow label="Name" value={customerName.trim()} />
              {isMobileDevice !== true && customerEmail.trim() && (
                <PreviewRow label="Email" value={customerEmail.trim()} />
              )}
              {isMobileDevice !== true && customerMobile.trim() && (
                <PreviewRow label="Mobile" value={customerMobile.trim()} />
              )}
              <PreviewRow
                label="Trip"
                value={
                  isAirportTrip
                    ? isFromAirport
                      ? "Airport pickup"
                      : "Airport drop-off"
                    : "Address to address"
                }
              />
              {isAirportTrip && airportName && (
                <PreviewRow label="Airport" value={`${airportName} (${airportCode})`} />
              )}
              <PreviewRow label="Pickup" value={pickupLabel} />
              <PreviewRow label="Drop-off" value={dropoffLabel} />
              {routeSummary && (
                <>
                  <PreviewRow
                    label={returnJourney ? "Journey distance (return)" : "Journey distance"}
                    value={routeSummary.distanceLabel}
                  />
                  <PreviewRow
                    label={returnJourney ? "Estimated journey time (return)" : "Estimated journey time"}
                    value={routeSummary.durationLabel}
                  />
                </>
              )}
              <PreviewRow
                label={returnJourney ? "Outbound" : "Date & time"}
                value={`${formatDisplayDate(tripDate)} at ${formatDisplayTime(tripTime)}`}
              />
              {returnJourney && (
                <PreviewRow
                  label="Return"
                  value={`${formatDisplayDate(returnDate)} at ${formatDisplayTime(returnTime)}`}
                />
              )}
              {isAirportTrip && (
                <PreviewRow label="Flight number" value={flightNumber.trim().toUpperCase()} />
              )}
              <PreviewRow label="Passengers" value={String(passengers)} />
              <PreviewRow label="Suitcases" value={String(suitcases)} />
              <PreviewRow label="Vehicle" value={quoteVehicle} />
              {liveQuote && (
                <PreviewRow
                  label={returnJourney ? "Estimated return price" : "Estimated price"}
                  value={formatQuote(liveQuote.amount)}
                />
              )}
            </dl>
          </div>
        )}

        {submitError && (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {submitError}
          </p>
        )}

        {bookingSent && usesWhatsApp && (
          <p className="rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 px-4 py-3 text-sm text-white">
            Your booking message should open in WhatsApp. If it didn&apos;t, tap the green chat
            button at the bottom of the screen.
          </p>
        )}

        {bookingSent && usesEmail && (
          <p className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-white">
            Booking confirmed. We&apos;ll reply shortly with your payment link.
          </p>
        )}

        {showBookingPreview ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleEditBooking}
              className="w-full rounded-xl border border-white/15 bg-white/5 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/10"
            >
              Edit details
            </button>
            <button
              type="submit"
              disabled={submitted}
              className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitted ? submitInProgressLabel : confirmButtonLabel}
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={(isAirportTrip && liveQuote != null && !canBookAirport) || submitted}
            className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitted ? submitInProgressLabel : initialButtonLabel}
          </button>
        )}
      </form>
    </div>
  );
}

export default memo(QuoteCard);
