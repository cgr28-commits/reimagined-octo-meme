"use client";

import { FormEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { isLdyServiceAreaAddress } from "../../shared/ldy-service-area";
import {
  formatJourneyDistance,
  formatJourneyDuration,
  type TripRouteMetrics,
} from "@/lib/trip-route";
import { submitBookingByEmail, submitMobileWhatsAppBooking, openWhatsAppBookingMessage } from "@/lib/submit-booking";
import FlightNumberField, { formatVerifiedFlightSummary } from "@/components/FlightNumberField";
import { isValidFlightNumberFormat } from "@/lib/flight-lookup";
import type { VerifiedFlight } from "@/lib/flight-lookup";

type TripMode = "airport" | "address";
type TripDirection = "to-airport" | "from-airport";

const PICKUP_STORAGE_KEY = "my-airport-taxi-ni-pickup-address";
const DROPOFF_STORAGE_KEY = "my-airport-taxi-ni-dropoff-address";

const BOOKING_PANEL_CLASS =
  "rounded-xl border border-white/25 bg-navy-light px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-5 md:border-white/30 md:shadow-lg md:shadow-black/20";
const BOOKING_LABEL_CLASS =
  "mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/80";
const BOOKING_INPUT_CLASS =
  "w-full rounded-xl border border-white/25 bg-navy-dark px-4 py-3 text-sm text-white placeholder:text-white/45 outline-none transition-colors focus:border-emerald focus:ring-2 focus:ring-emerald/25 md:border-white/30";
const BOOKING_HELPER_CLASS = "mt-1.5 text-xs text-white/55";

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

function getPriceInclusionNote(
  isAirportTrip: boolean,
  isFromAirport: boolean,
  returnJourney: boolean,
): string {
  if (!isAirportTrip) {
    return "Includes 10 minutes complimentary waiting time at pickup.";
  }

  if (returnJourney) {
    if (isFromAirport) {
      return "Includes express drop-off and pickup fees, and 60 minutes complimentary waiting time from when your plane lands.";
    }
    return "Includes express drop-off and pickup fees. 60 minutes complimentary waiting time applies when we collect you from the airport.";
  }

  if (isFromAirport) {
    return "Includes express pickup fees and 60 minutes complimentary waiting time from when your plane lands.";
  }

  return "Includes express drop-off fees.";
}

function getFlightNumbersIntro(isFromAirport: boolean, returnJourney: boolean): string {
  const includesAirportCollection = isFromAirport || (returnJourney && !isFromAirport);

  if (includesAirportCollection) {
    return "For flight monitoring and complimentary airport waiting time when we collect you.";
  }

  return "For flight monitoring.";
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
  const cardRef = useRef<HTMLDivElement>(null);
  const isMobileDevice = useIsMobileDevice();
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [bookingSent, setBookingSent] = useState(false);
  const [bookingReference, setBookingReference] = useState("");
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
  const [showBookingDetailsStep, setShowBookingDetailsStep] = useState(false);
  const [customerNameError, setCustomerNameError] = useState("");
  const [goingFlightNumber, setGoingFlightNumber] = useState("");
  const [collectionFlightNumber, setCollectionFlightNumber] = useState("");
  const [goingFlightError, setGoingFlightError] = useState("");
  const [collectionFlightError, setCollectionFlightError] = useState("");
  const [verifiedGoingFlight, setVerifiedGoingFlight] = useState<VerifiedFlight | null>(null);
  const [verifiedCollectionFlight, setVerifiedCollectionFlight] = useState<VerifiedFlight | null>(
    null,
  );
  const [goingFlightConfigured, setGoingFlightConfigured] = useState(true);
  const [collectionFlightConfigured, setCollectionFlightConfigured] = useState(true);
  const [goingFlightStatus, setGoingFlightStatus] = useState<
    "idle" | "loading" | "verified" | "error" | "unavailable"
  >("idle");
  const [collectionFlightStatus, setCollectionFlightStatus] = useState<
    "idle" | "loading" | "verified" | "error" | "unavailable"
  >("idle");
  const [tripDate, setTripDate] = useState("");
  const [tripTime, setTripTime] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [vehicle, setVehicle] = useState<VehicleType>(VEHICLE_TYPES[0]);
  const [passengers, setPassengers] = useState(1);
  const [suitcases, setSuitcases] = useState(1);
  const [routeMetrics, setRouteMetrics] = useState<TripRouteMetrics | null>(null);

  const handleRouteMetrics = useCallback((metrics: TripRouteMetrics | null) => {
    setRouteMetrics(metrics);
  }, []);

  const autoVehicle = getAutoVehicle(passengers, suitcases);
  const quoteVehicle = autoVehicle ?? vehicle;
  const isVehicleAutoSelected = autoVehicle != null;

  const isAirportTrip = tripMode === "airport";
  const isFromAirport = tripDirection === "from-airport";
  const returnTripDirection: TripDirection = isFromAirport ? "to-airport" : "from-airport";
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

  const isLdyTrip = airportCode === "LDY";
  const ldyServiceAddress = isFromAirport ? dropoffAddress : pickupAddress;
  const ldyServiceAreaInvalid =
    isLdyTrip &&
    ldyServiceAddress.trim().length > 0 &&
    !isLdyServiceAreaAddress(ldyServiceAddress);

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
  const isAddressPairComplete = Boolean(pickupAddress.trim() && dropoffAddress.trim());

  const canShowPrice =
    isScheduleComplete &&
    !ldyServiceAreaInvalid &&
    (isAirportTrip ? isAirportAddressComplete : isAddressPairComplete);

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

    if (!routeMetrics) {
      return null;
    }

    return calculatePointToPointQuote(
      pickupAddress,
      dropoffAddress,
      quoteVehicle,
      returnJourney,
      schedule,
      routeMetrics,
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
    routeMetrics,
    tripDate,
    tripTime,
    quoteVehicle,
  ]);

  const journeyDistanceLabel = routeMetrics
    ? formatJourneyDistance(routeMetrics.distanceKm)
    : "";
  const journeyDurationLabel = routeMetrics
    ? formatJourneyDuration(routeMetrics.durationMinutes)
    : "";

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

  function validateFlightNumbers(): boolean {
    let ok = true;

    if (goingFlightStatus === "loading") {
      setGoingFlightError("Checking your going flight — please wait a moment.");
      ok = false;
    } else if (!goingFlightNumber.trim()) {
      setGoingFlightError("Please enter your flight number for going.");
      ok = false;
    } else if (!isValidFlightNumberFormat(goingFlightNumber)) {
      setGoingFlightError("Enter a valid flight number for going (e.g. BA1234).");
      ok = false;
    } else if (goingFlightConfigured && goingFlightStatus !== "verified") {
      setGoingFlightError("Please enter a valid going flight for your selected date and airport.");
      ok = false;
    } else {
      setGoingFlightError("");
    }

    if (returnJourney) {
      if (collectionFlightStatus === "loading") {
        setCollectionFlightError("Checking your collection flight — please wait a moment.");
        ok = false;
      } else if (!collectionFlightNumber.trim()) {
        setCollectionFlightError("Please enter your flight number for collection.");
        ok = false;
      } else if (!isValidFlightNumberFormat(collectionFlightNumber)) {
        setCollectionFlightError("Enter a valid flight number for collection (e.g. BA1234).");
        ok = false;
      } else if (collectionFlightConfigured && collectionFlightStatus !== "verified") {
        setCollectionFlightError(
          "Please enter a valid collection flight for your return date and airport.",
        );
        ok = false;
      } else {
        setCollectionFlightError("");
      }
    } else {
      setCollectionFlightError("");
    }

    return ok;
  }

  function validateTripForBooking(): boolean {
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

    if (ldyServiceAreaInvalid) {
      return false;
    }

    if (!canShowPrice || !liveQuote) {
      return false;
    }

    return true;
  }

  function validateContactDetails(): boolean {
    let ok = true;

    if (!customerName.trim()) {
      setCustomerNameError("Please enter your name.");
      ok = false;
    } else {
      setCustomerNameError("");
    }

    if (!customerMobile.trim()) {
      setMobileNumberError("Please enter your mobile number so we can send your payment link by text.");
      ok = false;
    } else if (!isValidMobileNumber(customerMobile)) {
      setMobileNumberError("Please enter a valid mobile number.");
      ok = false;
    } else {
      setMobileNumberError("");
    }

    if (!customerEmail.trim()) {
      setEmailAddressError("Please enter your email address so we can confirm your booking.");
      ok = false;
    } else if (!isValidEmailAddress(customerEmail)) {
      setEmailAddressError("Please enter a valid email address.");
      ok = false;
    } else {
      setEmailAddressError("");
    }

    return ok;
  }

  function buildBookingDetails(): BookingDetails {
    const tripLabel = isAirportTrip
      ? isFromAirport
        ? "Airport pickup"
        : "Airport drop-off"
      : "Address to address";

    const estimatedPrice = liveQuote ? formatQuote(liveQuote.amount) : null;

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
      flightNumber: goingFlightNumber.trim().toUpperCase(),
      returnFlightNumber: returnJourney
        ? collectionFlightNumber.trim().toUpperCase()
        : undefined,
      passengers,
      suitcases,
      vehicle: quoteVehicle,
      estimatedPrice,
      journeyDistance: journeyDistanceLabel || undefined,
      journeyDuration: journeyDurationLabel || undefined,
      isAirportTrip,
    };
  }

  async function confirmBooking() {
    const details = buildBookingDetails();
    const isMobile = isMobileDevice ?? detectMobileDevice();
    setSubmitted(true);
    setSubmitError("");
    setBookingReference("");

    let reference = "";
    try {
      reference = isMobile
        ? await submitMobileWhatsAppBooking(details)
        : await submitBookingByEmail(details);
      setBookingReference(reference);
    } catch (error) {
      console.error("Booking submission failed", error);
      if (!isMobile) {
        setSubmitError(
          `We couldn't confirm your booking automatically. Please email ${SITE.email} with your trip details and we'll confirm your booking.`,
        );
        setSubmitted(false);
        return;
      }
    }

    setShowBookingPreview(false);
    setBookingSent(true);
    setSubmitted(false);

    if (isMobile) {
      openWhatsAppBookingMessage(buildBookingMessage(details, reference));
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError("");
    setBookingSent(false);
    setBookingReference("");

    if (showBookingPreview) {
      void confirmBooking();
      return;
    }

    if (!validateTripForBooking()) {
      return;
    }

    if (showBookingDetailsStep) {
      if (!validateContactDetails()) {
        return;
      }
      if (isAirportTrip && !validateFlightNumbers()) {
        return;
      }
      setShowBookingDetailsStep(false);
      setShowBookingPreview(true);
      return;
    }

    setShowBookingDetailsStep(true);
  }

  function handleEditBooking() {
    setShowBookingPreview(false);
    setShowBookingDetailsStep(true);
    setSubmitError("");
    setBookingSent(false);
    setBookingReference("");
  }

  const usesWhatsApp = isMobileDevice === true;

  useEffect(() => {
    if (bookingSent) {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [bookingSent]);

  const submitInProgressLabel = "Sending booking…";

  const confirmButtonLabel =
    liveQuote
      ? `Confirm & book for ${formatQuote(liveQuote.amount)}`
      : usesWhatsApp
        ? "Confirm & send via WhatsApp"
        : "Confirm & book";

  const bookButtonLabel = liveQuote ? `Book for ${formatQuote(liveQuote.amount)}` : "Book";

  const quoteHint = isAirportTrip
    ? !airportCode
      ? "Select an airport to see your estimated price"
      : ldyServiceAreaInvalid
        ? isFromAirport
          ? "We transfer from Derry Airport to the greater Belfast area — enter a Belfast-area drop-off address"
          : "Pickups for Derry Airport must be in the greater Belfast area — enter a Belfast-area pickup address"
      : !isScheduleComplete
        ? returnJourney && tripDate && tripTime && (!returnDate || !returnTime)
          ? "Select your return date and time to see your estimated price"
          : "Select your date and time to see your estimated price"
        : !isAirportAddressComplete
          ? `Enter your ${isFromAirport ? "drop-off" : "pickup"} address to see your estimated price`
          : ""
    : !isScheduleComplete
      ? "Select your date and time to see your estimated price"
      : !isAddressPairComplete
        ? "Enter pickup and drop-off addresses to see your estimated price"
        : !routeMetrics
          ? "Calculating your route and price…"
          : "";

  if (bookingSent) {
    return (
      <div
        ref={cardRef}
        className="glass-card min-w-0 rounded-2xl p-6 sm:p-8 lg:animate-float"
      >
        <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-5 py-8 text-center sm:px-8 sm:py-10">
          <p className="text-xs font-medium uppercase tracking-wider text-emerald">
            Booking submitted
          </p>
          <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Thank you</h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/80 sm:text-base">
            A payment link will be sent shortly to confirm your booking. Your booking is not
            confirmed until full payment is made.
          </p>
          {bookingReference && (
            <p className="mt-4 text-sm text-white/60">Reference: {bookingReference}</p>
          )}
          {usesWhatsApp && (
            <p className="mx-auto mt-4 max-w-md text-sm text-white/60">
              Your booking message should open in WhatsApp. If it didn&apos;t, tap the green chat
              button at the bottom of the screen.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={cardRef} className="glass-card min-w-0 rounded-2xl p-6 sm:p-8 lg:animate-float">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white sm:text-2xl">Get a Live Quote</h2>
        <p className="mt-1 text-sm text-white/60">
          Enter your trip details to see your price instantly — we&apos;ll ask for your contact
          details and flight numbers when you book.
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
            {isLdyTrip ? (
              <>
                <div className="mb-2 rounded-xl border border-emerald/20 bg-emerald/10 px-4 py-3 text-sm text-white/80">
                  Transfers between City of Derry Airport and the greater Belfast area — not
                  Belfast City Airport (BHD).
                </div>
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
                    To Derry Airport
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
                    From Derry Airport
                  </button>
                </div>
              </>
            ) : (
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
            )}
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

        {isAirportTrip && (
          <div>
            <label
              htmlFor="destination"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              {isFromAirport ? "Pickup Airport" : "Destination Airport"}
            </label>
            {isLdyTrip && (
              <p className="mb-2 text-xs text-white/45">
                {isFromAirport
                  ? "Drop-off must be in the greater Belfast area"
                  : "Pickup must be in the greater Belfast area (e.g. Bangor, Belfast, Lisburn)"}
              </p>
            )}
            <select
              id="destination"
              name="destination"
              required
              value={airportCode}
              onChange={(e) => {
                setAirportCode(e.target.value);
              }}
              className="w-full rounded-xl border border-white/10 bg-navy-light px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
            >
              <option value="">Select airport</option>
              {AIRPORTS.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name} ({a.code}) — {a.distance}
                  {a.code === "LDY" ? " · not Belfast City (BHD)" : ""}
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
                label={
                  isLdyTrip
                    ? isFromAirport
                      ? "Your Belfast-area Drop-off Address"
                      : "Your Belfast-area Pickup Address"
                    : "Your Drop-off Address"
                }
                placeholder={
                  isLdyTrip
                    ? "e.g. Main Street, Bangor or Donegall Square, Belfast"
                    : "e.g. Donegall Square, Belfast or 12 Donegall Square"
                }
                helperText={
                  isLdyTrip
                    ? "Bangor, Belfast, Lisburn, Newtownabbey, and surrounding towns only"
                    : "Type a street name, business name, or full address — pick from the list"
                }
              />
              {ldyServiceAreaInvalid && isFromAirport && (
                <p className="text-xs text-red-300">
                  This address is outside our LDY service area. We transfer between Derry Airport
                  and the greater Belfast area only.
                </p>
              )}
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
                label={isLdyTrip ? "Your Belfast-area Pickup Address" : "Your Pickup Address"}
                placeholder={
                  isLdyTrip
                    ? "e.g. Main Street, Bangor or Donegall Square, Belfast"
                    : "e.g. Donegall Square, Belfast or 12 Donegall Square"
                }
                helperText={
                  isLdyTrip
                    ? "Bangor, Belfast, Lisburn, Newtownabbey, and surrounding towns only"
                    : "Type a street name, business name, or full address — pick from the list"
                }
              />
              {ldyServiceAreaInvalid && !isFromAirport && (
                <p className="text-xs text-red-300">
                  This address is outside our LDY service area. Pickups for Derry Airport must be
                  in the greater Belfast area.
                </p>
              )}
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
          onRouteMetrics={handleRouteMetrics}
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

        {showBookingDetailsStep && !showBookingPreview && (
          <div className={BOOKING_PANEL_CLASS}>
            <p className="text-xs font-medium uppercase tracking-wider text-emerald">
              Your details
            </p>
            <p className="mt-1 mb-4 text-sm text-white/75">
              We need these details to confirm your booking and send your payment link.
            </p>
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className={BOOKING_LABEL_CLASS}>
                  Your Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (e.target.value.trim()) {
                      setCustomerNameError("");
                    }
                  }}
                  placeholder="John Smith"
                  className={BOOKING_INPUT_CLASS}
                />
                {customerNameError && (
                  <p className="mt-1.5 text-xs text-red-300">{customerNameError}</p>
                )}
              </div>

              <div>
                <label htmlFor="mobile" className={BOOKING_LABEL_CLASS}>
                  Mobile Number
                </label>
                <input
                  id="mobile"
                  name="mobile"
                  type="tel"
                  autoComplete="tel"
                  value={customerMobile}
                  onChange={(e) => {
                    setCustomerMobile(e.target.value);
                    if (e.target.value.trim()) {
                      setMobileNumberError("");
                    }
                  }}
                  placeholder="07xxx xxxxxx"
                  className={BOOKING_INPUT_CLASS}
                />
                <p className={BOOKING_HELPER_CLASS}>
                  We&apos;ll send your payment link here by text or WhatsApp.
                </p>
                {mobileNumberError && (
                  <p className="mt-1.5 text-xs text-red-300">{mobileNumberError}</p>
                )}
              </div>

              <div>
                <label htmlFor="email" className={BOOKING_LABEL_CLASS}>
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={customerEmail}
                  onChange={(e) => {
                    setCustomerEmail(e.target.value);
                    if (e.target.value.trim()) {
                      setEmailAddressError("");
                    }
                  }}
                  placeholder="you@example.com"
                  className={BOOKING_INPUT_CLASS}
                />
                <p className={BOOKING_HELPER_CLASS}>
                  So we can email your booking confirmation.
                </p>
                {emailAddressError && (
                  <p className="mt-1.5 text-xs text-red-300">{emailAddressError}</p>
                )}
              </div>

              {isAirportTrip && (
                <>
                  <div className="border-t border-white/20 pt-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                      Flight numbers
                    </p>
                    <p className="mt-1 mb-4 text-sm text-white/60">
                      {getFlightNumbersIntro(isFromAirport, returnJourney)}
                    </p>
                  </div>
                  <FlightNumberField
                    id="goingFlightNumber"
                    label="Flight number for going"
                    helperText={
                      isFromAirport
                        ? "The flight you are arriving on"
                        : "The flight you are departing on"
                    }
                    value={goingFlightNumber}
                    onChange={(value) => {
                      setGoingFlightNumber(value);
                      if (value.trim()) {
                        setGoingFlightError("");
                      }
                    }}
                    tripDate={tripDate}
                    airportCode={airportCode}
                    direction={tripDirection}
                    enabled={showBookingDetailsStep}
                    error={goingFlightError}
                    onStatusChange={setGoingFlightStatus}
                    onVerifiedChange={(flight, configured) => {
                      setVerifiedGoingFlight(flight);
                      setGoingFlightConfigured(configured);
                    }}
                  />
                  {returnJourney && (
                    <FlightNumberField
                      id="collectionFlightNumber"
                      label="Flight number for collection"
                      helperText={
                        returnTripDirection === "from-airport"
                          ? "The flight you are returning on — we collect you after it lands"
                          : "The flight you are returning on — we take you to the airport"
                      }
                      value={collectionFlightNumber}
                      onChange={(value) => {
                        setCollectionFlightNumber(value);
                        if (value.trim()) {
                          setCollectionFlightError("");
                        }
                      }}
                      tripDate={returnDate}
                      airportCode={airportCode}
                      direction={returnTripDirection}
                      enabled={showBookingDetailsStep}
                      error={collectionFlightError}
                      onStatusChange={setCollectionFlightStatus}
                      onVerifiedChange={(flight, configured) => {
                        setVerifiedCollectionFlight(flight);
                        setCollectionFlightConfigured(configured);
                      }}
                    />
                  )}
                </>
              )}
            </div>
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
              {journeyDistanceLabel && journeyDurationLabel && (
                <p className="mt-2 text-xs text-white/60">
                  Approx. {journeyDistanceLabel} · {journeyDurationLabel}
                </p>
              )}
              <p className="mt-3 text-xs leading-relaxed text-white/60">
                {getPriceInclusionNote(isAirportTrip, isFromAirport, returnJourney)}
              </p>
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
          <div className={BOOKING_PANEL_CLASS}>
            <div className="mb-4">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                Review your booking
              </p>
              <p className="mt-1 text-sm text-white/75">
                Please check everything is correct before booking — wrong details can change your
                price.
              </p>
            </div>
            <dl>
              <PreviewRow label="Name" value={customerName.trim()} />
              <PreviewRow label="Mobile" value={customerMobile.trim()} />
              <PreviewRow label="Email" value={customerEmail.trim()} />
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
              {journeyDistanceLabel && journeyDurationLabel && (
                <PreviewRow
                  label="Journey"
                  value={`${journeyDistanceLabel} · ${journeyDurationLabel}`}
                />
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
                <PreviewRow
                  label="Flight for going"
                  value={
                    verifiedGoingFlight
                      ? formatVerifiedFlightSummary(verifiedGoingFlight)
                      : goingFlightNumber.trim().toUpperCase()
                  }
                />
              )}
              {isAirportTrip && returnJourney && (
                <PreviewRow
                  label="Flight for collection"
                  value={
                    verifiedCollectionFlight
                      ? formatVerifiedFlightSummary(verifiedCollectionFlight)
                      : collectionFlightNumber.trim().toUpperCase()
                  }
                />
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
              {journeyDistanceLabel && journeyDurationLabel && (
                <PreviewRow
                  label="Journey"
                  value={`${journeyDistanceLabel} · ${journeyDurationLabel}`}
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
        ) : showBookingDetailsStep ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setShowBookingDetailsStep(false);
                setCustomerNameError("");
                setMobileNumberError("");
                setEmailAddressError("");
                setGoingFlightError("");
                setCollectionFlightError("");
              }}
              className="w-full rounded-xl border border-white/15 bg-white/5 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/10"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={submitted}
              className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitted ? submitInProgressLabel : "Continue to review"}
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={submitted || !liveQuote}
            className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitted ? submitInProgressLabel : bookButtonLabel}
          </button>
        )}
      </form>
    </div>
  );
}

export default memo(QuoteCard);
