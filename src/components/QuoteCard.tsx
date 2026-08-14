"use client";

import { FormEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddressInput from "@/components/AddressInput";
import BookingTermsConsent from "@/components/BookingTermsConsent";
import MarketingOptIn from "@/components/MarketingOptIn";
import TripMap from "@/components/TripMap";
import { buildBookingMessage, isValidEmailAddress, isValidMobileNumber, type BookingDetails } from "@/lib/booking-message";
import { buildMarketingOptInFields, recordMarketingOptIn } from "@/lib/marketing-api";
import { TERMS_LAST_UPDATED } from "@/lib/terms";
import { detectMobileDevice, useIsMobileDevice } from "@/lib/device";
import {
  AIRPORTS,
  isInstantPayVehicle,
  isVehicleEnquiryOnly,
  isVehicleRequestQuote,
  MAX_ONLINE_PASSENGERS,
  MINIBUS_PARTNER_NOTE,
  MINIBUS_VEHICLE_TYPE,
  VEHICLE_BOOKING_GUIDANCE,
  needsLuggageCapacityConfirmation,
  SERVICE_FLAGS,
  showsOnlineGuidePrice,
  SITE,
  VEHICLE_TYPES,
} from "@/lib/data";
import { parseLondonLocalDateTime } from "@/lib/london-time";
import { formatUkDate, formatUkTime, todayLondonDate, nowLondonTime } from "@/lib/format-datetime";

import {
  readPrefillAirport,
  readPrefillQuoteDraft,
  type QuoteDraftPrefill,
} from "@/lib/quote-prefill";
import { readTestBookingPrefill } from "@/lib/test-booking";
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
import {
  openWhatsAppBookingMessage,
  submitBookingByEmail,
  submitEnquiryByEmail,
  submitMobileWhatsAppBooking,
  submitMobileWhatsAppEnquiry,
} from "@/lib/submit-booking";
import { buildEnquiryBookingMessage } from "@/lib/booking-message";
import {
  buildPaymentRedirectUrl,
  createPaymentCheckout,
  isSumUpPaymentEnabled,
} from "@/lib/create-payment";
import {
  createPaymentReturnToken,
  savePendingPayment,
} from "@/lib/pending-payment";
import { scheduleQuoteLeadAlert } from "@/lib/submit-quote-lead";
import FlightNumberField, { formatVerifiedFlightSummary } from "@/components/FlightNumberField";
import GoogleAdsRequestQuote from "@/components/GoogleAdsRequestQuote";
import { resetRequestQuoteConversion } from "@/lib/google-ads-client";
import type { VerifiedFlight } from "@/lib/flight-lookup";
import {
  detectAirportCodeFromPlace,
  detectJourneyKind,
  emptySelectedPlace,
  isOutOfAreaPickup,
  isPlaceSelected,
  isRepublicOfIrelandJourney,
  journeyKindLabel,
  needsManualQuoteApproval,
  PLACES_LOOKUP_A2A,
  placesEqual,
  quickSelectToPlace,
  QUICK_SELECT_AIRPORTS,
  type JourneyKind,
  type QuickSelectAirportCode,
  type SelectedPlace,
} from "@/lib/selected-place";
import { parseAmountValue } from "@/lib/finalize-paid-booking";

const IS_A2A_PRIMARY = SERVICE_FLAGS.addressToAddress;

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
const MINIBUS = MINIBUS_VEHICLE_TYPE;

type VehicleType = (typeof VEHICLE_TYPES)[number];

function getAutoVehicle(passengers: number, suitcases: number, _a2aPrimary = false): VehicleType | null {
  void _a2aPrimary;
  // 5+ passengers → partner minibus (request a quote / subject to availability).
  if (passengers > 4 || suitcases >= 5) {
    return MINIBUS;
  }
  if (suitcases >= 3) {
    return ESTATE;
  }
  return null;
}

function formatDisplayDate(date: string): string {
  return formatUkDate(date);
}

function formatDisplayTime(time: string): string {
  return formatUkTime(time);
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
  return parseLondonLocalDateTime(date, time) ?? new Date(0);
}

function isReturnAfterOutbound(
  outboundDate: string,
  outboundTime: string,
  returnDate: string,
  returnTime: string,
): boolean {
  return parseDateTime(returnDate, returnTime) > parseDateTime(outboundDate, outboundTime);
}

/** YYYY-MM-DD for date inputs, using Europe/London (site operates in Northern Ireland). */
function todayDateInputValue(): string {
  return todayLondonDate();
}

/** HH:mm in Europe/London for time inputs. */
function nowTimeInputValue(): string {
  return nowLondonTime();
}

function isTripDateOnOrAfterToday(tripDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) {
    return false;
  }
  return tripDate >= todayDateInputValue();
}

/** Reject pickup times that have already passed in Europe/London when the date is today. */
function isTripDateTimeNotInPast(tripDate: string, tripTime: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate) || !/^\d{2}:\d{2}/.test(tripTime)) {
    return false;
  }
  const today = todayDateInputValue();
  if (tripDate > today) {
    return true;
  }
  if (tripDate < today) {
    return false;
  }
  return tripTime.slice(0, 5) >= nowTimeInputValue();
}

type BookingDelivery = "whatsapp" | "email";

type QuoteCardProps = {
  /** Preselect airport on dedicated landing pages. */
  initialAirportCode?: string;
  initialDirection?: TripDirection;
  /** Optional address hint (town/area) for route pages. */
  initialAddressHint?: string;
};

function QuoteCard({
  initialAirportCode = "",
  initialDirection = "to-airport",
  initialAddressHint = "",
}: QuoteCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const isMobileDevice = useIsMobileDevice();
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [bookingSent, setBookingSent] = useState(false);
  const [bookingReference, setBookingReference] = useState("");
  const [bookingDelivery, setBookingDelivery] = useState<BookingDelivery | null>(null);
  const [quoteStep, setQuoteStep] = useState<1 | 2 | 3>(1);
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [mobileNumberError, setMobileNumberError] = useState("");
  const [emailAddressError, setEmailAddressError] = useState("");
  const [tripMode, setTripMode] = useState<TripMode>(IS_A2A_PRIMARY ? "address" : "airport");
  const [tripDirection, setTripDirection] = useState<TripDirection>(initialDirection);
  const [airportCode, setAirportCode] = useState(initialAirportCode);
  const [pickupAddress, setPickupAddress] = useState(
    initialDirection === "to-airport" ? initialAddressHint : "",
  );
  const [dropoffAddress, setDropoffAddress] = useState(
    initialDirection === "from-airport" ? initialAddressHint : "",
  );
  const [pickupPlace, setPickupPlace] = useState<SelectedPlace>(emptySelectedPlace());
  const [dropoffPlace, setDropoffPlace] = useState<SelectedPlace>(emptySelectedPlace());
  const [pickupPlaceError, setPickupPlaceError] = useState("");
  const [dropoffPlaceError, setDropoffPlaceError] = useState("");
  const [returnJourney, setReturnJourney] = useState(false);
  const [tripDateError, setTripDateError] = useState("");
  const [returnDateError, setReturnDateError] = useState("");
  const [customerNameError, setCustomerNameError] = useState("");
  const [goingFlightNumber, setGoingFlightNumber] = useState("");
  const [collectionFlightNumber, setCollectionFlightNumber] = useState("");
  const [goingFlightError, setGoingFlightError] = useState("");
  const [collectionFlightError, setCollectionFlightError] = useState("");
  const [verifiedGoingFlight, setVerifiedGoingFlight] = useState<VerifiedFlight | null>(null);
  const [verifiedCollectionFlight, setVerifiedCollectionFlight] = useState<VerifiedFlight | null>(
    null,
  );
  const [tripDate, setTripDate] = useState("");
  const [tripTime, setTripTime] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const tripDateInputRef = useRef<HTMLInputElement>(null);
  const tripTimeInputRef = useRef<HTMLInputElement>(null);
  const returnDateInputRef = useRef<HTMLInputElement>(null);
  const returnTimeInputRef = useRef<HTMLInputElement>(null);
  const minTripDate = todayDateInputValue();
  const minReturnDate = tripDate && tripDate >= minTripDate ? tripDate : minTripDate;
  const minTripTime = tripDate === minTripDate ? nowTimeInputValue() : undefined;
  const minReturnTime =
    returnDate && tripDate && returnDate === tripDate && tripTime
      ? tripTime.slice(0, 5)
      : returnDate === minTripDate
        ? nowTimeInputValue()
        : undefined;
  const [vehicle, setVehicle] = useState<VehicleType>(VEHICLE_TYPES[0]);
  const [passengers, setPassengers] = useState(1);
  const [suitcases, setSuitcases] = useState(1);
  const [routeMetrics, setRouteMetrics] = useState<TripRouteMetrics | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [testChargeAmount, setTestChargeAmount] = useState<number | null>(null);
  const [testBookingLabel, setTestBookingLabel] = useState<string | null>(null);
  const handleRouteMetrics = useCallback((metrics: TripRouteMetrics | null) => {
    setRouteMetrics(metrics);
  }, []);

  const autoVehicle = getAutoVehicle(passengers, suitcases, IS_A2A_PRIMARY);
  const quoteVehicle = autoVehicle ?? vehicle;
  const isEnquiryOnly = isVehicleEnquiryOnly(quoteVehicle);
  const isRequestQuote = isVehicleRequestQuote(quoteVehicle);
  const showGuidePrice = showsOnlineGuidePrice(quoteVehicle);
  const capacityNeedsConfirm = needsLuggageCapacityConfirmation(passengers, suitcases);
  const isVehicleAutoSelected = autoVehicle != null;
  const [capacityConfirmed, setCapacityConfirmed] = useState(false);
  const [capacityError, setCapacityError] = useState("");

  const isA2AFlow = IS_A2A_PRIMARY;
  const isAirportTrip = !isA2AFlow && tripMode === "airport";
  const journeyKind: JourneyKind | null = useMemo(() => {
    if (!isA2AFlow) {
      return null;
    }
    return detectJourneyKind(pickupPlace, dropoffPlace);
  }, [isA2AFlow, pickupPlace, dropoffPlace]);
  const pickupAirportCode = isA2AFlow ? detectAirportCodeFromPlace(pickupPlace) : null;
  const dropoffAirportCode = isA2AFlow ? detectAirportCodeFromPlace(dropoffPlace) : null;
  const isRoiJourney =
    isA2AFlow &&
    isPlaceSelected(pickupPlace) &&
    isPlaceSelected(dropoffPlace) &&
    isRepublicOfIrelandJourney(pickupPlace, dropoffPlace);
  const isOutOfAreaPickupJourney =
    isA2AFlow && isPlaceSelected(pickupPlace) && isOutOfAreaPickup(pickupPlace);
  const isManualQuoteJourney =
    isA2AFlow &&
    isPlaceSelected(pickupPlace) &&
    isPlaceSelected(dropoffPlace) &&
    needsManualQuoteApproval(pickupPlace, dropoffPlace);
  const showsRequestQuoteFlow = isRequestQuote || isManualQuoteJourney;
  const effectiveAirportCode = isA2AFlow
    ? pickupAirportCode || dropoffAirportCode || ""
    : airportCode;
  const isFromAirport = isA2AFlow
    ? Boolean(pickupAirportCode)
    : tripDirection === "from-airport";
  const returnTripDirection: TripDirection = isFromAirport ? "to-airport" : "from-airport";
  const addressLookupCode = isA2AFlow
    ? PLACES_LOOKUP_A2A
    : isAirportTrip
      ? airportCode
      : "BFS";

  useEffect(() => {
    if (passengers > MAX_ONLINE_PASSENGERS) {
      setPassengers(MAX_ONLINE_PASSENGERS);
    }
  }, [isA2AFlow, passengers]);

  useEffect(() => {
    // Legacy: soft-hide address-to-address when flag is off.
    if (!SERVICE_FLAGS.addressToAddress && tripMode !== "airport") {
      setTripMode("airport");
    }
  }, [tripMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") !== "return") {
      return;
    }

    // Paid checkout lands on the dedicated thank-you URL for Google Ads.
    const confirmedUrl = new URL("/booking-confirmed/", window.location.origin);
    params.forEach((value, key) => {
      confirmedUrl.searchParams.set(key, value);
    });
    window.location.replace(confirmedUrl.toString());
  }, []);

  useEffect(() => {
    const testBooking = readTestBookingPrefill();
    if (testBooking) {
      setTestChargeAmount(testBooking.chargeAmount);
      setTestBookingLabel(testBooking.routeLabel);
      setTripMode(testBooking.tripMode);
      setTripDirection(testBooking.tripDirection);
      setAirportCode(testBooking.airportCode);
      setPickupAddress(testBooking.pickupAddress);
      setTripDate(testBooking.tripDate);
      setTripTime(testBooking.tripTime);
      setPassengers(testBooking.passengers);
      setSuitcases(testBooking.suitcases);
      setVehicle(testBooking.vehicle);
      setGoingFlightNumber(testBooking.flightNumber);
      return;
    }

    const savedPickup = localStorage.getItem(PICKUP_STORAGE_KEY);
    const savedDropoff = localStorage.getItem(DROPOFF_STORAGE_KEY);
    // Keep dedicated landing-page address hints (e.g. Bangor) over stale localStorage.
    const keepInitialPickup = initialDirection === "to-airport" && Boolean(initialAddressHint);
    const keepInitialDropoff = initialDirection === "from-airport" && Boolean(initialAddressHint);
    if (savedPickup && !keepInitialPickup) {
      setPickupAddress(savedPickup);
    }
    if (savedDropoff && !keepInitialDropoff) {
      setDropoffAddress(savedDropoff);
    }
  }, [initialAddressHint, initialDirection]);

  const isLdyTrip = effectiveAirportCode === "LDY";
  const ldyServiceAddress = isFromAirport ? dropoffAddress : pickupAddress;
  const ldyServiceAreaInvalid =
    isLdyTrip &&
    ldyServiceAddress.trim().length > 0 &&
    !isLdyServiceAreaAddress(ldyServiceAddress);

  useEffect(() => {
    function applyAirportPrefill(code: string) {
      if (!AIRPORTS.some((airport) => airport.code === code)) {
        return;
      }
      if (IS_A2A_PRIMARY) {
        const place = quickSelectToPlace(code as QuickSelectAirportCode);
        if (place) {
          if (initialDirection === "from-airport") {
            handlePickupPlaceSelect(place);
          } else {
            handleDropoffPlaceSelect(place);
          }
        }
        return;
      }
      setTripMode("airport");
      setAirportCode(code);
      setTripDirection("to-airport");
    }

    function applyDraftPrefill(draft: QuoteDraftPrefill) {
      setTripMode("airport");
      if (draft.direction === "from-airport" || draft.direction === "to-airport") {
        setTripDirection(draft.direction);
      }
      if (draft.airportCode && AIRPORTS.some((airport) => airport.code === draft.airportCode)) {
        setAirportCode(draft.airportCode);
      }
      if (draft.address?.trim()) {
        if (draft.direction === "from-airport") {
          setDropoffAddress(draft.address.trim());
        } else {
          setPickupAddress(draft.address.trim());
        }
      }
      if (typeof draft.returnJourney === "boolean") {
        setReturnJourney(draft.returnJourney);
      }
      if (draft.tripDate) setTripDate(draft.tripDate);
      if (draft.tripTime) setTripTime(draft.tripTime);
      if (draft.returnDate) setReturnDate(draft.returnDate);
      if (draft.returnTime) setReturnTime(draft.returnTime);
      if (typeof draft.passengers === "number" && draft.passengers > 0) {
        setPassengers(draft.passengers);
      }
      if (typeof draft.suitcases === "number" && draft.suitcases >= 0) {
        setSuitcases(draft.suitcases);
      }
      if (
        draft.vehicle &&
        (VEHICLE_TYPES as readonly string[]).includes(draft.vehicle)
      ) {
        setVehicle(draft.vehicle as VehicleType);
      }
      setBookingSent(false);
      setQuoteStep(1);
    }

    if (window.location.hash === "#quote") {
      const params = new URLSearchParams(window.location.search);
      const airportFromQuery = params.get("airport")?.trim().toUpperCase();
      if (airportFromQuery) {
        applyAirportPrefill(airportFromQuery);
      }
    }

    const draftPrefill = readPrefillQuoteDraft();
    if (draftPrefill) {
      applyDraftPrefill(draftPrefill);
    } else {
      const stored = readPrefillAirport();
      if (stored) {
        applyAirportPrefill(stored);
      }
    }

    function handlePrefill(event: Event) {
      const code = (event as CustomEvent<string>).detail;
      if (code) {
        applyAirportPrefill(code);
      }
    }

    function handleDraftPrefill(event: Event) {
      const draft = (event as CustomEvent<QuoteDraftPrefill>).detail;
      if (draft) {
        applyDraftPrefill(draft);
      }
    }

    window.addEventListener("quote-prefill-airport", handlePrefill);
    window.addEventListener("quote-prefill-draft", handleDraftPrefill);
    return () => {
      window.removeEventListener("quote-prefill-airport", handlePrefill);
      window.removeEventListener("quote-prefill-draft", handleDraftPrefill);
    };
  }, []);

  const isScheduleComplete =
    Boolean(tripDate && tripTime) &&
    isTripDateOnOrAfterToday(tripDate) &&
    isTripDateTimeNotInPast(tripDate, tripTime) &&
    (!returnJourney ||
      (Boolean(returnDate && returnTime) &&
        isReturnAfterOutbound(tripDate, tripTime, returnDate, returnTime)));

  const hasCompatibleVehicle = Boolean(quoteVehicle) && passengers >= 1 && suitcases >= 0;

  const travelDetailsBlocker = !tripDate
    ? "Select your pickup date to continue."
    : !isTripDateOnOrAfterToday(tripDate)
      ? "Pickup date cannot be in the past."
      : !tripTime
        ? "Select your pickup time to continue."
        : !isTripDateTimeNotInPast(tripDate, tripTime)
          ? "Pickup time cannot be in the past. Choose a later time."
          : returnJourney && (!returnDate || !returnTime)
            ? "Select your return date and time to continue."
            : returnJourney &&
                returnDate &&
                returnTime &&
                !isReturnAfterOutbound(tripDate, tripTime, returnDate, returnTime)
              ? "Return date and time must be after your outbound trip."
              : !hasCompatibleVehicle
                ? "Select passengers, luggage, and a compatible vehicle to continue."
                : "";

  const quoteAddress = isA2AFlow
    ? isFromAirport
      ? dropoffAddress
      : pickupAirportCode
        ? dropoffAddress
        : dropoffAirportCode
          ? pickupAddress
          : pickupAddress
    : isFromAirport
      ? dropoffAddress
      : pickupAddress;
  const isAirportAddressComplete = Boolean(effectiveAirportCode && quoteAddress.trim());
  const isAddressPairComplete = isA2AFlow
    ? isPlaceSelected(pickupPlace) &&
      isPlaceSelected(dropoffPlace) &&
      !placesEqual(pickupPlace, dropoffPlace)
    : Boolean(pickupAddress.trim() && dropoffAddress.trim());
  const hasQuoteRoute =
    !ldyServiceAreaInvalid &&
    (isA2AFlow
      ? isAddressPairComplete
      : isAirportTrip
        ? isAirportAddressComplete
        : isAddressPairComplete);

  // Quick quote: show price once the route is known. Date/time are asked when booking.
  const canShowPrice = hasQuoteRoute;

  const tripDetailsReady = hasQuoteRoute && isScheduleComplete;

  function syncScheduleFieldsFromInputs() {
    const nextDate = tripDateInputRef.current?.value?.trim() || "";
    const nextTime = tripTimeInputRef.current?.value?.trim() || "";
    const nextReturnDate = returnDateInputRef.current?.value?.trim() || "";
    const nextReturnTime = returnTimeInputRef.current?.value?.trim() || "";
    if (nextDate && nextDate !== tripDate) {
      setTripDate(nextDate);
    }
    if (nextTime && nextTime !== tripTime) {
      setTripTime(nextTime);
    }
    if (returnJourney && nextReturnDate && nextReturnDate !== returnDate) {
      setReturnDate(nextReturnDate);
    }
    if (returnJourney && nextReturnTime && nextReturnTime !== returnTime) {
      setReturnTime(nextReturnTime);
    }
    return {
      tripDate: nextDate || tripDate,
      tripTime: nextTime || tripTime,
      returnDate: nextReturnDate || returnDate,
      returnTime: nextReturnTime || returnTime,
    };
  }

  useEffect(() => {
    if (!capacityNeedsConfirm) {
      setCapacityConfirmed(false);
      setCapacityError("");
    }
  }, [capacityNeedsConfirm]);

  const liveQuote = useMemo(() => {
    if (!canShowPrice || isManualQuoteJourney) {
      return null;
    }
    // Executive: no online price. Request-quote vehicles (if any) may show a guide price.
    if (isEnquiryOnly && !showGuidePrice) {
      return null;
    }

    const schedule = {
      outboundDate: tripDate,
      outboundTime: tripTime,
      returnDate,
      returnTime,
      returnJourney,
    };

    if (isA2AFlow && journeyKind) {
      if (journeyKind === "address-to-airport" && dropoffAirportCode) {
        return calculateQuote(
          pickupAddress,
          dropoffAirportCode,
          quoteVehicle,
          returnJourney,
          schedule,
        );
      }
      if (journeyKind === "airport-to-address" && pickupAirportCode) {
        return calculateQuote(
          dropoffAddress,
          pickupAirportCode,
          quoteVehicle,
          returnJourney,
          schedule,
        );
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
    }

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
    dropoffAirportCode,
    isA2AFlow,
    isAirportTrip,
    isEnquiryOnly,
    isManualQuoteJourney,
    journeyKind,
    pickupAddress,
    pickupAirportCode,
    showGuidePrice,
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

  /** Pay online at quote time — saloon/estate only, SumUp enabled. */
  const canPayNowOnline =
    SERVICE_FLAGS.customerSumUpPay &&
    isSumUpPaymentEnabled() &&
    !isEnquiryOnly &&
    !isManualQuoteJourney &&
    isInstantPayVehicle(quoteVehicle) &&
    Boolean(liveQuote);

  function handlePickupChange(value: string) {
    setPickupAddress(value);
    if (isA2AFlow) {
      setPickupPlace(emptySelectedPlace());
      setPickupPlaceError("");
    }
    if (value.trim()) {
      localStorage.setItem(PICKUP_STORAGE_KEY, value.trim());
    }
  }

  function handleDropoffChange(value: string) {
    setDropoffAddress(value);
    if (isA2AFlow) {
      setDropoffPlace(emptySelectedPlace());
      setDropoffPlaceError("");
    }
    if (value.trim()) {
      localStorage.setItem(DROPOFF_STORAGE_KEY, value.trim());
    }
  }

  function handlePickupPlaceSelect(place: SelectedPlace) {
    setPickupPlace(place);
    setPickupAddress(place.formattedAddress);
    setPickupPlaceError("");
    if (place.formattedAddress.trim()) {
      localStorage.setItem(PICKUP_STORAGE_KEY, place.formattedAddress.trim());
    }
  }

  function handleDropoffPlaceSelect(place: SelectedPlace) {
    setDropoffPlace(place);
    setDropoffAddress(place.formattedAddress);
    setDropoffPlaceError("");
    if (place.formattedAddress.trim()) {
      localStorage.setItem(DROPOFF_STORAGE_KEY, place.formattedAddress.trim());
    }
  }

  function handleQuickSelectAirport(code: QuickSelectAirportCode) {
    const place = quickSelectToPlace(code);
    if (!place) {
      return;
    }
    const targetDropoff =
      isPlaceSelected(pickupPlace) && !isPlaceSelected(dropoffPlace);
    if (targetDropoff) {
      handleDropoffPlaceSelect(place);
    } else {
      handlePickupPlaceSelect(place);
    }
  }

  function validateA2APlaces(): boolean {
    let ok = true;
    if (!isPlaceSelected(pickupPlace)) {
      setPickupPlaceError("Please select a complete address from the suggestions.");
      ok = false;
    } else {
      setPickupPlaceError("");
    }
    if (!isPlaceSelected(dropoffPlace)) {
      setDropoffPlaceError("Please select a complete address from the suggestions.");
      ok = false;
    } else {
      setDropoffPlaceError("");
    }
    if (
      isPlaceSelected(pickupPlace) &&
      isPlaceSelected(dropoffPlace) &&
      placesEqual(pickupPlace, dropoffPlace)
    ) {
      setDropoffPlaceError("Pickup and drop-off cannot be the same place.");
      ok = false;
    }
    return ok;
  }

  const airportName =
    AIRPORTS.find((a) => a.code === effectiveAirportCode)?.name ?? effectiveAirportCode;

  const pickupLabel = isA2AFlow
    ? pickupPlace.formattedAddress.trim() || pickupAddress.trim()
    : isAirportTrip
      ? isFromAirport
        ? airportName
        : pickupAddress.trim()
      : pickupAddress.trim();

  const dropoffLabel = isA2AFlow
    ? dropoffPlace.formattedAddress.trim() || dropoffAddress.trim()
    : isAirportTrip
      ? isFromAirport
        ? dropoffAddress.trim()
        : airportName
      : dropoffAddress.trim();

  useEffect(() => {
    if (!liveQuote || bookingSent || quoteStep !== 1) {
      return;
    }

    // Quote-lead API requires a complete schedule — never call with empty date/time.
    if (!tripDate || !tripTime || !isTripDateOnOrAfterToday(tripDate)) {
      return;
    }
    if (returnJourney) {
      if (!returnDate || !returnTime) {
        return;
      }
      if (!isReturnAfterOutbound(tripDate, tripTime, returnDate, returnTime)) {
        return;
      }
    }

    const tripLabel = isOutOfAreaPickupJourney
      ? "Out-of-area pickup — manual quote request"
      : isRoiJourney
        ? "Republic of Ireland long-distance transfer"
        : isA2AFlow && journeyKind
          ? journeyKindLabel(journeyKind)
          : isAirportTrip
            ? isFromAirport
              ? "Airport pickup"
              : "Airport drop-off"
            : "Address to address";

    return scheduleQuoteLeadAlert({
      tripLabel,
      pickupLabel,
      dropoffLabel,
      returnJourney,
      tripDate,
      tripTime,
      returnDate: returnJourney ? returnDate : undefined,
      returnTime: returnJourney ? returnTime : undefined,
      passengers,
      suitcases,
      vehicle: quoteVehicle,
      estimatedPrice: formatQuote(liveQuote.amount),
      journeyDistance: journeyDistanceLabel || undefined,
      journeyDuration: journeyDurationLabel || undefined,
      isAirportTrip,
    });
  }, [
    bookingSent,
    dropoffLabel,
    isAirportTrip,
    isFromAirport,
    journeyDistanceLabel,
    journeyDurationLabel,
    liveQuote,
    passengers,
    pickupLabel,
    quoteVehicle,
    returnDate,
    returnJourney,
    returnTime,
    quoteStep,
    suitcases,
    tripDate,
    tripTime,
  ]);

  /**
   * Flight numbers are optional and must never block Step 2 continue.
   * Verification loading / unavailable / soft failures are informational only.
   */
  function clearFlightBlockingErrors(): void {
    setGoingFlightError("");
    setCollectionFlightError("");
  }

  function validateTripForBooking(schedule?: {
    tripDate: string;
    tripTime: string;
    returnDate: string;
    returnTime: string;
  }): boolean {
    const date = schedule?.tripDate || tripDate;
    const time = schedule?.tripTime || tripTime;
    const retDate = schedule?.returnDate || returnDate;
    const retTime = schedule?.returnTime || returnTime;
    let ok = true;

    if (!date) {
      setTripDateError("Please select your pickup date.");
      ok = false;
    } else if (!isTripDateOnOrAfterToday(date)) {
      setTripDateError("Pickup date cannot be in the past.");
      ok = false;
    } else if (!time) {
      setTripDateError("Please select your pickup time.");
      ok = false;
    } else if (!isTripDateTimeNotInPast(date, time)) {
      setTripDateError("Pickup time cannot be in the past. Choose a later time.");
      ok = false;
    } else {
      setTripDateError("");
    }

    if (returnJourney) {
      if (!retDate || !retTime) {
        setReturnDateError("Please select a return date and time.");
        ok = false;
      } else if (date && time && !isReturnAfterOutbound(date, time, retDate, retTime)) {
        setReturnDateError("Return date and time must be after your outbound trip.");
        ok = false;
      } else {
        setReturnDateError("");
      }
    } else {
      setReturnDateError("");
    }

    if (!ok) {
      return false;
    }

    if (ldyServiceAreaInvalid) {
      return false;
    }

    if (!hasCompatibleVehicle) {
      return false;
    }

    if (isEnquiryOnly || isManualQuoteJourney) {
      return hasQuoteRoute;
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
      setMobileNumberError(
        isEnquiryOnly
          ? "Please enter your mobile number so we can contact you about your enquiry."
          : "Please enter your mobile number so we can contact you about your booking.",
      );
      ok = false;
    } else if (!isValidMobileNumber(customerMobile)) {
      setMobileNumberError("Please enter a valid mobile number.");
      ok = false;
    } else {
      setMobileNumberError("");
    }

    if (!customerEmail.trim()) {
      setEmailAddressError(
        isEnquiryOnly
          ? "Please enter your email address so we can send your quote."
          : "Please enter your email address so we can confirm your booking.",
      );
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
    const tripLabel = isOutOfAreaPickupJourney
      ? "Out-of-area pickup — manual quote request"
      : isRoiJourney
        ? "Republic of Ireland long-distance transfer"
        : isA2AFlow && journeyKind
          ? journeyKindLabel(journeyKind)
          : isAirportTrip
            ? isFromAirport
              ? "Airport pickup"
              : "Airport drop-off"
            : "Address to address";

    const estimatedPrice = liveQuote
      ? isRequestQuote
        ? `Guide price ${formatQuote(liveQuote.amount)} (subject to availability)`
        : !isEnquiryOnly && !isManualQuoteJourney
          ? formatQuote(liveQuote.amount)
          : null
      : isManualQuoteJourney
        ? "Request fixed quote"
        : null;

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
      isAirportTrip: isAirportTrip || Boolean(journeyKind && journeyKind !== "address-to-address"),
      airportCode: effectiveAirportCode || undefined,
      isFromAirport: isAirportTrip || isFromAirport ? isFromAirport : undefined,
    };
  }

  function buildConfirmedBookingDetails(): BookingDetails {
    return {
      ...buildBookingDetails(),
      termsAcceptedAt: new Date().toISOString(),
      termsVersion: TERMS_LAST_UPDATED,
      ...buildMarketingOptInFields(marketingOptIn),
    };
  }

  function requireCapacityConfirmed(): boolean {
    if (!capacityNeedsConfirm) {
      setCapacityError("");
      return true;
    }
    if (!capacityConfirmed) {
      setCapacityError(
        "Please confirm you understand we must check luggage capacity before we can accept this booking.",
      );
      return false;
    }
    setCapacityError("");
    return true;
  }

  function requireTermsAccepted(): boolean {
    if (!termsAccepted) {
      setTermsError("Please accept the Terms & Conditions before continuing.");
      return false;
    }

    setTermsError("");
    return true;
  }

  function buildPaymentDescription(): string {
    const vehicleLabel = quoteVehicle.split(" (")[0];
    const tripSummary = isAirportTrip || pickupAirportCode || dropoffAirportCode
      ? `${isFromAirport ? "Pickup from" : "Transfer to"} ${airportName} (${effectiveAirportCode})`
      : "Address-to-address transfer";
    const customer = customerName.trim();
    const namePart = customer ? ` — ${customer}` : "";
    const prefix = testChargeAmount ? "[TEST £1] " : "";
    return `${prefix}${tripSummary} — ${vehicleLabel}${namePart}`.slice(0, 140);
  }

  const paymentAmount = testChargeAmount ?? liveQuote?.amount ?? null;

  async function handlePayNow() {
    if (!liveQuote || paymentLoading || !canPayNowOnline) {
      if (!canPayNowOnline) {
        setPaymentError(
          "Online payment is available for standard and estate cars with an instant fare. Request to book instead and we’ll email a SumUp link once confirmed.",
        );
      }
      return;
    }

    if (!validateContactDetails()) {
      return;
    }

    clearFlightBlockingErrors();

    if (!requireTermsAccepted()) {
      return;
    }

    setPaymentLoading(true);
    setPaymentError("");

    try {
      const returnToken = createPaymentReturnToken();
      const checkout = await createPaymentCheckout({
        amount: paymentAmount ?? liveQuote.amount,
        description: buildPaymentDescription(),
        redirectUrl: buildPaymentRedirectUrl(returnToken),
      });
      savePendingPayment(
        {
          checkoutId: checkout.checkoutId,
          booking: {
            ...buildConfirmedBookingDetails(),
          },
        },
        returnToken,
      );
      const paymentWindow = window.open(checkout.paymentUrl, "_blank", "noopener,noreferrer");
      if (!paymentWindow) {
        window.location.assign(checkout.paymentUrl);
        return;
      }
      setPaymentLoading(false);
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "We couldn't start payment. Please try again or contact us to pay.",
      );
      setPaymentLoading(false);
    }
  }

  async function confirmBooking(delivery: BookingDelivery) {
    if (!requireCapacityConfirmed()) {
      return;
    }
    if (!requireTermsAccepted()) {
      return;
    }

    const details = buildConfirmedBookingDetails();
    const isMobile = isMobileDevice ?? detectMobileDevice();
    setSubmitted(true);
    setSubmitError("");
    setBookingReference("");

    let reference = "";
    try {
      if (isEnquiryOnly || isManualQuoteJourney) {
        const enquiryMessage = buildEnquiryBookingMessage(details);
        const subject = isOutOfAreaPickupJourney
          ? `Out-of-area pickup quote request — ${details.customerName}`
          : isRoiJourney
            ? `ROI long-distance quote request — ${details.customerName}`
            : `New vehicle enquiry — ${details.customerName}`;
        if (!isMobile || delivery === "email") {
          reference = await submitEnquiryByEmail({
            customerName: details.customerName,
            message: enquiryMessage,
            subject,
            booking: details,
          });
        } else {
          reference = await submitMobileWhatsAppEnquiry({
            customerName: details.customerName,
            message: enquiryMessage,
            subject,
            booking: details,
          });
        }
      } else if (!isMobile || delivery === "email") {
        reference = await submitBookingByEmail(details);
      } else {
        reference = await submitMobileWhatsAppBooking(details);
      }
      setBookingReference(reference);
    } catch (error) {
      console.error("Booking submission failed", error);
      setSubmitError(
        delivery === "email" || !isMobile
          ? `We couldn't send your ${isEnquiryOnly ? "enquiry" : "booking"} by email. Please try WhatsApp or contact ${SITE.email} with your trip details.`
          : `We couldn't log your ${isEnquiryOnly ? "enquiry" : "booking"}. Please try email instead or contact ${SITE.email}.`,
      );
      setSubmitted(false);
      return;
    }

    setBookingDelivery(delivery);
    setBookingSent(true);
    setSubmitted(false);

    if (details.marketingOptIn) {
      void recordMarketingOptIn({
        email: details.customerEmail,
        name: details.customerName,
        source: isManualQuoteJourney || isEnquiryOnly ? "vehicle-enquiry" : "booking-request",
        fields: details,
      });
    }

    if (isMobile && delivery === "whatsapp") {
      openWhatsAppBookingMessage(
        isEnquiryOnly
          ? buildEnquiryBookingMessage(details, reference)
          : buildBookingMessage(details, reference),
      );
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError("");
    setBookingSent(false);
    setBookingReference("");
    setBookingDelivery(null);

    if (quoteStep === 1) {
      if (isA2AFlow && !validateA2APlaces()) {
        return;
      }
      if (!hasQuoteRoute) {
        return;
      }
      if (!isEnquiryOnly && !isManualQuoteJourney && !liveQuote) {
        return;
      }
      setQuoteStep(2);
      return;
    }

    if (quoteStep === 2) {
      // Step 2 uses an explicit Continue handler so date/time DOM values are synced first.
      return;
    }

    if (!validateContactDetails()) {
      return;
    }
    if (!usesWhatsApp) {
      if (!requireTermsAccepted()) {
        return;
      }
      void confirmBooking("email");
    }
  }

  function handleEditBooking() {
    setQuoteStep(2);
    setSubmitError("");
    setBookingSent(false);
    setBookingReference("");
    setBookingDelivery(null);
    setTermsAccepted(false);
    setTermsError("");
    setMarketingOptIn(false);
  }

  function handleContinueTravelDetails() {
    setSubmitError("");
    const schedule = syncScheduleFieldsFromInputs();
    if (!validateTripForBooking(schedule)) {
      return;
    }
    // Do not wait on flight lookup — unavailable/loading must not require a second click.
    clearFlightBlockingErrors();
    setQuoteStep(3);
  }

  const usesWhatsApp = isMobileDevice === true;

  useEffect(() => {
    if (bookingSent) {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    }
  }, [bookingSent]);

  const submitInProgressLabel = showsRequestQuoteFlow
    ? "Sending quote request…"
    : isEnquiryOnly
      ? "Sending enquiry…"
      : "Sending booking…";

  const confirmButtonLabel = showsRequestQuoteFlow
    ? isManualQuoteJourney
      ? "Request Fixed Quote"
      : liveQuote
        ? `Request quote · ${formatQuote(liveQuote.amount)}`
        : "Request a quote"
    : isEnquiryOnly
      ? "Send enquiry"
      : liveQuote
        ? `Confirm & book for ${formatQuote(liveQuote.amount)}`
        : "Confirm & book";

  const whatsAppConfirmLabel = showsRequestQuoteFlow
    ? isManualQuoteJourney
      ? "Request Fixed Quote via WhatsApp"
      : liveQuote
        ? `Request quote via WhatsApp — ${formatQuote(liveQuote.amount)}`
        : "Request quote via WhatsApp"
    : isEnquiryOnly
      ? "Send enquiry via WhatsApp"
      : liveQuote
        ? `Send via WhatsApp — ${formatQuote(liveQuote.amount)}`
        : "Confirm & send via WhatsApp";

  const quoteHint = isManualQuoteJourney
    ? hasQuoteRoute
      ? isOutOfAreaPickupJourney
        ? "Continue to request your fixed price — out-of-area pickups need manual approval."
        : "Continue to request your fixed Republic of Ireland price."
      : "Select pickup and drop-off addresses from the suggestions."
    : isA2AFlow && !isAddressPairComplete
      ? "Select pickup and drop-off addresses from the suggestions to see your price."
      : isRequestQuote
    ? hasQuoteRoute
      ? !isScheduleComplete
        ? "Minibus guide price ready — add your date and time, then request a quote (subject to partner availability)."
        : "Minibus transfers via licensed partners — continue to request a quote."
      : isAirportTrip
        ? !airportCode
          ? "Select an airport to see a minibus guide price"
          : ldyServiceAreaInvalid
            ? isFromAirport
              ? "We transfer from Derry Airport to the greater Belfast area — enter a Belfast-area drop-off address"
              : "Pickups for Derry Airport must be in the greater Belfast area — enter a Belfast-area pickup address"
            : !isAirportAddressComplete
              ? `Enter your ${isFromAirport ? "drop-off" : "pickup"} address to see a minibus guide price`
              : ""
        : !isAddressPairComplete
          ? "Enter pickup and drop-off addresses to see a minibus guide price"
          : ""
    : isEnquiryOnly
    ? hasQuoteRoute
      ? !isScheduleComplete
        ? `${quoteVehicle.split(" (")[0]} is enquiry only — add your date and time, then continue to book.`
        : `${quoteVehicle.split(" (")[0]} is enquiry only — continue to send your trip details and we’ll quote you.`
      : isAirportTrip
        ? !airportCode
          ? "Select an airport to continue your enquiry"
          : ldyServiceAreaInvalid
            ? isFromAirport
              ? "We transfer from Derry Airport to the greater Belfast area — enter a Belfast-area drop-off address"
              : "Pickups for Derry Airport must be in the greater Belfast area — enter a Belfast-area pickup address"
            : !isAirportAddressComplete
              ? `Enter your ${isFromAirport ? "drop-off" : "pickup"} address to continue your enquiry`
              : ""
        : !isAddressPairComplete
          ? "Enter pickup and drop-off addresses to continue your enquiry"
          : ""
    : isAirportTrip
      ? !airportCode
        ? "Select an airport to see your fixed journey price"
        : ldyServiceAreaInvalid
          ? isFromAirport
            ? "We transfer from Derry Airport to the greater Belfast area — enter a Belfast-area drop-off address"
            : "Pickups for Derry Airport must be in the greater Belfast area — enter a Belfast-area pickup address"
          : !isAirportAddressComplete
            ? `Enter your ${isFromAirport ? "drop-off" : "pickup"} address to see your fixed journey price`
            : !isScheduleComplete
              ? "Price ready — add your date and time when you’re ready to book"
              : ""
      : !isAddressPairComplete
        ? "Enter pickup and drop-off addresses to see your fixed journey price"
        : !routeMetrics
          ? "Calculating your route and price…"
          : !isScheduleComplete
            ? "Price ready — add your date and time when you’re ready to book"
            : "";

  if (bookingSent) {
    const quoteConversionValue =
      typeof liveQuote?.amount === "number"
        ? liveQuote.amount
        : parseAmountValue(liveQuote ? formatQuote(liveQuote.amount) : undefined);

    return (
      <div
        ref={cardRef}
        id="quoteResult"
        className="glass-card min-w-0 rounded-2xl p-6 sm:p-8 lg:animate-float"
      >
        <GoogleAdsRequestQuote
          fire
          value={quoteConversionValue}
          transactionId={bookingReference || undefined}
          userData={{
            email: customerEmail.trim() || undefined,
            phone: customerMobile.trim() || undefined,
          }}
        />
        <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-5 py-8 text-center sm:px-8 sm:py-10">
          <p className="text-xs font-medium uppercase tracking-wider text-emerald">
            {showsRequestQuoteFlow
              ? "Quote request submitted"
              : isEnquiryOnly
                ? "Enquiry submitted"
                : "Booking submitted"}
          </p>
          <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Thank you</h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/80 sm:text-base">
            {showsRequestQuoteFlow
              ? isOutOfAreaPickupJourney
                ? "We’ve received your out-of-area pickup request. We’ll review it manually, confirm availability, and send your personal fixed quote shortly. No payment is taken until the fare is confirmed."
                : isRoiJourney
                  ? "We’ve received your Republic of Ireland long-distance transfer request. We’ll confirm your fixed price and send your personal quote shortly."
                  : "We’ve received your minibus quote request. These transfers are subject to partner availability — we’ll confirm capacity and send your personal quote shortly."
              : isEnquiryOnly
                ? "We’ve received your enquiry. We’ll confirm availability and send your personal quote shortly. When you’re ready to book, we’ll send a SumUp payment link — your trip is confirmed after payment."
                : "We’ve received your booking request. Once we confirm the job, we’ll send a SumUp payment link by email. Your booking is confirmed after payment."}
          </p>
          {bookingReference && (
            <p className="mt-4 text-sm text-white/60">Reference: {bookingReference}</p>
          )}
          {bookingDelivery === "whatsapp" && (
            <p className="mx-auto mt-4 max-w-md text-sm text-white/60">
              Your {isEnquiryOnly ? "enquiry" : "booking"} message should open in WhatsApp. If it
              didn&apos;t, open WhatsApp and message @{SITE.whatsappUsername}.
            </p>
          )}
          {bookingDelivery === "email" && (
            <p className="mx-auto mt-4 max-w-md text-sm text-white/60">
              Your {isEnquiryOnly ? "enquiry" : "booking"} has been sent by email. We&apos;ll
              confirm at {customerEmail.trim()}.
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              resetRequestQuoteConversion();
              setBookingSent(false);
              setBookingReference("");
              setBookingDelivery(null);
              setQuoteStep(1);
              setSubmitError("");
              setTermsAccepted(false);
              setTermsError("");
              setMarketingOptIn(false);
              setSubmitted(false);
              cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
            }}
            className="mt-6 w-full rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy transition-colors hover:bg-emerald-light sm:w-auto sm:px-8"
          >
            Get another quote
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={cardRef} className="glass-card min-w-0 rounded-2xl p-6 sm:p-8 lg:animate-float">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white sm:text-2xl">Get a Live Quote</h2>
        <p className="mt-1 text-sm text-white/60">
          Three quick steps — where you&apos;re travelling, travel details, then your details.
          Standard and estate cars can pay online by card to confirm; otherwise Request to book and
          we&apos;ll email a SumUp link after we confirm.
        </p>
        <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="Booking steps">
          {[
            { step: 1 as const, label: isA2AFlow ? "Where & when" : "Airport & address" },
            { step: 2 as const, label: "Travel details" },
            { step: 3 as const, label: canPayNowOnline ? "Pay & confirm" : "Your details & request" },
          ].map((item) => {
            const active = quoteStep === item.step;
            const done = quoteStep > item.step;
            return (
              <li
                key={item.step}
                className={`rounded-lg border px-2 py-2 text-center ${
                  active
                    ? "border-emerald/50 bg-emerald/15 text-emerald"
                    : done
                      ? "border-white/15 bg-white/5 text-white/70"
                      : "border-white/10 text-white/40"
                }`}
              >
                <span className="block text-[10px] font-semibold uppercase tracking-wider">
                  Step {item.step}
                </span>
                <span className="mt-0.5 block text-xs font-semibold">{item.label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <form id="quoteForm" onSubmit={handleSubmit} className="space-y-4">
        {testChargeAmount !== null && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <strong className="text-white">Test booking mode.</strong> SumUp will charge{" "}
            <strong className="text-white">£1.00</strong> only
            {testBookingLabel ? ` for ${testBookingLabel}` : ""}. You will still receive the full
            invoice email and live tracking link.
          </div>
        )}
        {quoteStep === 1 ? (
          <>
        {isA2AFlow ? (
          <>
            <div>
              <h3 className="text-base font-semibold text-white sm:text-lg">
                Where are you travelling?
              </h3>
              {journeyKind ? (
                <p className="mt-1 text-xs text-white/55">{journeyKindLabel(journeyKind)}</p>
              ) : null}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">
                Journey
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
                <button
                  type="button"
                  aria-pressed={!returnJourney}
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
                  aria-pressed={returnJourney}
                  onClick={() => setReturnJourney(true)}
                  className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                    returnJourney
                      ? "bg-emerald text-navy shadow-sm"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  Return · 5% off
                </button>
              </div>
            </div>

            <AddressInput
              id="pickup"
              name="pickup"
              value={pickupAddress}
              onChange={handlePickupChange}
              onSelectPlace={handlePickupPlaceSelect}
              requireSuggestion
              selectionError={pickupPlaceError}
              airportCode={addressLookupCode}
              label="Pickup"
              placeholder="Enter pickup address, hotel or airport"
              helperText="Pick a complete address from the suggestions"
            />
            <AddressInput
              id="dropoff"
              name="dropoff"
              value={dropoffAddress}
              onChange={handleDropoffChange}
              onSelectPlace={handleDropoffPlaceSelect}
              requireSuggestion
              selectionError={dropoffPlaceError}
              airportCode={addressLookupCode}
              label="Drop-off"
              placeholder="Enter destination address, hotel or airport"
              helperText="Pick a complete address from the suggestions"
            />

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">
                Quick select airports
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_SELECT_AIRPORTS.map((airport) => (
                  <button
                    key={airport.code}
                    type="button"
                    onClick={() => handleQuickSelectAirport(airport.code)}
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition-colors hover:border-emerald/40 hover:bg-emerald/10 hover:text-white"
                  >
                    {airport.label}
                  </button>
                ))}
              </div>
            </div>

            {isOutOfAreaPickupJourney ? (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-white/85">
                <p className="font-semibold text-amber-200">Out-of-area pickup – request your fixed price</p>
                <p className="mt-1 text-xs leading-relaxed text-white/70">
                  Standard pickups are from Greater Belfast (or Belfast International, Belfast City,
                  or Dublin Airport). This pickup needs manual approval — we&apos;ll confirm your
                  personal fixed price by email. No automatic online fare or immediate payment.
                </p>
              </div>
            ) : isRoiJourney ? (
              <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-white/85">
                <p className="font-semibold text-emerald">Republic of Ireland journey – request your fixed price</p>
                <p className="mt-1 text-xs leading-relaxed text-white/70">
                  Republic of Ireland city destinations (outside Dublin Airport) are quoted
                  individually — we&apos;ll confirm your personal fixed price by email.
                </p>
              </div>
            ) : null}

            {isLdyTrip && ldyServiceAreaInvalid ? (
              <p className="text-xs text-red-300">
                City of Derry Airport transfers are between LDY and the greater Belfast area only.
              </p>
            ) : null}

            <TripMap
              tripMode="address"
              originAddress={pickupAddress}
              destinationAddress={dropoffAddress}
              onRouteMetrics={handleRouteMetrics}
              variant="summary"
            />
          </>
        ) : (
          <>
        {/* Legacy airport transfer UI when addressToAddress is disabled */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">
            Journey
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              aria-pressed={!returnJourney}
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
              aria-pressed={returnJourney}
              onClick={() => setReturnJourney(true)}
              className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                returnJourney
                  ? "bg-emerald text-navy shadow-sm"
                  : "text-white/70 hover:text-white"
              }`}
            >
              Return · 5% off
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
                  Transfers between City of Derry Airport and the greater Belfast area only.
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
                  <button
                    type="button"
                    aria-pressed={tripDirection === "to-airport"}
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
                    aria-pressed={tripDirection === "from-airport"}
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
                aria-pressed={tripDirection === "to-airport"}
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
                aria-pressed={tripDirection === "from-airport"}
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
          variant="summary"
        />
          </>
        )}
          </>
        ) : null}

        {quoteStep === 2 ? (
          <>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="date"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              {returnJourney ? "Outbound Date" : "Date"}{" "}
              <span className="text-emerald/80">*</span>
            </label>
            <input
              id="date"
              ref={tripDateInputRef}
              name="date"
              type="date"
              required
              min={minTripDate}
              value={tripDate}
              onChange={(e) => {
                setTripDate(e.target.value);
                setTripDateError("");
                setReturnDateError("");
              }}
              onInput={(e) => {
                setTripDate((e.target as HTMLInputElement).value);
                setTripDateError("");
                setReturnDateError("");
              }}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
            />
          </div>
          <div>
            <label
              htmlFor="time"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              {returnJourney ? "Outbound pick up time" : "Pick up time"}{" "}
              <span className="text-emerald/80">*</span>
            </label>
            <input
              id="time"
              ref={tripTimeInputRef}
              name="time"
              type="time"
              required
              min={minTripTime}
              value={tripTime}
              onChange={(e) => {
                setTripTime(e.target.value);
                setTripDateError("");
                setReturnDateError("");
              }}
              onInput={(e) => {
                setTripTime((e.target as HTMLInputElement).value);
                setTripDateError("");
                setReturnDateError("");
              }}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
            />
          </div>
          {tripDateError ? (
            <p className="sm:col-span-2 text-xs text-red-400">{tripDateError}</p>
          ) : null}
        </div>

        {returnJourney && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="returnDate"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
              >
                Return Date <span className="text-emerald/80">*</span>
              </label>
              <input
                id="returnDate"
                ref={returnDateInputRef}
                name="returnDate"
                type="date"
                required
                min={minReturnDate}
                value={returnDate}
                onChange={(e) => {
                  setReturnDate(e.target.value);
                  setReturnDateError("");
                }}
                onInput={(e) => {
                  setReturnDate((e.target as HTMLInputElement).value);
                  setReturnDateError("");
                }}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
              />
            </div>
            <div>
              <label
                htmlFor="returnTime"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
              >
                Return pick up time <span className="text-emerald/80">*</span>
              </label>
              <input
                id="returnTime"
                ref={returnTimeInputRef}
                name="returnTime"
                type="time"
                required
                min={minReturnTime}
                value={returnTime}
                onChange={(e) => {
                  setReturnTime(e.target.value);
                  setReturnDateError("");
                }}
                onInput={(e) => {
                  setReturnTime((e.target as HTMLInputElement).value);
                  setReturnDateError("");
                }}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
              />
            </div>
            {returnDateError && (
              <p className="sm:col-span-2 text-xs text-red-400">{returnDateError}</p>
            )}
          </div>
        )}

        {(isAirportTrip || (isA2AFlow && pickupAirportCode)) && (
          <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                Flight numbers <span className="font-normal text-white/45">(optional)</span>
              </p>
              <p className="mt-1 text-sm text-white/60">
                {getFlightNumbersIntro(isFromAirport, returnJourney)} You can continue without a
                flight number.
              </p>
            </div>
            <FlightNumberField
              id="goingFlightNumber"
              label="Flight number for going (optional)"
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
              airportCode={effectiveAirportCode}
              direction={isA2AFlow ? "from-airport" : tripDirection}
              enabled={quoteStep === 2}
              error={goingFlightError}
              onVerifiedChange={(flight) => {
                setVerifiedGoingFlight(flight);
              }}
            />
            {returnJourney && (
              <FlightNumberField
                id="collectionFlightNumber"
                label="Flight number for collection (optional)"
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
                airportCode={effectiveAirportCode}
                direction={isA2AFlow ? "to-airport" : returnTripDirection}
                enabled={quoteStep === 2}
                error={collectionFlightError}
                onVerifiedChange={(flight) => {
                  setVerifiedCollectionFlight(flight);
                }}
              />
            )}
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/55">Vehicle options</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-white/65">
            {VEHICLE_BOOKING_GUIDANCE.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

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
              {Array.from({ length: MAX_ONLINE_PASSENGERS }, (_, index) => index + 1).map((count) => (
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
                  {isVehicleRequestQuote(v)
                    ? `${v} — request a quote`
                    : isVehicleEnquiryOnly(v)
                      ? `${v} — enquire to book`
                      : v}
                </option>
              ))}
            </select>
            {passengers > 4 ? (
              <p className="mt-1.5 text-xs text-white/40">
                Minibus selected automatically for more than 4 passengers — Request a quote via our
                licensed transport partners (subject to availability).
              </p>
            ) : suitcases >= 5 ? (
              <p className="mt-1.5 text-xs text-white/40">
                Minibus selected automatically for 5 or more suitcases — Request a quote via our
                licensed transport partners (subject to availability).
              </p>
            ) : suitcases >= 3 ? (
              <p className="mt-1.5 text-xs text-white/40">
                Estate car selected automatically for 3 or more suitcases — instant online price where
                shown.
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-white/40">
                Choose Standard or Estate for 1–4 passengers — instant online price where shown.
              </p>
            )}
            {isRequestQuote ? (
              <p className="mt-1.5 text-xs text-white/50">{MINIBUS_PARTNER_NOTE}</p>
            ) : null}
          </div>
        </div>

        {capacityNeedsConfirm ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
            <p className="font-semibold text-amber-100">Luggage capacity check required</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-50/90">
              8 passengers with 8 large suitcases cannot be confirmed until we check vehicle
              capacity with our transport partner. You can still request a quote — we&apos;ll confirm
              whether we can take the booking.
            </p>
          </div>
        ) : null}
          </>
        ) : null}

        {(quoteStep === 1 || quoteStep === 2) && (
        <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-4">
          {isManualQuoteJourney ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                {isOutOfAreaPickupJourney
                  ? "Out-of-area pickup"
                  : "Republic of Ireland long-distance transfer"}
              </p>
              <p className="mt-1 text-xl font-bold text-white sm:text-2xl">Request your fixed price</p>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                {isOutOfAreaPickupJourney
                  ? "This pickup is outside our standard Greater Belfast area and needs manual approval. Continue to send your trip details — we’ll email your personal fixed price. No automatic fare or online payment until confirmed."
                  : "Republic of Ireland city destinations are quoted individually. Continue to send your trip details and we’ll email your personal fixed price."}
              </p>
              {journeyDistanceLabel && journeyDurationLabel && (
                <p className="mt-2 text-xs text-white/60">
                  Approx. {journeyDistanceLabel} · {journeyDurationLabel}
                </p>
              )}
            </>
          ) : showsRequestQuoteFlow && liveQuote ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                {returnJourney ? "Guide return price · request a quote" : "Guide price · request a quote"}
              </p>
              <p className="mt-1 text-3xl font-bold text-white">{formatQuote(liveQuote.amount)}</p>
              <p className="mt-2 text-xs text-white/60">Minibus · subject to partner availability</p>
              <p className="mt-2 text-xs leading-relaxed text-white/65">{MINIBUS_PARTNER_NOTE}</p>
              {journeyDistanceLabel && journeyDurationLabel && (
                <p className="mt-2 text-xs text-white/60">
                  Approx. {journeyDistanceLabel} · {journeyDurationLabel}
                </p>
              )}
              <p className="mt-3 text-xs leading-relaxed text-white/60">
                {getPriceInclusionNote(isAirportTrip, isFromAirport, returnJourney)} This is a guide
                price only — not an instant confirmation.
              </p>
              {returnJourney && (
                <p className="mt-2 text-xs font-medium text-emerald/90">
                  Includes 5% return booking discount on the guide price.
                </p>
              )}
            </>
          ) : isEnquiryOnly ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                Enquiry to book
              </p>
              <p className="mt-1 text-xl font-bold text-white sm:text-2xl">
                {quoteVehicle.split(" (")[0]}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                No online price for this vehicle. Send an enquiry with your trip details and
                we&apos;ll confirm availability and quote you personally.
              </p>
              {journeyDistanceLabel && journeyDurationLabel && (
                <p className="mt-2 text-xs text-white/60">
                  Approx. {journeyDistanceLabel} · {journeyDurationLabel}
                </p>
              )}
              {!tripDetailsReady && quoteHint ? (
                <p className="mt-3 text-sm text-white/70">{quoteHint}</p>
              ) : null}
            </>
          ) : liveQuote ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                {testChargeAmount !== null
                  ? "Test SumUp charge"
                  : returnJourney
                    ? "Your fixed return journey price"
                    : "Your fixed journey price"}
              </p>
              <p className="mt-1 text-3xl font-bold text-white">
                {formatQuote(testChargeAmount ?? liveQuote.amount)}
              </p>
              {testChargeAmount !== null && (
                <p className="mt-2 text-xs text-white/60">
                  Route price would be {formatQuote(liveQuote.amount)} — not charged in test mode.
                </p>
              )}
              <p className="mt-2 text-xs text-white/60">{quoteVehicle.split(" (")[0]}</p>
              {journeyDistanceLabel && journeyDurationLabel && (
                <p className="mt-2 text-xs text-white/60">
                  Approx. {journeyDistanceLabel} · {journeyDurationLabel}
                </p>
              )}
              <p className="mt-3 text-xs leading-relaxed text-white/60">
                {getPriceInclusionNote(isAirportTrip, isFromAirport, returnJourney)}
              </p>
              {returnJourney && (
                <p className="mt-2 text-xs font-medium text-emerald/90">
                  Includes 5% return booking discount.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-white/50">
                Your fixed journey price
              </p>
              <p className="mt-1 text-sm text-white/70">{quoteHint}</p>
            </>
          )}
          <p className="mt-3 text-[11px] text-white/40">
            {isManualQuoteJourney
              ? "Request Fixed Quote — we’ll confirm your personal price before any payment is taken."
              : showsRequestQuoteFlow
              ? "Request a quote — we’ll confirm availability before the booking is accepted. No online payment until confirmed."
              : isEnquiryOnly
                ? "We’ll reply with your quote — no online payment until you confirm."
                : "Includes vehicle, driver, fuel, and tolls. After we confirm your job, we’ll send a SumUp payment link by email."}
          </p>
        </div>
        )}

        {quoteStep === 3 ? (
          <>
        <div className={BOOKING_PANEL_CLASS}>
          <p className="text-xs font-medium uppercase tracking-wider text-emerald">
            Your details
          </p>
          <p className="mt-1 mb-4 text-sm text-white/75">
            {canPayNowOnline
              ? "Enter your details, accept the terms, then pay securely with SumUp to confirm your booking."
              : "We need these details for your booking request. After we confirm the job, we’ll email your SumUp payment link."}
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
                So we can call or text if we need to reach you about your booking.
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
                So we can email your SumUp payment link and booking confirmation.
              </p>
              {emailAddressError && (
                <p className="mt-1.5 text-xs text-red-300">{emailAddressError}</p>
              )}
            </div>
          </div>
        </div>

        {paymentError && (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {paymentError}
          </p>
        )}

                  <div className={BOOKING_PANEL_CLASS}>
            <div className="mb-4">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                {showsRequestQuoteFlow
                  ? isManualQuoteJourney
                    ? "Review your fixed quote request"
                    : "Review your quote request"
                  : isEnquiryOnly
                    ? "Review your enquiry"
                    : "Review your booking"}
              </p>
              <p className="mt-1 text-sm text-white/75">
                {showsRequestQuoteFlow
                  ? isOutOfAreaPickupJourney
                    ? "Check your details, then request your fixed price — out-of-area pickups need manual approval."
                    : isRoiJourney
                      ? "Check your details, then request your fixed Republic of Ireland price."
                      : "Check your details, then request a quote — minibus transfers via licensed partners are subject to availability and are not instantly confirmed."
                  : isEnquiryOnly
                    ? "Check your details, then send an enquiry — we’ll quote you and confirm availability."
                    : "Please check everything is correct before booking — wrong details can change your price."}
              </p>
            </div>
            <dl>
              <PreviewRow label="Name" value={customerName.trim()} />
              <PreviewRow label="Mobile" value={customerMobile.trim()} />
              <PreviewRow label="Email" value={customerEmail.trim()} />
              <PreviewRow
                label="Trip"
                value={
                  isA2AFlow && journeyKind
                    ? journeyKindLabel(journeyKind)
                    : isAirportTrip
                      ? isFromAirport
                        ? "Airport pickup"
                        : "Airport drop-off"
                      : "Address to address"
                }
              />
              {(isAirportTrip || effectiveAirportCode) && airportName && (
                <PreviewRow label="Airport" value={`${airportName} (${effectiveAirportCode})`} />
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
                value={`${formatDisplayDate(tripDate)} at ${formatDisplayTime(tripTime)} (UK local time)`}
              />
              {returnJourney && (
                <PreviewRow
                  label="Return"
                  value={`${formatDisplayDate(returnDate)} at ${formatDisplayTime(returnTime)} (UK local time)`}
                />
              )}
              {(isAirportTrip || (isA2AFlow && pickupAirportCode)) && (
                <PreviewRow
                  label="Flight for going"
                  value={
                    verifiedGoingFlight
                      ? formatVerifiedFlightSummary(verifiedGoingFlight)
                      : goingFlightNumber.trim().toUpperCase()
                  }
                />
              )}
              {returnJourney && (isAirportTrip || (isA2AFlow && (pickupAirportCode || dropoffAirportCode))) && (
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
              {isManualQuoteJourney ? (
                <PreviewRow
                  label="Pricing"
                  value={
                    isOutOfAreaPickupJourney
                      ? "Out-of-area pickup — request fixed quote (manual approval)"
                      : "Request fixed quote — we’ll email your price"
                  }
                />
              ) : showsRequestQuoteFlow && liveQuote ? (
                <PreviewRow
                  label="Guide price"
                  value={`${formatQuote(liveQuote.amount)} — request a quote`}
                />
              ) : isEnquiryOnly ? (
                <PreviewRow label="Pricing" value="Enquiry — we’ll quote you" />
              ) : liveQuote ? (
                <PreviewRow
                  label={returnJourney ? "Your fixed return journey price" : "Your fixed journey price"}
                  value={formatQuote(liveQuote.amount)}
                />
              ) : null}
              {isRequestQuote && !isManualQuoteJourney ? (
                <PreviewRow label="Fulfilment" value={MINIBUS_PARTNER_NOTE} />
              ) : null}
            </dl>
          </div>

        {submitError && (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {submitError}
          </p>
        )}

        <div className="space-y-3">
            {capacityNeedsConfirm ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
                <input
                  type="checkbox"
                  checked={capacityConfirmed}
                  onChange={(event) => {
                    setCapacityConfirmed(event.target.checked);
                    if (event.target.checked) {
                      setCapacityError("");
                    }
                  }}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-white/30 bg-navy text-emerald focus:ring-emerald"
                />
                <span>
                  I understand that 8 passengers with 8 large suitcases cannot be booked until you
                  confirm vehicle capacity in writing.
                  {capacityError ? (
                    <span className="mt-1 block text-xs text-red-200">{capacityError}</span>
                  ) : null}
                </span>
              </label>
            ) : null}

            <BookingTermsConsent
              accepted={termsAccepted}
              onAcceptedChange={(checked) => {
                setTermsAccepted(checked);
                if (checked) {
                  setTermsError("");
                }
              }}
              error={termsError}
              mode={canPayNowOnline ? "card-payment" : "booking-request"}
              paymentAmountLabel={
                isEnquiryOnly
                  ? undefined
                  : testChargeAmount !== null
                    ? "£1.00"
                    : liveQuote
                      ? formatQuote(liveQuote.amount)
                      : undefined
              }
            />

            <MarketingOptIn checked={marketingOptIn} onCheckedChange={setMarketingOptIn} />

            {canPayNowOnline && liveQuote && (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-white/50">
                  Card payments are processed securely by SumUp. Keep your confirmation email as
                  proof of booking and payment.
                </p>
                <button
                  type="button"
                  onClick={() => void handlePayNow()}
                  disabled={paymentLoading || submitted || !termsAccepted}
                  className="w-full rounded-xl bg-white py-3.5 text-sm font-bold text-navy transition-all hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {paymentLoading
                    ? "Opening SumUp…"
                    : testChargeAmount !== null
                      ? "Pay £1.00 test charge with SumUp"
                      : `Pay ${formatQuote(liveQuote.amount)} now with SumUp`}
                </button>
                <p className="text-center text-xs text-white/50">
                  Payment opens in a new tab. Close that tab to cancel — your quote stays on this
                  page. You&apos;ll receive a branded invoice by email after payment.
                </p>
              </div>
            )}
            {canPayNowOnline ? (
              <button
                type="button"
                onClick={handleEditBooking}
                className="w-full rounded-xl border border-white/15 bg-white/5 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/10"
              >
                Back to travel details
              </button>
            ) : usesWhatsApp ? (
              <>
                <p className="text-xs text-white/55">
                  {isEnquiryOnly
                    ? "Choose how to send your enquiry:"
                    : "Choose how to send your booking:"}
                </p>
                <button
                  type="button"
                  onClick={handleEditBooking}
                  className="w-full rounded-xl border border-white/15 bg-white/5 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/10"
                >
                  Back to travel details
                </button>
                <button
                  type="button"
                  disabled={submitted || !termsAccepted}
                  onClick={() => void confirmBooking("whatsapp")}
                  className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitted ? submitInProgressLabel : whatsAppConfirmLabel}
                </button>
                <button
                  type="button"
                  disabled={submitted || !termsAccepted}
                  onClick={() => void confirmBooking("email")}
                  className="w-full rounded-xl border border-white/20 bg-white/5 py-3.5 text-sm font-semibold text-white transition-all hover:border-emerald/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitted
                    ? submitInProgressLabel
                    : isEnquiryOnly
                      ? "Send enquiry via email"
                      : "Send booking via email"}
                </button>
                <p className="text-xs leading-relaxed text-white/45">
                  No WhatsApp? Email works too — we&apos;ll confirm at {customerEmail.trim()}.
                </p>
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleEditBooking}
                  className="w-full rounded-xl border border-white/15 bg-white/5 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/10"
                >
                  Back to travel details
                </button>
                <button
                  type="submit"
                  disabled={submitted || !termsAccepted}
                  className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitted ? submitInProgressLabel : confirmButtonLabel}
                </button>
              </div>
            )}
          </div>
          </>
        ) : quoteStep === 2 ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setQuoteStep(1);
                  setGoingFlightError("");
                  setCollectionFlightError("");
                  setReturnDateError("");
                }}
                className="w-full rounded-xl border border-white/15 bg-white/5 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/10"
              >
                Back
              </button>
              <button
                type="button"
                disabled={submitted}
                onClick={handleContinueTravelDetails}
                className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Continue to your details
              </button>
            </div>
            {travelDetailsBlocker ? (
              <p className="text-center text-xs text-white/55" role="status">
                {travelDetailsBlocker}
              </p>
            ) : (
              <p className="text-center text-xs text-white/45">
                Flight number is optional — you can continue without one.
              </p>
            )}
          </div>
        ) : (
          <button
            type="submit"
            disabled={submitted || ((isEnquiryOnly || isManualQuoteJourney) ? !hasQuoteRoute : !liveQuote)}
            className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitted ? submitInProgressLabel : "Continue to travel details"}
          </button>
        )}
      </form>
    </div>
  );
}

export default memo(QuoteCard);
