"use client";

import { FormEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddressInput from "@/components/AddressInput";
import QuoteProgressiveRoute from "@/components/QuoteProgressiveRoute";
import BookingTermsConsent from "@/components/BookingTermsConsent";
import MarketingOptIn from "@/components/MarketingOptIn";
import TripMap from "@/components/TripMap";
import { buildBookingMessage, buildEnquiryBookingMessage, buildGroupQuoteRequestMessage, isValidEmailAddress, isValidMobileNumber, type BookingDetails } from "@/lib/booking-message";
import { buildMarketingOptInFields, recordMarketingOptIn } from "@/lib/marketing-api";
import { TERMS_LAST_UPDATED } from "@/lib/terms";
import { CANCELLATION_POLICY_VERSION } from "../../shared/refund-ops";
import { detectMobileDevice, useIsMobileDevice } from "@/lib/device";
import {
  focusFirstInvalidField,
  quoteStepTargetId,
  scheduleBookingNavAfterRender,
  schedulePreciseResultsScroll,
  type QuoteStepNavTarget,
} from "@/lib/quote-step-nav-scroll";
import { whatsAppChatUrl } from "@/lib/contact-card";
import {
  AIRPORTS,
  isInstantPayVehicle,
  isVehicleEnquiryOnly,
  isVehicleRequestQuote,
  MAX_ONLINE_PASSENGERS,
  MINIBUS_PARTNER_NOTE,
  needsLuggageCapacityConfirmation,
  SERVICE_FLAGS,
  showsOnlineGuidePrice,
  SITE,
  VEHICLE_TYPES,
} from "@/lib/data";
import {
  FIVE_PLUS_PASSENGERS,
  FIVE_PLUS_SUITCASES,
  formatPassengerChoice,
  formatSuitcaseChoice,
  requiresMinibus,
  selectVehicleForParty,
  vehicleShortLabel,
} from "@/lib/vehicle-selection";
import { parseLondonLocalDateTime } from "@/lib/london-time";
import { formatUkDate, formatUkTime, todayLondonDate, nowLondonTime } from "@/lib/format-datetime";
import { BOOKING_FLIGHT_NUMBER_HELPER, resolveJourneyInclusions } from "@/lib/journey-inclusions";
import {
  intentFromDirection,
  isCustomerAirportCode,
  type CustomerAirportCode,
  type QuoteJourneyIntent,
} from "@/lib/quote-journey-intent";

import {
  readPrefillAirport,
  readPrefillQuoteDraft,
  type QuoteDraftPrefill,
} from "@/lib/quote-prefill";
import { readTestBookingPrefill } from "@/lib/test-booking";
import {
  calculateAirportToAirportQuote,
  calculateDublinCityBeyondAirportQuote,
  calculatePointToPointQuote,
  calculateQuote,
  formatQuote,
  arePublicLivePricesEnabled,
  getPublicUnapprovedPriceLabel,
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
import {
  buildPaymentRedirectUrl,
  createPaymentCheckout,
  isSumUpPaymentEnabled,
} from "@/lib/create-payment";
import {
  validatePersonalQuoteCode,
  type PersonalQuotePublicSummary,
} from "@/lib/personal-quote-api";
import SaveQuoteModal from "@/components/SaveQuoteModal";
import {
  buildSaveQuotePayloadFromLiveQuote,
  type BuildSaveQuotePayloadResult,
} from "@/lib/save-quote-payload";
import {
  clearOpenCheckoutSession,
  readBookingFormDraft,
  readOpenCheckoutSession,
  saveBookingFormDraft,
  saveOpenCheckoutSession,
  type OpenCheckoutSession,
} from "@/lib/booking-draft-storage";
import { clearAbandonedQuotePersistence } from "@/lib/reset-quote-journey";
import {
  createPaymentReturnToken,
  savePendingPayment,
} from "@/lib/pending-payment";
import {
  clearConfirmedDropoffPlace,
  clearConfirmedPickupPlace,
  clearDropoffAddressStorage,
  clearPickupAddressStorage,
  DROPOFF_ADDRESS_STORAGE_KEY,
  PICKUP_ADDRESS_STORAGE_KEY,
  readConfirmedDropoffPlace,
  readConfirmedPickupPlace,
  saveConfirmedDropoffPlace,
  saveConfirmedPickupPlace,
  saveDropoffAddressLabel,
  savePickupAddressLabel,
} from "@/lib/address-place-storage";
import { scheduleQuoteLeadAlert } from "@/lib/submit-quote-lead";
import { getPaymentBookingBlockers } from "../../shared/paid-booking-gate";
import FlightNumberField, { formatVerifiedFlightSummary } from "@/components/FlightNumberField";
import GoogleAdsRequestQuote from "@/components/GoogleAdsRequestQuote";
import type { AdsQuotePageType } from "@/lib/google-ads";
import {
  createQuoteTransactionId,
  resetRequestQuoteConversion,
  trackBookingRequestSubmittedBeforeNavigation,
} from "@/lib/google-ads-client";
import type { VerifiedFlight } from "@/lib/flight-lookup";
import {
  detectAirportCodeFromPlace,
  detectJourneyKind,
  emptySelectedPlace,
  isQuoteReadyPlace,
  placeDisplayText,
  placesEqual,
  isDublinCityCorridorJourney,
  isDublinCityNotAirportPlace,
  isOutOfAreaPickup,
  isPlaceSelected,
  isRepublicOfIrelandJourney,
  journeyKindLabel,
  needsManualQuoteApproval,
  PLACES_LOOKUP_A2A,
  quickSelectToPlace,
  type JourneyKind,
  type QuickSelectAirportCode,
  type SelectedPlace,
} from "@/lib/selected-place";

const IS_A2A_PRIMARY = SERVICE_FLAGS.addressToAddress;

type TripMode = "airport" | "address";
type TripDirection = "to-airport" | "from-airport";

const PICKUP_STORAGE_KEY = PICKUP_ADDRESS_STORAGE_KEY;
const DROPOFF_STORAGE_KEY = DROPOFF_ADDRESS_STORAGE_KEY;

const BOOKING_PANEL_CLASS =
  "rounded-xl border border-white/25 bg-navy-light px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-5 md:border-white/30 md:shadow-lg md:shadow-black/20";
const BOOKING_LABEL_CLASS =
  "mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/80";
const BOOKING_INPUT_CLASS =
  "quote-text-input h-12 rounded-xl border border-white/25 bg-navy-dark px-4 text-white placeholder:text-white/45 outline-none transition-colors focus:border-emerald focus:ring-2 focus:ring-inset focus:ring-emerald/25 md:border-white/30";
const BOOKING_HELPER_CLASS = "quote-helper-text mt-1.5 text-xs text-white/55";

const ESTATE = "Estate Car (1–4 passengers)" as const;

/** Instant online booking covers Saloon, Estate, and Minibus (existing pricing). */
/** Quote form “5–7” tap uses sentinel value 5. */
const SELECTOR_MAX_PASSENGERS = FIVE_PLUS_PASSENGERS;
const SELECTOR_MAX_SUITCASES = FIVE_PLUS_SUITCASES;

const CAPACITY_WHATSAPP_MESSAGE =
  "Hi, I need help with a minibus booking (5–7 passengers or extra luggage).";

type VehicleType = (typeof VEHICLE_TYPES)[number];

/** Previously blocked 5–7 from online fares; Minibus is bookable online again. */
function exceedsOnlineVehicleOptions(_passengers: number, _suitcases: number): boolean {
  void _passengers;
  void _suitcases;
  return false;
}

/** True only when the customer has deliberately chosen both party fields. */
function isPartySelectionComplete(
  passengers: number | null,
  suitcases: number | null,
  exactPassengers: number | null,
): boolean {
  if (passengers == null || suitcases == null) return false;
  if (passengers >= FIVE_PLUS_PASSENGERS) {
    return (
      exactPassengers != null &&
      Number.isInteger(exactPassengers) &&
      exactPassengers >= 5 &&
      exactPassengers <= 7
    );
  }
  return Number.isInteger(passengers) && passengers >= 1 && passengers <= 4 && suitcases >= 0;
}

function effectivePartyPassengers(
  passengers: number | null,
  exactPassengers: number | null,
): number | null {
  if (passengers == null) return null;
  if (passengers >= FIVE_PLUS_PASSENGERS) {
    return exactPassengers != null && exactPassengers >= 5 && exactPassengers <= 7
      ? exactPassengers
      : null;
  }
  return passengers;
}

function getAutoVehicle(passengers: number, suitcases: number, _a2aPrimary = false): VehicleType {
  void _a2aPrimary;
  return selectVehicleForParty(passengers, suitcases);
}

function TapChoiceRow({
  label,
  options,
  value,
  onChange,
  formatOption,
}: {
  label: string;
  options: number[];
  value: number | null;
  onChange: (value: number) => void;
  formatOption?: (value: number) => string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">{label}</p>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const selected = value !== null && value === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option)}
              className={`min-h-12 rounded-xl text-base font-semibold transition-all lg:min-h-11 ${
                selected
                  ? "bg-emerald text-navy shadow-sm"
                  : "border border-white/15 bg-white/5 text-white/85 hover:border-emerald/40 hover:text-white"
              }`}
            >
              {formatOption ? formatOption(option) : String(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatDisplayDate(date: string): string {
  return formatUkDate(date);
}

function formatDisplayTime(time: string): string {
  return formatUkTime(time);
}

function PriceInclusionBlock({
  isAirportTrip,
  isFromAirport,
  returnJourney,
  airportCode,
  addressToAddress,
  guideSuffix,
}: {
  isAirportTrip: boolean;
  isFromAirport: boolean;
  returnJourney: boolean;
  airportCode?: string | null;
  addressToAddress?: boolean;
  guideSuffix?: string;
}) {
  const inclusions = resolveJourneyInclusions({
    isAirportTrip,
    isFromAirport,
    returnJourney,
    airportCode,
    addressToAddress,
  });

  return (
    <div className="mt-3 text-xs leading-relaxed text-white/60">
      <p>
        {inclusions.summary}
        {guideSuffix ? ` ${guideSuffix}` : ""}
      </p>
      {returnJourney && inclusions.outboundBullets.length > 0 ? (
        <div className="mt-2 space-y-2">
          <div>
            <p className="font-semibold text-white/70">Outbound</p>
            <ul className="mt-1 space-y-1">
              {inclusions.outboundBullets.map((bullet) => (
                <li key={`out-${bullet}`}>{bullet}</li>
              ))}
            </ul>
          </div>
          {inclusions.returnBullets.length > 0 && (
            <div>
              <p className="font-semibold text-white/70">Return</p>
              <ul className="mt-1 space-y-1">
                {inclusions.returnBullets.map((bullet) => (
                  <li key={`ret-${bullet}`}>{bullet}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : inclusions.bullets.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {inclusions.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
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
  /** Optional A2A drop-off hint (e.g. event venue). User should still pick a Places suggestion. */
  initialDropoffHint?: string;
  /** Ads page_type custom parameter (e.g. emerge_belfast). */
  pageType?: AdsQuotePageType;
  /** Cap passenger selector (EMERGE online capacity is 4). */
  maxPassengers?: number;
};

function QuoteCard({
  initialAirportCode = "",
  initialDirection = "to-airport",
  initialAddressHint = "",
  initialDropoffHint = "",
  pageType = "main",
  maxPassengers = MAX_ONLINE_PASSENGERS,
}: QuoteCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const step1JourneyRef = useRef<HTMLDivElement>(null);
  const step2TravelDetailsRef = useRef<HTMLDivElement>(null);
  const step3CustomerDetailsRef = useRef<HTMLDivElement>(null);
  const step3PaymentActionsRef = useRef<HTMLDivElement>(null);
  const shortNoticeResultRef = useRef<HTMLDivElement>(null);
  /** Scroll once when availability-confirmation result first appears (not on re-renders). */
  const pendingShortNoticeScrollRef = useRef(false);
  /** Set only by explicit Book Now / Continue / Back — never by quote re-renders. */
  const pendingQuoteStepNavScrollRef = useRef<QuoteStepNavTarget | null>(null);
  const passengerLimit = Math.min(
    Math.max(1, maxPassengers),
    SELECTOR_MAX_PASSENGERS,
    MAX_ONLINE_PASSENGERS,
  );
  const isMobileDevice = useIsMobileDevice();
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [bookingSent, setBookingSent] = useState(false);
  const [bookingReference, setBookingReference] = useState("");
  const [quoteTransactionId, setQuoteTransactionId] = useState("");
  const quoteCalculationFingerprintRef = useRef("");
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
  const initialAirportPlace = isCustomerAirportCode(initialAirportCode)
    ? quickSelectToPlace(initialAirportCode)
    : null;
  const [pickupAddress, setPickupAddress] = useState(
    initialDirection === "from-airport" && initialAirportPlace
      ? initialAirportPlace.displayAddress || initialAirportPlace.formattedAddress
      : initialDirection === "to-airport"
        ? initialAddressHint
        : "",
  );
  const [dropoffAddress, setDropoffAddress] = useState(
    initialDropoffHint ||
      (initialDirection === "to-airport" && initialAirportPlace
        ? initialAirportPlace.displayAddress || initialAirportPlace.formattedAddress
        : initialDirection === "from-airport"
          ? initialAddressHint
          : ""),
  );
  const [pickupPlace, setPickupPlace] = useState<SelectedPlace>(() =>
    initialDirection === "from-airport" && initialAirportPlace
      ? initialAirportPlace
      : emptySelectedPlace(),
  );
  const [dropoffPlace, setDropoffPlace] = useState<SelectedPlace>(() =>
    initialDirection === "to-airport" && initialAirportPlace
      ? initialAirportPlace
      : emptySelectedPlace(),
  );
  const [pickupPlaceError, setPickupPlaceError] = useState("");
  const [dropoffPlaceError, setDropoffPlaceError] = useState("");
  const [pickupRestoredHint, setPickupRestoredHint] = useState(false);
  const [dropoffRestoredHint, setDropoffRestoredHint] = useState(false);
  /** Explicit One Way / Return — null until the customer taps a choice. */
  const [journeyMode, setJourneyMode] = useState<"one-way" | "return" | null>(null);
  const returnJourney = journeyMode === "return";
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
  const [passengers, setPassengers] = useState<number | null>(null);
  const [suitcases, setSuitcases] = useState<number | null>(null);
  const [exactPassengers, setExactPassengers] = useState<number | null>(null);
  const [saveQuoteOpen, setSaveQuoteOpen] = useState(false);
  const [saveQuotePrompt, setSaveQuotePrompt] = useState("");
  const [journeyIntent, setJourneyIntent] = useState<QuoteJourneyIntent | null>(() => {
    if (isCustomerAirportCode(initialAirportCode)) {
      return intentFromDirection(initialDirection);
    }
    if (initialAddressHint || initialDropoffHint) {
      return initialDirection === "from-airport" || initialDirection === "to-airport"
        ? intentFromDirection(initialDirection)
        : "address-to-address";
    }
    return null;
  });
  const [intentAirportCode, setIntentAirportCode] = useState<CustomerAirportCode | "">(() => {
    if (isCustomerAirportCode(initialAirportCode)) {
      return initialAirportCode;
    }
    return "";
  });
  const [routeMetrics, setRouteMetrics] = useState<TripRouteMetrics | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [openCheckout, setOpenCheckout] = useState<OpenCheckoutSession | null>(null);
  const [paymentPopupBlocked, setPaymentPopupBlocked] = useState(false);
  const [shortNoticeResult, setShortNoticeResult] = useState<{
    reference: string;
    whatsappUrl: string;
    amountLabel?: string;
  } | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [testChargeAmount, setTestChargeAmount] = useState<number | null>(null);
  const [testBookingLabel, setTestBookingLabel] = useState<string | null>(null);
  const [appliedPersonalQuote, setAppliedPersonalQuote] =
    useState<PersonalQuotePublicSummary | null>(null);
  const handleRouteMetrics = useCallback((metrics: TripRouteMetrics | null) => {
    setRouteMetrics(metrics);
  }, []);

  const quoteVehicle = vehicle;
  const isEnquiryOnly = isVehicleEnquiryOnly(quoteVehicle);
  const isRequestQuote = isVehicleRequestQuote(quoteVehicle);
  const showGuidePrice = showsOnlineGuidePrice(quoteVehicle);
  const capacityNeedsConfirm =
    passengers != null &&
    suitcases != null &&
    needsLuggageCapacityConfirmation(
      effectivePartyPassengers(passengers, exactPassengers) ?? passengers,
      suitcases,
    );
  const [capacityConfirmed, setCapacityConfirmed] = useState(false);
  const [confirmStartNewQuote, setConfirmStartNewQuote] = useState(false);
  /** Bumped on Start a New Quote so address inputs remount with clean internal state. */
  const [formResetKey, setFormResetKey] = useState(0);

  useEffect(() => {
    const pax = effectivePartyPassengers(passengers, exactPassengers);
    if (pax == null || suitcases == null) {
      return;
    }
    setVehicle(getAutoVehicle(pax, suitcases, IS_A2A_PRIMARY));
  }, [passengers, suitcases, exactPassengers]);
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
    isRepublicOfIrelandJourney(pickupPlace, dropoffPlace) &&
    !isDublinCityCorridorJourney(pickupPlace, dropoffPlace);
  const isDublinCityCorridor =
    isA2AFlow &&
    isPlaceSelected(pickupPlace) &&
    isPlaceSelected(dropoffPlace) &&
    isDublinCityCorridorJourney(pickupPlace, dropoffPlace);
  const isManualQuoteJourney =
    isA2AFlow &&
    isPlaceSelected(pickupPlace) &&
    isPlaceSelected(dropoffPlace) &&
    needsManualQuoteApproval(pickupPlace, dropoffPlace);
  /** Owner gate in pricing-config.json — no live £ until rules are approved. */
  const pricingConfirmationRequired = !arePublicLivePricesEnabled();
  const priceConfirmationLabel = getPublicUnapprovedPriceLabel();
  /** Amber banner only when an out-of-area pickup still needs manual approval. */
  const isOutOfAreaPickupJourney =
    isManualQuoteJourney && isOutOfAreaPickup(pickupPlace);
  const showsRequestQuoteFlow =
    isRequestQuote || isManualQuoteJourney || pricingConfirmationRequired;
  const effectiveAirportCode = isA2AFlow
    ? pickupAirportCode || dropoffAirportCode || ""
    : airportCode;
  const isFromAirport = isA2AFlow
    ? Boolean(pickupAirportCode)
    : tripDirection === "from-airport";
  /** Airport fee wording applies to classic airport trips and A2A legs that touch an airport. */
  const isAirportLegForInclusions =
    isAirportTrip ||
    journeyKind === "address-to-airport" ||
    journeyKind === "airport-to-address" ||
    Boolean(pickupAirportCode || dropoffAirportCode);
  const isAddressToAddressInclusions = !isAirportLegForInclusions;
  const addressLookupCode = isA2AFlow
    ? PLACES_LOOKUP_A2A
    : isAirportTrip
      ? airportCode
      : "BFS";

  useEffect(() => {
    // Instant online path is 1–4. Group / 5–7 uses exact passenger counts (max 7).
    if (passengers == null) return;
    if (passengers >= FIVE_PLUS_PASSENGERS) {
      if (passengers > MAX_ONLINE_PASSENGERS) {
        setPassengers(MAX_ONLINE_PASSENGERS);
        setExactPassengers(MAX_ONLINE_PASSENGERS);
      }
      return;
    }
    if (passengers > passengerLimit) {
      setPassengers(passengerLimit);
    }
  }, [passengerLimit, passengers]);

  useEffect(() => {
    if (suitcases == null) return;
    if (suitcases > SELECTOR_MAX_SUITCASES) {
      setSuitcases(SELECTOR_MAX_SUITCASES);
    }
  }, [suitcases]);

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
    // Keep dedicated landing-page address hints (e.g. Bangor / event venues) over stale localStorage.
    // Also keep the route-page airport place so transfer landings stay preselected.
    const keepInitialPickup =
      (initialDirection === "to-airport" && Boolean(initialAddressHint)) ||
      (initialDirection === "from-airport" && isCustomerAirportCode(initialAirportCode));
    const keepInitialDropoff =
      Boolean(initialDropoffHint) ||
      (initialDirection === "from-airport" && Boolean(initialAddressHint)) ||
      (initialDirection === "to-airport" && isCustomerAirportCode(initialAirportCode));
    if (savedPickup && !keepInitialPickup) {
      setPickupAddress(savedPickup);
    }
    if (savedDropoff && !keepInitialDropoff) {
      setDropoffAddress(savedDropoff);
    }

    // Restore previously confirmed autocomplete places (placeId + coords) so the
    // customer can continue without tapping the same suggestion again.
    if (!keepInitialPickup) {
      const storedPickupPlace = readConfirmedPickupPlace();
      if (storedPickupPlace) {
        setPickupPlace(storedPickupPlace);
        setPickupAddress(
          storedPickupPlace.displayAddress ||
            storedPickupPlace.formattedAddress ||
            savedPickup ||
            "",
        );
        setPickupRestoredHint(true);
      }
    }
    if (!keepInitialDropoff) {
      const storedDropoffPlace = readConfirmedDropoffPlace();
      if (storedDropoffPlace) {
        setDropoffPlace(storedDropoffPlace);
        setDropoffAddress(
          storedDropoffPlace.displayAddress ||
            storedDropoffPlace.formattedAddress ||
            savedDropoff ||
            "",
        );
        setDropoffRestoredHint(true);
      }
    }

    // Restore quote + customer details after SumUp tab switches / accidental reloads.
    const draft = readBookingFormDraft();
    if (draft && !testBooking) {
      if (draft.pickupAddress?.trim() && !keepInitialPickup) {
        setPickupAddress(draft.pickupAddress);
      }
      if (draft.dropoffAddress?.trim() && !keepInitialDropoff) {
        setDropoffAddress(draft.dropoffAddress);
      }
      if (draft.pickupPlace && isQuoteReadyPlace(draft.pickupPlace) && !keepInitialPickup) {
        setPickupPlace(draft.pickupPlace);
        setPickupRestoredHint(true);
      }
      if (draft.dropoffPlace && isQuoteReadyPlace(draft.dropoffPlace) && !keepInitialDropoff) {
        setDropoffPlace(draft.dropoffPlace);
        setDropoffRestoredHint(true);
      }
      if (draft.tripDate) setTripDate(draft.tripDate);
      if (draft.tripTime) setTripTime(draft.tripTime);
      if (typeof draft.returnJourney === "boolean") {
        setJourneyMode(draft.returnJourney ? "return" : "one-way");
      }
      if (draft.journeyMode === "one-way" || draft.journeyMode === "return") {
        setJourneyMode(draft.journeyMode);
      }
      if (draft.returnDate) setReturnDate(draft.returnDate);
      if (draft.returnTime) setReturnTime(draft.returnTime);
      if (typeof draft.passengers === "number" && draft.passengers > 0) {
        setPassengers(draft.passengers);
      }
      if (typeof draft.suitcases === "number" && draft.suitcases >= 0) {
        setSuitcases(draft.suitcases);
      }
      if (draft.exactPassengers != null) setExactPassengers(draft.exactPassengers);
      if (
        draft.vehicle &&
        (VEHICLE_TYPES as readonly string[]).includes(String(draft.vehicle))
      ) {
        setVehicle(draft.vehicle as VehicleType);
      }
      if (draft.customerName) setCustomerName(draft.customerName);
      if (draft.customerEmail) setCustomerEmail(draft.customerEmail);
      if (draft.customerMobile) setCustomerMobile(draft.customerMobile);
      if (draft.goingFlightNumber) setGoingFlightNumber(draft.goingFlightNumber);
      if (draft.collectionFlightNumber) setCollectionFlightNumber(draft.collectionFlightNumber);
      if (draft.journeyIntent) setJourneyIntent(draft.journeyIntent);
      if (draft.intentAirportCode) setIntentAirportCode(draft.intentAirportCode);
      if (typeof draft.termsAccepted === "boolean") setTermsAccepted(draft.termsAccepted);
      if (typeof draft.marketingOptIn === "boolean") setMarketingOptIn(draft.marketingOptIn);
      if (draft.personalQuoteCode?.trim()) {
        const code = draft.personalQuoteCode.trim().toUpperCase();
        // Re-validate from server — never trust a cached agreed amount from sessionStorage.
        // Public quote tool no longer offers manual code entry; this restores a code already
        // stored in the booking draft (e.g. mid-session). Direct personal/quick quote links
        // use their own pages.
        void validatePersonalQuoteCode(code)
          .then((quote) => {
            setAppliedPersonalQuote(quote);
          })
          .catch(() => {
            setAppliedPersonalQuote(null);
          });
      }
      if (draft.quoteStep === 1 || draft.quoteStep === 2 || draft.quoteStep === 3) {
        setQuoteStep(draft.quoteStep);
      }
    }

    const existingCheckout = readOpenCheckoutSession();
    if (existingCheckout) {
      setOpenCheckout(existingCheckout);
    }
  }, [initialAddressHint, initialAirportCode, initialDirection, initialDropoffHint]);

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
          if (isCustomerAirportCode(code)) {
            setIntentAirportCode(code);
            setJourneyIntent(intentFromDirection(initialDirection));
            setAirportCode(code);
          }
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
        setJourneyIntent(intentFromDirection(draft.direction));
      }
      if (draft.airportCode && AIRPORTS.some((airport) => airport.code === draft.airportCode)) {
        setAirportCode(draft.airportCode);
        if (isCustomerAirportCode(draft.airportCode)) {
          setIntentAirportCode(draft.airportCode);
          const place = quickSelectToPlace(draft.airportCode);
          if (place && IS_A2A_PRIMARY) {
            if (draft.direction === "from-airport") {
              handlePickupPlaceSelect(place);
            } else {
              handleDropoffPlaceSelect(place);
            }
          }
        }
      }
      if (draft.address?.trim()) {
        if (draft.direction === "from-airport") {
          setDropoffAddress(draft.address.trim());
        } else {
          setPickupAddress(draft.address.trim());
        }
      }
      if (typeof draft.returnJourney === "boolean") {
        setJourneyMode(draft.returnJourney ? "return" : "one-way");
      }
      if (draft.journeyMode === "one-way" || draft.journeyMode === "return") {
        setJourneyMode(draft.journeyMode);
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

  const partySelectionReady = isPartySelectionComplete(passengers, suitcases, exactPassengers);
  const effectivePassengers = effectivePartyPassengers(passengers, exactPassengers);
  const quoteChoicesReady = journeyMode !== null && partySelectionReady;

  const hasCompatibleVehicle = quoteChoicesReady && Boolean(quoteVehicle);

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
              : journeyMode == null
                ? "Choose One way or Return to continue."
                : !hasCompatibleVehicle
                ? "Select passengers and luggage to continue."
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

  // Fixed price only after route + deliberate journey mode, passengers AND suitcases.
  const exceedsOnlineCapacity =
    quoteChoicesReady &&
    effectivePassengers != null &&
    suitcases != null &&
    exceedsOnlineVehicleOptions(effectivePassengers, suitcases);
  const isMinibusParty =
    quoteChoicesReady &&
    effectivePassengers != null &&
    suitcases != null &&
    requiresMinibus(effectivePassengers, suitcases);
  const canShowPrice = hasQuoteRoute && quoteChoicesReady && !exceedsOnlineCapacity;

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
    // Do not invent or show live fares until pricing rules are owner-approved.
    if (!canShowPrice || isManualQuoteJourney || pricingConfirmationRequired) {
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
          routeMetrics,
          false,
        );
      }
      if (journeyKind === "airport-to-address" && pickupAirportCode) {
        return calculateQuote(
          dropoffAddress,
          pickupAirportCode,
          quoteVehicle,
          returnJourney,
          schedule,
          routeMetrics,
          true,
        );
      }
      if (
        journeyKind === "airport-to-airport" &&
        pickupAirportCode &&
        dropoffAirportCode
      ) {
        return calculateAirportToAirportQuote(
          pickupAirportCode,
          dropoffAirportCode,
          pickupAddress,
          dropoffAddress,
          quoteVehicle,
          returnJourney,
          schedule,
          routeMetrics,
        );
      }
      if (!routeMetrics) {
        return null;
      }
      if (isDublinCityCorridor) {
        const niAddress = isDublinCityNotAirportPlace(dropoffPlace)
          ? pickupAddress
          : dropoffAddress;
        return calculateDublinCityBeyondAirportQuote(
          niAddress,
          quoteVehicle,
          routeMetrics,
          returnJourney,
          schedule,
        );
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
      return calculateQuote(
        quoteAddress,
        airportCode,
        quoteVehicle,
        returnJourney,
        schedule,
        routeMetrics,
        isFromAirport,
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
  }, [
    airportCode,
    canShowPrice,
    dropoffAddress,
    dropoffAirportCode,
    isA2AFlow,
    isAirportTrip,
    isDublinCityCorridor,
    isEnquiryOnly,
    isManualQuoteJourney,
    pricingConfirmationRequired,
    journeyKind,
    pickupAddress,
    pickupAirportCode,
    pickupPlace,
    dropoffPlace,
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

  /** Pay online at quote time — saloon/estate/minibus when SumUp enabled. */
  const canPayNowOnline =
    SERVICE_FLAGS.customerSumUpPay &&
    isSumUpPaymentEnabled() &&
    !isEnquiryOnly &&
    !isManualQuoteJourney &&
    !pricingConfirmationRequired &&
    isInstantPayVehicle(quoteVehicle) &&
    Boolean(liveQuote);

  /**
   * Complete results (route + vehicle + price) ready to show and scroll once.
   * Waits for distance, time, and live fare (or request-quote paths) after all choices.
   */
  const quoteResultsReady =
    quoteChoicesReady &&
    hasQuoteRoute &&
    Boolean(journeyDistanceLabel) &&
    Boolean(journeyDurationLabel) &&
    (Boolean(liveQuote) ||
      pricingConfirmationRequired ||
      isManualQuoteJourney ||
      exceedsOnlineCapacity ||
      isEnquiryOnly);

  const addressesReadyForRoute = isA2AFlow
    ? isPlaceSelected(pickupPlace) && isPlaceSelected(dropoffPlace)
    : hasQuoteRoute;

  function clearDownstreamQuoteChoices() {
    setJourneyMode(null);
    setPassengers(null);
    setSuitcases(null);
    setExactPassengers(null);
    setRouteMetrics(null);
  }

  function handlePickupChange(value: string) {
    setPickupAddress(value);
    setPickupRestoredHint(false);
    if (isA2AFlow) {
      const hadConfirmed = isPlaceSelected(pickupPlace);
      setPickupPlace(emptySelectedPlace());
      setPickupPlaceError("");
      clearConfirmedPickupPlace();
      if (hadConfirmed) {
        clearDownstreamQuoteChoices();
      }
    }
    if (value.trim()) {
      savePickupAddressLabel(value);
    } else {
      clearPickupAddressStorage();
    }
  }

  function handleDropoffChange(value: string) {
    setDropoffAddress(value);
    setDropoffRestoredHint(false);
    if (isA2AFlow) {
      const hadConfirmed = isPlaceSelected(dropoffPlace);
      setDropoffPlace(emptySelectedPlace());
      setDropoffPlaceError("");
      clearConfirmedDropoffPlace();
      if (hadConfirmed) {
        clearDownstreamQuoteChoices();
      }
    }
    if (value.trim()) {
      saveDropoffAddressLabel(value);
    } else {
      clearDropoffAddressStorage();
    }
  }

  function handlePickupPlaceSelect(place: SelectedPlace) {
    const addressChanged = Boolean(place.placeId?.trim()) && place.placeId !== pickupPlace.placeId;
    setPickupPlace(place);
    setPickupPlaceError("");
    // Typing clears placeId — address was already set via onChange; do not rewrite/trim
    // the visible field (that was collapsing "24 Colinward" → "24Colinward").
    if (!place.placeId?.trim()) {
      setPickupRestoredHint(false);
      clearConfirmedPickupPlace();
      return;
    }
    // Prefer exact display/formatted text — never trim here (trailing space after a
    // house number must remain while the customer is still typing).
    const display = place.displayAddress || place.formattedAddress || placeDisplayText(place);
    setPickupAddress(display);
    setPickupRestoredHint(false);
    if (isQuoteReadyPlace(place)) {
      saveConfirmedPickupPlace(place);
    } else if (display.trim()) {
      savePickupAddressLabel(display);
      clearConfirmedPickupPlace();
    }
    if (addressChanged) {
      clearDownstreamQuoteChoices();
    }
  }

  function handleDropoffPlaceSelect(place: SelectedPlace) {
    const addressChanged = Boolean(place.placeId?.trim()) && place.placeId !== dropoffPlace.placeId;
    setDropoffPlace(place);
    setDropoffPlaceError("");
    if (!place.placeId?.trim()) {
      setDropoffRestoredHint(false);
      clearConfirmedDropoffPlace();
      return;
    }
    const display = place.displayAddress || place.formattedAddress || placeDisplayText(place);
    setDropoffAddress(display);
    setDropoffRestoredHint(false);
    if (isQuoteReadyPlace(place)) {
      saveConfirmedDropoffPlace(place);
    } else if (display.trim()) {
      saveDropoffAddressLabel(display);
      clearConfirmedDropoffPlace();
    }
    if (addressChanged) {
      clearDownstreamQuoteChoices();
    }
  }

  function applyJourneyIntent(intent: QuoteJourneyIntent) {
    if (intent !== journeyIntent) {
      clearDownstreamQuoteChoices();
    }
    setJourneyIntent(intent);
    setTripMode("address");
    if (intent === "to-airport") {
      setTripDirection("to-airport");
      if (intentAirportCode) {
        const place = quickSelectToPlace(intentAirportCode);
        if (place) {
          handleDropoffPlaceSelect(place);
          setAirportCode(intentAirportCode);
        }
      }
    } else if (intent === "from-airport") {
      setTripDirection("from-airport");
      if (intentAirportCode) {
        const place = quickSelectToPlace(intentAirportCode);
        if (place) {
          handlePickupPlaceSelect(place);
          setAirportCode(intentAirportCode);
        }
      }
    } else {
      setIntentAirportCode("");
      if (detectAirportCodeFromPlace(pickupPlace)) {
        setPickupPlace(emptySelectedPlace());
        setPickupAddress("");
        setPickupRestoredHint(false);
        clearPickupAddressStorage();
      }
      if (detectAirportCodeFromPlace(dropoffPlace)) {
        setDropoffPlace(emptySelectedPlace());
        setDropoffAddress("");
        setDropoffRestoredHint(false);
        clearDropoffAddressStorage();
      }
    }
  }

  function applyIntentAirport(code: CustomerAirportCode) {
    const place = quickSelectToPlace(code);
    if (!place) {
      return;
    }
    if (code !== intentAirportCode) {
      clearDownstreamQuoteChoices();
    }
    setIntentAirportCode(code);
    setAirportCode(code);
    const intent = journeyIntent ?? (tripDirection === "from-airport" ? "from-airport" : "to-airport");
    if (intent === "from-airport") {
      handlePickupPlaceSelect(place);
      setTripDirection("from-airport");
      setJourneyIntent("from-airport");
    } else {
      handleDropoffPlaceSelect(place);
      setTripDirection("to-airport");
      setJourneyIntent("to-airport");
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
    ? placeDisplayText(pickupPlace) || pickupAddress.trim()
    : isAirportTrip
      ? isFromAirport
        ? airportName
        : pickupAddress.trim()
      : pickupAddress.trim();

  const dropoffLabel = isA2AFlow
    ? placeDisplayText(dropoffPlace) || dropoffAddress.trim()
    : isAirportTrip
      ? isFromAirport
        ? dropoffAddress.trim()
        : airportName
      : dropoffAddress.trim();

  const quoteAnalyticsValue =
    quoteResultsReady &&
    liveQuote &&
    testChargeAmount === null &&
    !isRequestQuote &&
    !isEnquiryOnly &&
    !isManualQuoteJourney &&
    !pricingConfirmationRequired &&
    !exceedsOnlineCapacity
      ? (appliedPersonalQuote?.agreedAmount ?? liveQuote.amount)
      : null;
  const quoteAnalyticsJourneyType =
    isA2AFlow && journeyKind
      ? journeyKindLabel(journeyKind)
      : isAirportTrip
        ? isFromAirport
          ? "Airport pickup"
          : "Airport drop-off"
        : "Address to address";
  const quoteCalculationFingerprint =
    quoteAnalyticsValue && effectivePassengers != null
      ? JSON.stringify([
          pickupLabel,
          dropoffLabel,
          effectiveAirportCode,
          quoteAnalyticsJourneyType,
          effectivePassengers,
          suitcases,
          returnJourney,
          quoteVehicle,
          quoteAnalyticsValue,
        ])
      : "";

  useEffect(() => {
    // The result must actually be visible. Moving to later form steps keeps the
    // same quote ID; returning with a changed calculation creates a new one.
    if (quoteStep !== 1) return;
    if (!quoteCalculationFingerprint) {
      quoteCalculationFingerprintRef.current = "";
      if (quoteTransactionId) setQuoteTransactionId("");
      return;
    }
    if (quoteCalculationFingerprintRef.current === quoteCalculationFingerprint) return;
    quoteCalculationFingerprintRef.current = quoteCalculationFingerprint;
    setQuoteTransactionId(
      createQuoteTransactionId(pageType === "emerge_belfast" ? "emerge" : "quote"),
    );
  }, [pageType, quoteCalculationFingerprint, quoteStep, quoteTransactionId]);

  useEffect(() => {
    if (!liveQuote || bookingSent || quoteStep !== 1) {
      return;
    }

    // Fire as soon as a live price is shown — date/time may still be empty.
    if (tripDate && !isTripDateOnOrAfterToday(tripDate)) {
      return;
    }
    if (returnJourney && tripDate && tripTime && returnDate && returnTime) {
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
      tripDate: tripDate || undefined,
      tripTime: tripTime || undefined,
      returnDate: returnJourney ? returnDate || undefined : undefined,
      returnTime: returnJourney ? returnTime || undefined : undefined,
      passengers: effectivePassengers as number,
      suitcases: suitcases as number,
      vehicle: quoteVehicle,
      estimatedPrice: formatQuote(liveQuote.amount),
      journeyDistance: journeyDistanceLabel || undefined,
      journeyDuration: journeyDurationLabel || undefined,
      isAirportTrip,
    });
  }, [
    bookingSent,
    dropoffLabel,
    effectivePassengers,
    isAirportTrip,
    isFromAirport,
    journeyDistanceLabel,
    journeyDurationLabel,
    liveQuote,
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
      // After React paints the error state, focus/scroll the first invalid field.
      window.setTimeout(() => {
        const root = document.getElementById("quoteForm") ?? document.getElementById("quote");
        focusFirstInvalidField(root);
      }, 0);
      return false;
    }

    if (ldyServiceAreaInvalid) {
      return false;
    }

    if (!hasCompatibleVehicle) {
      return false;
    }

    if (isEnquiryOnly || isManualQuoteJourney || pricingConfirmationRequired) {
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

    if (!ok) {
      window.setTimeout(() => {
        const root = document.getElementById("step3-customer-details") ?? document.getElementById("quoteForm");
        focusFirstInvalidField(root);
      }, 0);
    }

    return ok;
  }

  function buildBookingDetails(): BookingDetails {
    const tripLabel = exceedsOnlineCapacity
      ? "Minibus — 5–7 passenger quote request"
      : isOutOfAreaPickupJourney
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

    const estimatedPrice = exceedsOnlineCapacity
      ? null
      : pricingConfirmationRequired
      ? priceConfirmationLabel
      : liveQuote
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
      passengers: effectivePassengers as number,
      suitcases: suitcases as number,
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
      cancellationPolicyVersion: CANCELLATION_POLICY_VERSION,
      ...buildMarketingOptInFields(marketingOptIn),
    };
  }

  function buildSaveQuotePayload(
    scheduleOverride?: {
      tripDate: string;
      tripTime: string;
      returnDate: string;
      returnTime: string;
    },
  ): BuildSaveQuotePayloadResult {
    const details = buildBookingDetails();
    const date = (scheduleOverride?.tripDate || tripDate).trim();
    const time = (scheduleOverride?.tripTime || tripTime).trim();
    const retDate = scheduleOverride?.returnDate || returnDate;
    const retTime = scheduleOverride?.returnTime || returnTime;

    return buildSaveQuotePayloadFromLiveQuote({
      liveQuote: liveQuote
        ? {
            amount: liveQuote.amount,
            area: liveQuote.area,
            areaSurcharge: liveQuote.areaSurcharge,
            airportBase: liveQuote.airportBase,
            vehicleMultiplier: liveQuote.vehicleMultiplier,
            vehicleAdjustment: liveQuote.vehicleAdjustment,
            premiumApplied: Boolean(liveQuote.premiumApplied),
            operational: (liveQuote.operational as Record<string, unknown> | null | undefined) ?? null,
          }
        : null,
      canPayNowOnline,
      isEnquiryOnly,
      showsRequestQuoteFlow,
      pickupLabel: details.pickupLabel,
      dropoffLabel: details.dropoffLabel,
      pickupPlaceId: pickupPlace?.placeId || undefined,
      dropoffPlaceId: dropoffPlace?.placeId || undefined,
      pickupLat: typeof pickupPlace?.lat === "number" ? pickupPlace.lat : undefined,
      pickupLng: typeof pickupPlace?.lng === "number" ? pickupPlace.lng : undefined,
      dropoffLat: typeof dropoffPlace?.lat === "number" ? dropoffPlace.lat : undefined,
      dropoffLng: typeof dropoffPlace?.lng === "number" ? dropoffPlace.lng : undefined,
      airportCode: details.airportCode,
      tripDirection: isFromAirport ? "from-airport" : "to-airport",
      isAirportTrip: Boolean(details.isAirportTrip),
      isFromAirport: details.isFromAirport,
      journeyType: details.tripLabel,
      tripDate: date,
      tripTime: time,
      returnJourney,
      returnDate: returnJourney ? retDate : undefined,
      returnTime: returnJourney ? retTime : undefined,
      passengers: details.passengers,
      suitcases: details.suitcases,
      vehicle: details.vehicle,
      flightNumber: details.flightNumber || undefined,
      returnFlightNumber: details.returnFlightNumber || undefined,
      tripLabel: details.tripLabel,
      journeyDistance: details.journeyDistance,
      journeyDuration: details.journeyDuration,
    });
  }

  /** Open Save Quote when a live payable fare exists — date/time are optional. */
  function handleSaveQuoteClick() {
    setSaveQuotePrompt("");
    const schedule = syncScheduleFieldsFromInputs();
    const built = buildSaveQuotePayload(schedule);
    if (built.ok) {
      setSaveQuoteOpen(true);
      return;
    }
    if (built.reason === "missing_route") {
      setSaveQuotePrompt(built.message);
      return;
    }
    setSaveQuotePrompt(built.message);
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
    // Privacy: never put email/mobile in the SumUp description — KV + owner email hold those.
    const namePart = customer ? ` — ${customer}` : "";
    const prefix = testChargeAmount ? "[TEST £1] " : "";
    return `${prefix}${tripSummary} — ${vehicleLabel}${namePart}`.slice(0, 140);
  }

  const paymentAmount =
    testChargeAmount ?? appliedPersonalQuote?.agreedAmount ?? liveQuote?.amount ?? null;

  async function handlePayNow() {
    if (!liveQuote || paymentLoading || !canPayNowOnline) {
      if (!canPayNowOnline) {
        setPaymentError(
          "Online payment is available when an instant fare is shown. Request to book instead and we’ll email a SumUp link once confirmed.",
        );
      }
      return;
    }

    syncScheduleFieldsFromInputs();

    if (!tripDetailsReady) {
      setPaymentError(
        travelDetailsBlocker || "Please complete your journey and travel details before paying.",
      );
      setQuoteStep(hasQuoteRoute ? 2 : 1);
      return;
    }

    if (!validateContactDetails()) {
      setPaymentError("Please enter your full name, mobile number, and email before paying.");
      return;
    }

    clearFlightBlockingErrors();

    if (!requireCapacityConfirmed()) {
      return;
    }

    if (!requireTermsAccepted()) {
      return;
    }

    const bookingDetails = buildConfirmedBookingDetails();
    const blockers = getPaymentBookingBlockers(bookingDetails);
    if (blockers.length > 0) {
      setPaymentError(blockers[0]);
      return;
    }

    // Persist draft + pending payment, then same-tab redirect to SumUp Hosted Checkout.
    // window.open after await is blocked on iPhone Safari (no user-gesture), which looks like a dead button.
    setPaymentLoading(true);
    setPaymentError("");
    setPaymentPopupBlocked(false);

    const amountLabel = formatQuote(paymentAmount ?? liveQuote.amount);

    // Persist before SumUp opens so closing the payment tab cannot wipe the form.
    saveBookingFormDraft({
      quoteStep: 3,
      pickupAddress,
      dropoffAddress,
      pickupPlace,
      dropoffPlace,
      tripDate,
      tripTime,
      ...(journeyMode != null
        ? { returnJourney: journeyMode === "return", journeyMode }
        : {}),
      returnDate,
      returnTime,
      ...(passengers != null ? { passengers } : {}),
      ...(suitcases != null ? { suitcases } : {}),
      exactPassengers,
      vehicle: quoteVehicle,
      customerName,
      customerEmail,
      customerMobile,
      goingFlightNumber,
      collectionFlightNumber,
      journeyIntent,
      intentAirportCode,
      termsAccepted,
      marketingOptIn,
      personalQuoteCode: appliedPersonalQuote?.code,
    });

    try {
      const returnToken = createPaymentReturnToken();
      const checkout = await createPaymentCheckout({
        amount: paymentAmount ?? liveQuote.amount,
        description: buildPaymentDescription(),
        redirectUrl: buildPaymentRedirectUrl(returnToken),
        booking: bookingDetails,
        ...(appliedPersonalQuote && testChargeAmount === null
          ? {
              personalQuoteCode: appliedPersonalQuote.code,
              standardWebsiteAmount: liveQuote.amount,
            }
          : {}),
      });

      if (checkout.shortNotice && checkout.reference && checkout.whatsappUrl) {
        pendingShortNoticeScrollRef.current = true;
        setShortNoticeResult({
          reference: checkout.reference,
          whatsappUrl: checkout.whatsappUrl,
          amountLabel: checkout.amountLabel ?? amountLabel,
        });
        setPaymentLoading(false);
        return;
      }

      if (!checkout.paymentUrl || !checkout.checkoutId) {
        throw new Error("Payment service returned an invalid response");
      }

      savePendingPayment(
        {
          checkoutId: checkout.checkoutId,
          paymentUrl: checkout.paymentUrl,
          checkoutReference: checkout.checkoutReference,
          amountLabel,
          booking: {
            ...bookingDetails,
          },
        },
        returnToken,
      );

      const session: OpenCheckoutSession = {
        paymentUrl: checkout.paymentUrl,
        checkoutId: checkout.checkoutId,
        checkoutReference: checkout.checkoutReference,
        amountLabel,
        returnToken,
        openedAt: new Date().toISOString(),
      };
      saveOpenCheckoutSession(session);
      setOpenCheckout(session);

      if (checkout.bookingSaved === true && checkout.bookingReference) {
        // The Worker has persisted the pending booking. Give the labelled Ads
        // request a brief chance to leave before navigating off-site; tracking
        // failure or blocking must never prevent the customer reaching SumUp.
        await trackBookingRequestSubmittedBeforeNavigation({
          bookingReference: checkout.bookingReference,
          transactionId: checkout.bookingReference,
          airport: bookingDetails.airportCode,
          journeyType: bookingDetails.tripLabel,
          value:
            typeof checkout.amount === "number" && Number.isFinite(checkout.amount)
              ? checkout.amount
              : paymentAmount ?? liveQuote.amount,
          currency: "GBP",
        }).catch(() => false);
      }

      // Same-tab redirect — reliable on iPhone Safari / Android / desktop (no popup).
      window.location.assign(checkout.paymentUrl);
      // Keep loading state until navigation completes; re-enable only if assign somehow fails.
      return;
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "We couldn't start payment. Please try again or contact us to pay.",
      );
      setPaymentLoading(false);
    }
  }

  function handleOpenPaymentAgain() {
    if (!openCheckout?.paymentUrl) {
      void handlePayNow();
      return;
    }
    setPaymentPopupBlocked(false);
    setPaymentError("");
    setPaymentLoading(true);
    window.location.assign(openCheckout.paymentUrl);
  }

  function handleReturnToEditBooking() {
    setPaymentError("");
    setPaymentPopupBlocked(false);
    setQuoteStep(3);
    setSubmitError("");
    setBookingSent(false);
    // Keep openCheckout so “Open payment again” still works with the same SumUp link.
  }

  function handleStartFreshCheckout() {
    clearOpenCheckoutSession();
    setOpenCheckout(null);
    setPaymentPopupBlocked(false);
    setPaymentError("");
  }

  function hasSubstantialQuoteInput(): boolean {
    return (
      isPlaceSelected(pickupPlace) ||
      isPlaceSelected(dropoffPlace) ||
      Boolean(pickupAddress.trim()) ||
      Boolean(dropoffAddress.trim()) ||
      Boolean(tripDate) ||
      Boolean(tripTime) ||
      returnJourney ||
      journeyMode != null ||
      passengers != null ||
      suitcases != null ||
      Boolean(goingFlightNumber.trim()) ||
      Boolean(collectionFlightNumber.trim()) ||
      Boolean(customerName.trim()) ||
      Boolean(customerEmail.trim()) ||
      Boolean(customerMobile.trim()) ||
      Boolean(appliedPersonalQuote) ||
      Boolean(openCheckout) ||
      Boolean(liveQuote) ||
      quoteStep > 1
    );
  }

  /**
   * Abandon the current unconfirmed quote and return to a clean Get a Quote form.
   * Clears QuoteCard React state + quote persistence only — never touches paid bookings.
   */
  function performStartNewQuote() {
    clearAbandonedQuotePersistence();
    resetRequestQuoteConversion();
    setFormResetKey((key) => key + 1);

    const airportPlace = isCustomerAirportCode(initialAirportCode)
      ? quickSelectToPlace(initialAirportCode)
      : null;
    const nextMode: TripMode = IS_A2A_PRIMARY ? "address" : "airport";
    const nextDirection = initialDirection;
    const nextAirport = initialAirportCode;

    setSubmitted(false);
    setSubmitError("");
    setBookingSent(false);
    setBookingReference("");
    quoteCalculationFingerprintRef.current = "";
    setQuoteTransactionId("");
    setBookingDelivery(null);
    setQuoteStep(1);
    setCustomerName("");
    setCustomerMobile("");
    setCustomerEmail("");
    setMobileNumberError("");
    setEmailAddressError("");
    setTripMode(nextMode);
    setTripDirection(nextDirection);
    setAirportCode(nextAirport);
    setPickupAddress(
      nextDirection === "from-airport" && airportPlace
        ? airportPlace.displayAddress || airportPlace.formattedAddress
        : nextDirection === "to-airport"
          ? initialAddressHint
          : "",
    );
    setDropoffAddress(
      initialDropoffHint ||
        (nextDirection === "to-airport" && airportPlace
          ? airportPlace.displayAddress || airportPlace.formattedAddress
          : nextDirection === "from-airport"
            ? initialAddressHint
            : ""),
    );
    setPickupPlace(
      nextDirection === "from-airport" && airportPlace ? airportPlace : emptySelectedPlace(),
    );
    setDropoffPlace(
      nextDirection === "to-airport" && airportPlace ? airportPlace : emptySelectedPlace(),
    );
    setPickupPlaceError("");
    setDropoffPlaceError("");
    setPickupRestoredHint(false);
    setDropoffRestoredHint(false);
    setJourneyMode(null);
    setTripDateError("");
    setReturnDateError("");
    setCustomerNameError("");
    setGoingFlightNumber("");
    setCollectionFlightNumber("");
    setGoingFlightError("");
    setCollectionFlightError("");
    setVerifiedGoingFlight(null);
    setVerifiedCollectionFlight(null);
    setTripDate("");
    setTripTime("");
    setReturnDate("");
    setReturnTime("");
    setVehicle(VEHICLE_TYPES[0]);
    setPassengers(null);
    setSuitcases(null);
    setExactPassengers(null);
    setSaveQuoteOpen(false);
    setSaveQuotePrompt("");
    setJourneyIntent(
      isCustomerAirportCode(initialAirportCode)
        ? intentFromDirection(initialDirection)
        : initialAddressHint || initialDropoffHint
          ? initialDirection === "from-airport" || initialDirection === "to-airport"
            ? intentFromDirection(initialDirection)
            : "address-to-address"
          : null,
    );
    setIntentAirportCode(isCustomerAirportCode(initialAirportCode) ? initialAirportCode : "");
    setRouteMetrics(null);
    setPaymentLoading(false);
    setPaymentError("");
    setOpenCheckout(null);
    setPaymentPopupBlocked(false);
    setShortNoticeResult(null);
    setTermsAccepted(false);
    setTermsError("");
    setMarketingOptIn(false);
    setTestChargeAmount(null);
    setTestBookingLabel(null);
    setAppliedPersonalQuote(null);
    setCapacityConfirmed(false);
    setConfirmStartNewQuote(false);

    // Re-seed landing-page airport place into storage when props provide one.
    if (nextDirection === "from-airport" && airportPlace) {
      saveConfirmedPickupPlace(airportPlace);
    } else if (nextDirection === "to-airport" && airportPlace) {
      saveConfirmedDropoffPlace(airportPlace);
    }

    // Return the customer to the start of the form after reset.
    pendingQuoteStepNavScrollRef.current = 1;
    window.setTimeout(() => {
      scheduleBookingNavAfterRender("quote", { focusHeading: true });
    }, 0);
  }

  function requestStartNewQuote() {
    if (hasSubstantialQuoteInput()) {
      setConfirmStartNewQuote(true);
      return;
    }
    performStartNewQuote();
  }

  function renderStartNewQuoteControls() {
    if (confirmStartNewQuote) {
      return (
        <div
          className="rounded-xl border border-white/20 bg-navy-dark/60 px-4 py-3 text-center"
          role="alertdialog"
          aria-labelledby="start-new-quote-title"
        >
          <p id="start-new-quote-title" className="text-sm font-semibold text-white">
            Start a new quote?
          </p>
          <p className="mt-1 text-xs text-white/60">Your current quote details will be cleared.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={performStartNewQuote}
              className="rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy"
            >
              Start New Quote
            </button>
            <button
              type="button"
              onClick={() => setConfirmStartNewQuote(false)}
              className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/85"
            >
              Keep Current Quote
            </button>
          </div>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={requestStartNewQuote}
        className="w-full text-center text-sm font-medium text-white/55 underline-offset-2 transition-colors hover:text-white/80 hover:underline"
      >
        Start a New Quote
      </button>
    );
  }

  async function confirmBooking(delivery: BookingDelivery) {
    if (submitted || bookingSent) {
      return;
    }
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
      if (isEnquiryOnly || isManualQuoteJourney || pricingConfirmationRequired || exceedsOnlineCapacity) {
        const enquiryMessage = exceedsOnlineCapacity
          ? buildGroupQuoteRequestMessage(details)
          : buildEnquiryBookingMessage(details);
        const subject = exceedsOnlineCapacity
          ? `5–7 PASSENGER / MINIBUS QUOTE REQUEST — ${details.customerName}`
          : pricingConfirmationRequired
          ? `Price confirmation request — ${details.customerName}`
          : isOutOfAreaPickupJourney
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

    const adsQuoteId =
      reference?.trim() ||
      quoteTransactionId ||
      createQuoteTransactionId(pageType === "emerge_belfast" ? "emerge" : "quote");
    setQuoteTransactionId(adsQuoteId);
    setBookingDelivery(delivery);
    setBookingSent(true);
    setSubmitted(false);

    if (details.marketingOptIn) {
      void recordMarketingOptIn({
        email: details.customerEmail,
        name: details.customerName,
        source: isManualQuoteJourney || isEnquiryOnly || pricingConfirmationRequired ? "vehicle-enquiry" : "booking-request",
        fields: details,
      });
    }

    if (isMobile && delivery === "whatsapp") {
      openWhatsAppBookingMessage(
        exceedsOnlineCapacity
          ? buildGroupQuoteRequestMessage(details, reference)
          : isEnquiryOnly
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
      if (isA2AFlow) {
        if (!journeyIntent) {
          setSubmitError("Please choose where you are travelling.");
          return;
        }
        if (
          (journeyIntent === "to-airport" || journeyIntent === "from-airport") &&
          !intentAirportCode
        ) {
          setSubmitError("Please choose an airport.");
          return;
        }
        if (!validateA2APlaces()) {
          return;
        }
      }
      if (!hasQuoteRoute) {
        setSubmitError(
          isA2AFlow && journeyIntent === "to-airport"
            ? "Please select your pickup address."
            : isA2AFlow && journeyIntent === "from-airport"
              ? "Please select your destination."
              : "Please complete your journey details.",
        );
        return;
      }
      if (journeyMode == null) {
        setSubmitError("Choose One way or Return to continue.");
        scheduleBookingNavAfterRender("journey-type-selector");
        return;
      }
      if (!partySelectionReady) {
        setSubmitError("Select your passenger and suitcase numbers to see your fixed price.");
        scheduleBookingNavAfterRender("passenger-luggage-section");
        return;
      }
      if (passengers != null && passengers > MAX_ONLINE_PASSENGERS) {
        setSubmitError("We can only quote for up to 7 passengers.");
        return;
      }
      if (
        passengers != null &&
        passengers >= FIVE_PLUS_PASSENGERS &&
        (exactPassengers == null || exactPassengers < 5 || exactPassengers > 7)
      ) {
        setSubmitError("Please select 5, 6, or 7 passengers.");
        return;
      }
      // 5–7 continues into the tailored quote request path (no invented price).
      if (!exceedsOnlineCapacity && !isEnquiryOnly && !isManualQuoteJourney && !pricingConfirmationRequired && !liveQuote) {
        return;
      }
      setSubmitError("");
      pendingQuoteStepNavScrollRef.current = 2;
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

  function navigateQuoteStep(step: QuoteStepNavTarget) {
    pendingQuoteStepNavScrollRef.current = step;
    setQuoteStep(step);
  }

  function handleEditBooking() {
    navigateQuoteStep(2);
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
    pendingQuoteStepNavScrollRef.current = 3;
    setQuoteStep(3);
  }

  const usesWhatsApp = isMobileDevice === true;

  // After explicit step CTAs (Book Now / Continue / Back / Edit / Start New Quote),
  // bring the active section clearly below the fixed header and focus its heading.
  useEffect(() => {
    const target = pendingQuoteStepNavScrollRef.current;
    if (!target || target !== quoteStep) {
      return;
    }
    pendingQuoteStepNavScrollRef.current = null;
    const element =
      target === 1
        ? step1JourneyRef.current
        : target === 2
          ? step2TravelDetailsRef.current
          : step3CustomerDetailsRef.current;
    return scheduleBookingNavAfterRender(element ?? quoteStepTargetId(target), {
      focusHeading: true,
    });
  }, [quoteStep]);

  // Availability-confirmation result: scroll once to the confirmation card
  // (header-aware), not the previous page position / Airports We Serve.
  useEffect(() => {
    if (!shortNoticeResult || !pendingShortNoticeScrollRef.current) {
      return;
    }
    pendingShortNoticeScrollRef.current = false;
    return scheduleBookingNavAfterRender(
      shortNoticeResultRef.current ?? "quote-availability-confirmation",
      { focusHeading: true },
    );
  }, [shortNoticeResult]);

  // When the complete results first become ready, scroll once to Your Route.
  // Do not re-scroll when route/vehicle/price fields update individually.
  const hadQuoteResultsReadyRef = useRef(false);
  useEffect(() => {
    if (quoteStep !== 1) {
      hadQuoteResultsReadyRef.current = false;
      return;
    }
    if (!quoteResultsReady) {
      hadQuoteResultsReadyRef.current = false;
      return;
    }
    if (hadQuoteResultsReadyRef.current) return;
    hadQuoteResultsReadyRef.current = true;
    return schedulePreciseResultsScroll("quote-route-summary");
  }, [quoteResultsReady, quoteStep]);

  // Legacy (non-A2A) form: addresses → One Way/Return, then passengers after mode chosen.
  const hadLegacyJourneyModeScrollRef = useRef(false);
  const hadLegacyPartyScrollRef = useRef(false);
  useEffect(() => {
    if (isA2AFlow || quoteStep !== 1) {
      hadLegacyJourneyModeScrollRef.current = false;
      hadLegacyPartyScrollRef.current = false;
      return;
    }
    if (!hasQuoteRoute) {
      hadLegacyJourneyModeScrollRef.current = false;
      hadLegacyPartyScrollRef.current = false;
      return;
    }
    if (journeyMode == null) {
      hadLegacyPartyScrollRef.current = false;
      if (hadLegacyJourneyModeScrollRef.current) return;
      hadLegacyJourneyModeScrollRef.current = true;
      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      return scheduleBookingNavAfterRender("journey-type-selector");
    }
    if (hadLegacyPartyScrollRef.current) return;
    hadLegacyPartyScrollRef.current = true;
    return scheduleBookingNavAfterRender("passenger-luggage-section");
  }, [hasQuoteRoute, isA2AFlow, journeyMode, quoteStep]);

  const submitInProgressLabel = showsRequestQuoteFlow
    ? "Sending quote request…"
    : isEnquiryOnly
      ? "Sending enquiry…"
      : "Sending booking…";

  const confirmButtonLabel = exceedsOnlineCapacity
    ? "Request Minibus Quote"
    : showsRequestQuoteFlow
    ? pricingConfirmationRequired || isManualQuoteJourney
      ? "Request Fixed Quote"
      : liveQuote
        ? `Request quote · ${formatQuote(liveQuote.amount)}`
        : "Request a quote"
    : isEnquiryOnly
      ? "Send enquiry"
      : liveQuote
        ? `Confirm & book for ${formatQuote(liveQuote.amount)}`
        : "Confirm & book";

  const whatsAppConfirmLabel = exceedsOnlineCapacity
    ? "Request Minibus Quote via WhatsApp"
    : showsRequestQuoteFlow
    ? pricingConfirmationRequired || isManualQuoteJourney
      ? "Request Fixed Quote via WhatsApp"
      : liveQuote
        ? `Request quote via WhatsApp — ${formatQuote(liveQuote.amount)}`
        : "Request quote via WhatsApp"
    : isEnquiryOnly
      ? "Send enquiry via WhatsApp"
      : liveQuote
        ? `Send via WhatsApp — ${formatQuote(liveQuote.amount)}`
        : "Confirm & send via WhatsApp";

  const quoteHint = exceedsOnlineCapacity
    ? "This party size needs a tailored minibus quote — we don’t show an automatic online fare."
    : pricingConfirmationRequired
    ? hasQuoteRoute
      ? "Continue to request your price — we’ll confirm the fare before payment."
      : isA2AFlow && !isAddressPairComplete
        ? "Select pickup and drop-off addresses from the suggestions."
        : "Enter your journey details to request a confirmed price."
    : isManualQuoteJourney
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
        ? "Larger-vehicle quote ready — add your date and time, then request a quote (subject to partner availability)."
        : "Larger-vehicle transfers via licensed partners — continue to request a quote."
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
        ? "This journey is enquiry only — add your date and time, then continue to book."
        : "This journey is enquiry only — continue to send your trip details and we’ll quote you."
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
              : journeyMode == null
              ? "Choose One way or Return to continue."
              : !partySelectionReady
              ? "Select your passenger and suitcase numbers to see your fixed price."
              : !isScheduleComplete
                ? "Price ready — add your date and time when you’re ready to book"
                : ""
      : !isAddressPairComplete
        ? "Enter pickup and drop-off addresses to see your fixed journey price"
        : journeyMode == null
          ? "Choose One way or Return to continue."
          : !partySelectionReady
          ? "Select your passenger and suitcase numbers to see your fixed price."
          : !routeMetrics
            ? "We need to confirm the price for this journey. Calculating your route… If a route cannot be found, use WhatsApp for a manual quote."
            : !isScheduleComplete
              ? "Price ready — add your date and time when you’re ready to book"
              : "";

  function renderQuotePriceSummaryBody() {
    return (
      <>
        {pricingConfirmationRequired ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wider text-emerald">Pricing</p>
            <p className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              {priceConfirmationLabel}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              We’ll confirm your fare once journey details are reviewed. Continue to send your trip
              details — no online payment until the price is confirmed.
            </p>
            {journeyDistanceLabel && journeyDurationLabel && (
              <p className="mt-2 text-xs text-white/60">
                Approx. {journeyDistanceLabel} · {journeyDurationLabel}
              </p>
            )}
          </>
        ) : exceedsOnlineCapacity ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wider text-emerald">
              Tailored Quote Required
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Minibus — 5–7 passengers
            </p>
            <div className="mt-3 space-y-1 text-sm text-white/80">
              <p>
                <span className="text-white/45">Journey:</span> {pickupLabel} → {dropoffLabel}
              </p>
              {effectivePassengers != null && effectivePassengers > 0 && (
                <p>
                  <span className="text-white/45">Passengers:</span>{" "}
                  {formatPassengerChoice(effectivePassengers)}
                  <span className="mx-2 text-white/35">·</span>
                  <span className="text-white/45">Large bags:</span>{" "}
                  {formatSuitcaseChoice(suitcases as number)}
                </p>
              )}
              {effectiveAirportCode && (
                <p>
                  <span className="text-white/45">Airport:</span>{" "}
                  {airportName || effectiveAirportCode}
                </p>
              )}
              {returnJourney && (
                <p>
                  <span className="text-white/45">Return:</span> Yes
                </p>
              )}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-white/65">
              We don&apos;t show an automatic online fare for 5–7 passengers. Continue to request a
              tailored fixed-price quote. Your quote will list only the inclusions that apply to
              your journey — express airport fees where relevant, and Dublin tolls only where they
              apply.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-white/55">
              Prefer WhatsApp?{" "}
              <a
                href={whatsAppChatUrl(CAPACITY_WHATSAPP_MESSAGE)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-emerald underline-offset-2 hover:underline"
              >
                Message us for a minibus quote
              </a>
            </p>
          </>
        ) : isManualQuoteJourney ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wider text-emerald">
              {isOutOfAreaPickupJourney
                ? "Out-of-area pickup"
                : "Republic of Ireland long-distance transfer"}
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Request your fixed price
            </p>
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
              {returnJourney
                ? "Guide return price · request a quote"
                : "Guide price · request a quote"}
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-white">
              {formatQuote(liveQuote.amount)}
            </p>
            <p className="mt-3 text-sm text-white/75">
              Vehicle: {vehicleShortLabel(quoteVehicle)}
              <span className="mx-2 text-white/35">·</span>
              Passengers: {formatPassengerChoice(effectivePassengers as number)}
              <span className="mx-2 text-white/35">·</span>
              Large suitcases: {formatSuitcaseChoice(suitcases as number)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-white/65">{MINIBUS_PARTNER_NOTE}</p>
            {journeyDistanceLabel && journeyDurationLabel && (
              <p className="mt-2 text-xs text-white/60">
                Approx. {journeyDistanceLabel} · {journeyDurationLabel}
              </p>
            )}
            <PriceInclusionBlock
              isAirportTrip={isAirportLegForInclusions}
              isFromAirport={isFromAirport}
              returnJourney={returnJourney}
              airportCode={effectiveAirportCode}
              addressToAddress={isAddressToAddressInclusions}
              guideSuffix="This is a guide price only — not an instant confirmation."
            />
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
            <p className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Personal quote
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              Send an enquiry with your trip details and we&apos;ll confirm availability and quote
              you personally.
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
                : appliedPersonalQuote
                  ? "Personal quoted fare"
                  : returnJourney
                    ? "Your Fixed Return Journey Price"
                    : "Your Fixed Journey Price"}
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-white">
              {formatQuote(
                testChargeAmount ?? appliedPersonalQuote?.agreedAmount ?? liveQuote.amount,
              )}
            </p>
            {appliedPersonalQuote && testChargeAmount === null ? (
              <p className="mt-2 text-sm text-emerald/90">
                Personal quote applied
                <span className="mt-1 block text-xs text-white/55">
                  Standard website fare: {formatQuote(liveQuote.amount)}
                </span>
              </p>
            ) : null}
            <p className="mt-3 text-sm text-white/75">
              Vehicle: {vehicleShortLabel(quoteVehicle)}
              <span className="mx-2 text-white/35">·</span>
              Passengers: {formatPassengerChoice(effectivePassengers as number)}
              <span className="mx-2 text-white/35">·</span>
              Large suitcases: {formatSuitcaseChoice(suitcases as number)}
            </p>
            {testChargeAmount !== null && (
              <p className="mt-2 text-xs text-white/60">
                Route price would be {formatQuote(liveQuote.amount)} — not charged in test mode.
              </p>
            )}
            {journeyDistanceLabel && journeyDurationLabel && (
              <p className="mt-2 text-xs text-white/60">
                Approx. {journeyDistanceLabel} · {journeyDurationLabel}
              </p>
            )}
            <PriceInclusionBlock
              isAirportTrip={isAirportLegForInclusions}
              isFromAirport={isFromAirport}
              returnJourney={returnJourney}
              airportCode={effectiveAirportCode}
              addressToAddress={isAddressToAddressInclusions}
            />
            {returnJourney && !appliedPersonalQuote && (
              <p className="mt-2 text-xs font-medium text-emerald/90">
                Includes 5% return booking discount.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wider text-white/50">
              Your Fixed Journey Price
            </p>
            <p className="mt-1 text-sm text-white/70">{quoteHint}</p>
          </>
        )}
        <p className="mt-3 text-[11px] text-white/40">
          {pricingConfirmationRequired || isManualQuoteJourney || exceedsOnlineCapacity
            ? "Request Fixed Quote — we’ll confirm your personal price before any payment is taken."
            : showsRequestQuoteFlow
              ? "Request a quote — we’ll confirm availability before the booking is accepted. No online payment until confirmed."
              : isEnquiryOnly
                ? "We’ll reply with your quote — no online payment until you confirm."
                : canPayNowOnline
                  ? isAirportLegForInclusions
                    ? "Eligible bookings can be paid securely online with SumUp."
                    : "Fixed price for your journey. Eligible bookings can be paid securely online with SumUp."
                  : isAirportLegForInclusions
                    ? "Continue to enter your details — eligible bookings can be paid securely online with SumUp."
                    : "Fixed price for your journey. Continue to enter your details when you’re ready."}
        </p>
      </>
    );
  }

  function renderStep1PrimaryActions() {
    return (
      <>
        <button
          type="submit"
          disabled={
            submitted ||
            !quoteChoicesReady ||
            (exceedsOnlineCapacity ||
            isEnquiryOnly ||
            isManualQuoteJourney ||
            pricingConfirmationRequired
              ? !hasQuoteRoute
              : !liveQuote)
          }
          className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitted
            ? submitInProgressLabel
            : exceedsOnlineCapacity
              ? "Continue to request quote"
              : liveQuote && canPayNowOnline && !isEnquiryOnly && !showsRequestQuoteFlow
                ? "Book Now"
                : "Continue to travel details"}
        </button>
        {liveQuote &&
        canPayNowOnline &&
        !isEnquiryOnly &&
        !showsRequestQuoteFlow &&
        !appliedPersonalQuote &&
        !submitted ? (
          <button
            type="button"
            onClick={handleSaveQuoteClick}
            className="w-full rounded-xl border border-white/25 bg-transparent py-3 text-sm font-semibold text-white transition-all hover:bg-white/5"
          >
            Save Quote
          </button>
        ) : null}
        {liveQuote || hasQuoteRoute || passengers != null || suitcases != null
          ? renderStartNewQuoteControls()
          : null}
        {saveQuotePrompt ? (
          <p className="text-center text-xs text-emerald/90" role="status">
            {saveQuotePrompt}
          </p>
        ) : null}
      </>
    );
  }

  if (shortNoticeResult) {
    return (
      <div
        ref={(node) => {
          cardRef.current = node;
          shortNoticeResultRef.current = node;
        }}
        id="quote-availability-confirmation"
        className="glass-card min-w-0 scroll-mt-44 rounded-2xl p-6 sm:p-8"
      >
        <div className="rounded-xl border border-amber-400/30 bg-navy-dark/50 px-5 py-8 text-center sm:px-8 sm:py-10">
          <p
            data-booking-nav-heading
            tabIndex={-1}
            className="text-xs font-medium uppercase tracking-wider text-amber-200 outline-none"
          >
            Booking requires availability confirmation
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Thanks — we&apos;ve received your journey details.
          </h2>
          {shortNoticeResult.amountLabel ? (
            <p className="mt-4 text-3xl font-bold text-white sm:text-4xl">
              {shortNoticeResult.amountLabel}
            </p>
          ) : null}
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/80 sm:text-base">
            We just need to confirm availability for your requested pickup time before taking
            payment.
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/70">
            Please message us on WhatsApp. Once availability is confirmed, you&apos;ll be able to pay
            securely online for this booking.
          </p>
          <p className="mt-5 text-sm text-white/60">
            Booking reference:{" "}
            <span className="font-semibold text-white">{shortNoticeResult.reference}</span>
          </p>
          <a
            href={shortNoticeResult.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex min-h-12 w-full max-w-sm items-center justify-center rounded-xl bg-emerald px-5 py-3 text-base font-bold text-navy transition-colors hover:bg-emerald/90 sm:w-auto"
          >
            Message us on WhatsApp
          </a>
          <button
            type="button"
            onClick={() => {
              performStartNewQuote();
            }}
            className="mt-4 block w-full text-sm text-white/55 underline-offset-2 hover:underline sm:mx-auto sm:w-auto"
          >
            Start a New Quote
          </button>
        </div>
      </div>
    );
  }

  if (bookingSent) {
    const quoteConversionValue =
      typeof liveQuote?.amount === "number" && Number.isFinite(liveQuote.amount) && liveQuote.amount > 0
        ? liveQuote.amount
        : undefined;

    return (
      <div
        ref={cardRef}
        id="bookingRequestResult"
        className="glass-card min-w-0 rounded-2xl p-6 sm:p-8"
      >
        <div className="rounded-xl border border-white/10 bg-navy-dark/50 px-5 py-8 text-center sm:px-8 sm:py-10">
          <p className="text-xs font-medium uppercase tracking-wider text-emerald">
            {exceedsOnlineCapacity
              ? "Quote Request Received"
              : showsRequestQuoteFlow
              ? "Quote request submitted"
              : isEnquiryOnly
                ? "Enquiry submitted"
                : "Booking submitted"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Thank you</h2>
          {quoteConversionValue ? (
            <p className="mt-4 text-3xl font-bold text-white sm:text-4xl">
              {formatQuote(quoteConversionValue)}
            </p>
          ) : null}
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/80 sm:text-base">
            {exceedsOnlineCapacity
              ? "We’ve received your journey details for a minibus (5–7 passengers). This is a quote request only — a tailored fixed price will be provided shortly. Nothing is confirmed until you accept the quote."
              : showsRequestQuoteFlow
              ? isOutOfAreaPickupJourney
                ? "We’ve received your out-of-area pickup request. We’ll review it manually, confirm availability, and send your personal fixed quote shortly. No payment is taken until the fare is confirmed."
                : isRoiJourney
                  ? "We’ve received your Republic of Ireland long-distance transfer request. We’ll confirm your fixed price and send your personal quote shortly."
                  : "We’ve received your minibus quote request. These transfers are subject to partner availability — we’ll confirm capacity and send your personal quote shortly."
              : isEnquiryOnly
                ? "We’ve received your enquiry. We’ll confirm availability and send your personal quote shortly. When you’re ready to book, we’ll send a SumUp payment link — your trip is confirmed after payment."
                : "We’ve received your booking request. If you paid online with SumUp, your booking is confirmed. Otherwise we’ll confirm the job and email a SumUp payment link — your trip is confirmed after payment."}
          </p>
          {(bookingReference || quoteTransactionId) && (
            <p className="mt-4 text-sm text-white/60">
              Reference: {bookingReference || quoteTransactionId}
            </p>
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
              performStartNewQuote();
            }}
            className="mt-6 w-full rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy transition-colors hover:bg-emerald-light sm:w-auto sm:px-8"
          >
            Start a New Quote
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={cardRef} className="glass-card min-w-0 rounded-2xl p-4 sm:p-8 lg:p-6 xl:p-7">
      <div className="mb-4 lg:mb-4">
        <h2
          data-site-nav-heading="quote"
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight text-white outline-none sm:text-2xl lg:text-[1.5rem]"
        >
          Get a Live Quote
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-white/60 sm:mt-2 lg:mt-1.5 lg:text-[0.875rem] lg:leading-snug">
          {pricingConfirmationRequired
            ? "Three quick steps — your journey, travel details, then your details. We’ll confirm your fare before any payment."
            : "Three quick steps — your journey, travel details, then your details. Instant fares can be paid online by card to confirm; otherwise Request to book and we’ll email a SumUp link after we confirm."}
        </p>
        <ol className="mt-3 grid grid-cols-3 gap-2 lg:mt-3 lg:gap-2" aria-label="Booking steps">
          {[
            { step: 1 as const, label: isA2AFlow ? "Your journey" : "Airport & address" },
            { step: 2 as const, label: exceedsOnlineCapacity ? "Request quote" : "Price & travel" },
            { step: 3 as const, label: canPayNowOnline ? "Pay & confirm" : "Your details" },
          ].map((item) => {
            const active = quoteStep === item.step;
            const done = quoteStep > item.step;
            return (
              <li
                key={item.step}
                className={`rounded-lg border px-2 py-2 text-center ${
                  active
                    ? "border-white/25 bg-white/[0.06] text-white"
                    : done
                      ? "border-white/15 bg-white/[0.03] text-white/70"
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

      <form id="quoteForm" onSubmit={handleSubmit} className="relative space-y-4 overflow-x-clip overflow-y-visible lg:space-y-3.5">
        <GoogleAdsRequestQuote
          fire={Boolean(
            quoteStep === 1 && quoteAnalyticsValue && quoteTransactionId,
          )}
          value={quoteAnalyticsValue ?? undefined}
          currency="GBP"
          transactionId={quoteTransactionId || undefined}
          pageType={pageType}
          airport={effectiveAirportCode || undefined}
          journeyType={quoteAnalyticsJourneyType}
          passengers={effectivePassengers ?? undefined}
          returnJourney={returnJourney}
          includeUserData={false}
        />
        {testChargeAmount !== null && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <strong className="text-white">Test booking mode.</strong> SumUp will charge{" "}
            <strong className="text-white">£1.00</strong> only
            {testBookingLabel ? ` for ${testBookingLabel}` : ""}. You will still receive the full
            invoice email.
          </div>
        )}
        {quoteStep === 1 ? (
          <>
        <div
          id="step1-journey-details"
          ref={step1JourneyRef}
          className="scroll-mt-44 space-y-4 md:scroll-mt-28"
        >
        <h2
          data-booking-nav-heading
          tabIndex={-1}
          className="sr-only"
        >
          Step 1 — Journey details
        </h2>
        {isA2AFlow ? (
          <>
            <QuoteProgressiveRoute
              key={`quote-route-${formResetKey}`}
              journeyIntent={journeyIntent}
              onJourneyIntentChange={applyJourneyIntent}
              selectedAirportCode={intentAirportCode}
              onAirportSelect={applyIntentAirport}
              pickupAddress={pickupAddress}
              dropoffAddress={dropoffAddress}
              onPickupChange={handlePickupChange}
              onDropoffChange={handleDropoffChange}
              onPickupPlaceSelect={handlePickupPlaceSelect}
              onDropoffPlaceSelect={handleDropoffPlaceSelect}
              pickupPlaceError={pickupPlaceError}
              dropoffPlaceError={dropoffPlaceError}
              pickupConfirmedPlace={isQuoteReadyPlace(pickupPlace) ? pickupPlace : null}
              dropoffConfirmedPlace={isQuoteReadyPlace(dropoffPlace) ? dropoffPlace : null}
              pickupRestoredHint={pickupRestoredHint}
              dropoffRestoredHint={dropoffRestoredHint}
              onClearPickup={() => {
                handlePickupChange("");
              }}
              onClearDropoff={() => {
                handleDropoffChange("");
              }}
              addressLookupCode={addressLookupCode}
              journeyMode={journeyMode}
              onJourneyModeChange={(value) => {
                setJourneyMode(value);
                if (value === "one-way") setReturnDateError("");
              }}
              passengers={passengers}
              onPassengersChange={setPassengers}
              exactPassengers={exactPassengers}
              onExactPassengersChange={setExactPassengers}
              suitcases={suitcases}
              onSuitcasesChange={setSuitcases}
              isGroupQuote={exceedsOnlineCapacity}
              showRouteFields={Boolean(journeyIntent)}
              showJourneyModeFields={
                journeyIntent === "address-to-address"
                  ? isPlaceSelected(pickupPlace) && isPlaceSelected(dropoffPlace)
                  : journeyIntent === "to-airport"
                    ? Boolean(intentAirportCode) && isPlaceSelected(pickupPlace)
                    : journeyIntent === "from-airport"
                      ? Boolean(intentAirportCode) && isPlaceSelected(dropoffPlace)
                      : false
              }
              showPartyFields={
                journeyMode != null &&
                (journeyIntent === "address-to-address"
                  ? isPlaceSelected(pickupPlace) && isPlaceSelected(dropoffPlace)
                  : journeyIntent === "to-airport"
                    ? Boolean(intentAirportCode) && isPlaceSelected(pickupPlace)
                    : journeyIntent === "from-airport"
                      ? Boolean(intentAirportCode) && isPlaceSelected(dropoffPlace)
                      : false)
              }
              showStageScrollKey={`${journeyIntent ?? ""}|${intentAirportCode}|${pickupPlace.placeId}|${dropoffPlace.placeId}`}
              journeyKindLabel={journeyKind ? journeyKindLabel(journeyKind) : undefined}
            />

            <div
              className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                isOutOfAreaPickupJourney || isRoiJourney ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="min-h-0 overflow-hidden">
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
                  <div className="rounded-xl border border-white/10 bg-navy-dark/40 px-4 py-3 text-sm text-white/85">
                    <p className="font-semibold text-emerald">Republic of Ireland journey – request your fixed price</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/70">
                      Republic of Ireland city destinations (outside Dublin Airport) are quoted
                      individually — we&apos;ll confirm your personal fixed price by email.
                    </p>
                  </div>
                ) : (
                  <div className="h-0" aria-hidden />
                )}
              </div>
            </div>

            <p className="min-h-[1.1rem] text-xs text-red-300">
              {isLdyTrip && ldyServiceAreaInvalid
                ? "City of Derry Airport transfers are between LDY and the greater Belfast area only."
                : "\u00a0"}
            </p>

            {addressesReadyForRoute && (
              <div
                id={quoteResultsReady && quoteStep === 1 ? "quote-results-summary" : undefined}
                className={
                  quoteResultsReady && quoteStep === 1
                    ? "scroll-mt-44 space-y-3 outline-none md:scroll-mt-28"
                    : undefined
                }
                style={
                  quoteResultsReady && quoteStep === 1
                    ? { overflowAnchor: "none" }
                    : undefined
                }
              >
                <div
                  className={
                    quoteResultsReady && quoteStep === 1 ? undefined : "sr-only"
                  }
                  aria-hidden={!(quoteResultsReady && quoteStep === 1)}
                >
                  <TripMap
                    id={quoteResultsReady && quoteStep === 1 ? "quote-route-summary" : undefined}
                    tripMode="address"
                    originAddress={pickupAddress}
                    destinationAddress={dropoffAddress}
                    originLat={pickupPlace.lat}
                    originLng={pickupPlace.lng}
                    destinationLat={dropoffPlace.lat}
                    destinationLng={dropoffPlace.lng}
                    onRouteMetrics={handleRouteMetrics}
                    variant="summary"
                  />
                </div>

                {quoteResultsReady && quoteStep === 1 && (
                  <>
                    {!exceedsOnlineCapacity && (
                      <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-3 py-2.5 sm:px-4 sm:py-3">
                        <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                          Vehicle for this journey
                        </p>
                        <p className="mt-1 text-lg font-semibold tracking-tight text-white sm:text-xl">
                          {vehicleShortLabel(quoteVehicle)}
                        </p>
                        <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                          Selected automatically from your passengers and luggage.
                        </p>
                      </div>
                    )}

                    <div
                      id="quote-price-summary"
                      className="rounded-xl border border-white/10 bg-navy-dark/40 px-3 py-4 sm:px-4 sm:py-5"
                    >
                      {renderQuotePriceSummaryBody()}
                    </div>

                    <div
                      id="quote-step1-next"
                      className="sticky bottom-0 z-20 -mx-1 space-y-2 border-t border-white/10 bg-navy/95 px-1 py-3 backdrop-blur-md supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:z-auto sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
                    >
                      {renderStep1PrimaryActions()}
                    </div>
                  </>
                )}
              </div>
            )}
            <input type="hidden" name="vehicle" value={quoteVehicle} />
            <input
              type="hidden"
              name="passengers"
              value={effectivePassengers == null ? "" : String(effectivePassengers)}
            />
            <input
              type="hidden"
              name="suitcases"
              value={suitcases == null ? "" : String(suitcases)}
            />
          </>
        ) : (
          <>
        {/* Legacy airport transfer UI when addressToAddress is disabled */}
        {hasQuoteRoute ? (
        <div id="journey-type-selector">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">
            Journey
          </p>
          <div
            role="group"
            aria-label="One way or return"
            className="grid grid-cols-2 overflow-hidden rounded-xl border border-white/15 bg-white/[0.06]"
          >
            <button
              type="button"
              aria-pressed={journeyMode === "one-way"}
              onClick={() => {
                setJourneyMode("one-way");
                setReturnDateError("");
              }}
              className={`min-h-[52px] w-full px-3 py-3 text-sm font-semibold transition-colors focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald ${
                journeyMode === "one-way"
                  ? "bg-emerald text-navy"
                  : "bg-transparent text-white/75 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              One way
            </button>
            <button
              type="button"
              aria-pressed={journeyMode === "return"}
              onClick={() => setJourneyMode("return")}
              className={`min-h-[52px] w-full border-l border-white/40 px-3 py-3 text-sm font-semibold transition-colors focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald ${
                journeyMode === "return"
                  ? "bg-emerald text-navy"
                  : "bg-transparent text-white/75 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              Return · 5% off
            </button>
          </div>
          {journeyMode == null && (
            <p
              id="quote-journey-mode-prompt"
              className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/80"
              role="status"
            >
              Choose One way or Return to continue.
            </p>
          )}
        </div>
        ) : null}

        {isAirportTrip && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">
              Trip Type
            </p>
            {isLdyTrip ? (
              <>
                <div className="mb-2 rounded-xl border border-white/10 bg-navy-dark/40 px-4 py-3 text-sm text-white/80">
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
              className="box-border h-12 w-full min-w-0 rounded-xl border border-white/10 bg-navy-light px-4 text-base text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
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
                key={`dropoff-${formResetKey}`}
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
                key={`pickup-${formResetKey}`}
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
              key={`a2a-pickup-${formResetKey}`}
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
              key={`a2a-dropoff-${formResetKey}`}
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

        {!quoteResultsReady && (
          <div className="sr-only" aria-hidden="true">
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
              originLat={pickupPlace.lat}
              originLng={pickupPlace.lng}
              destinationLat={dropoffPlace.lat}
              destinationLng={dropoffPlace.lng}
              onRouteMetrics={handleRouteMetrics}
              variant="summary"
            />
          </div>
        )}
          </>
        )}

        {!isA2AFlow && journeyMode != null && (
        <div
          id="passenger-luggage-section"
          className="space-y-4 rounded-xl border border-white/10 bg-white/5 px-4 py-4 lg:space-y-3.5 lg:px-4 lg:py-3.5"
        >
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-3.5">
            <TapChoiceRow
              label="Passengers"
              options={Array.from({ length: passengerLimit }, (_, index) => index + 1)}
              value={passengers == null ? null : Math.min(passengers, passengerLimit)}
              onChange={setPassengers}
              formatOption={formatPassengerChoice}
            />
            <TapChoiceRow
              label="Large suitcases (23kg)"
              options={[0, 1, 2, 3, 4, 5].filter((count) => count <= SELECTOR_MAX_SUITCASES)}
              value={suitcases == null ? null : Math.min(suitcases, SELECTOR_MAX_SUITCASES)}
              onChange={setSuitcases}
              formatOption={formatSuitcaseChoice}
            />
          </div>
          {!partySelectionReady && (
            <p
              id="quote-party-prompt"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/80"
              role="status"
            >
              Select your passenger and suitcase numbers to see your fixed price.
            </p>
          )}
          <input type="hidden" name="vehicle" value={quoteVehicle} />
          <input
            type="hidden"
            name="passengers"
            value={passengers == null ? "" : String(passengers)}
          />
          <input
            type="hidden"
            name="suitcases"
            value={suitcases == null ? "" : String(suitcases)}
          />
          <p className="text-xs leading-relaxed text-white/55">
            Saloon, Estate, or Minibus is chosen automatically from your party size. All three can
            be quoted and paid online.
          </p>
        </div>
        )}

        {!isA2AFlow && quoteResultsReady && quoteStep === 1 && (
          <div
            id="quote-results-summary"
            className="scroll-mt-44 space-y-3 outline-none md:scroll-mt-28"
            style={{ overflowAnchor: "none" }}
          >
            <TripMap
              id="quote-route-summary"
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
              originLat={pickupPlace.lat}
              originLng={pickupPlace.lng}
              destinationLat={dropoffPlace.lat}
              destinationLng={dropoffPlace.lng}
              onRouteMetrics={handleRouteMetrics}
              variant="summary"
            />
            {!exceedsOnlineCapacity && (
              <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-3 py-2.5 sm:px-4 sm:py-3">
                <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                  Vehicle for this journey
                </p>
                <p className="mt-1 text-lg font-semibold tracking-tight text-white sm:text-xl">
                  {vehicleShortLabel(quoteVehicle)}
                </p>
                {isMinibusParty ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                    Minibus selected for your party size (5–7 passengers or extra luggage). Your
                    fixed online fare uses our existing minibus pricing — pay securely to confirm.
                  </p>
                ) : quoteVehicle === ESTATE ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                    Estate selected automatically from your passengers and luggage.
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                    Saloon selected automatically from your passengers and luggage.
                  </p>
                )}
              </div>
            )}
            <div
              id="quote-price-summary"
              className="rounded-xl border border-white/10 bg-navy-dark/40 px-3 py-4 sm:px-4 sm:py-5"
            >
              {renderQuotePriceSummaryBody()}
            </div>
            <div
              id="quote-step1-next"
              className="sticky bottom-0 z-20 -mx-1 space-y-2 border-t border-white/10 bg-navy/95 px-1 py-3 backdrop-blur-md supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:z-auto sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
            >
              {renderStep1PrimaryActions()}
            </div>
          </div>
        )}
        </div>
          </>
        ) : null}

        {quoteStep === 2 ? (
          <>
        <div
          id="step2-travel-details"
          ref={step2TravelDetailsRef}
          className="scroll-mt-44 space-y-4 md:scroll-mt-28"
        >
        <h2
          data-booking-nav-heading
          tabIndex={-1}
          className="sr-only"
        >
          Step 2 — Travel details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:gap-3.5">
          <div>
            <label
              htmlFor="date"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              {returnJourney ? "Outbound Date" : "Date"}{" "}
              <span className="font-normal normal-case tracking-normal text-white/40">
                (needed to book)
              </span>
            </label>
            <input
              id="date"
              ref={tripDateInputRef}
              name="date"
              type="date"
              min={minTripDate}
              value={tripDate}
              aria-invalid={Boolean(tripDateError)}
              aria-describedby={tripDateError ? "trip-date-error" : undefined}
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
              className="box-border h-12 w-full min-w-0 rounded-xl border border-white/10 bg-white/5 px-4 text-base text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
            />
          </div>
          <div>
            <label
              htmlFor="time"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              {returnJourney ? "Outbound pick up time" : "Pick up time"}{" "}
              <span className="font-normal normal-case tracking-normal text-white/40">
                (needed to book)
              </span>
            </label>
            <input
              id="time"
              ref={tripTimeInputRef}
              name="time"
              type="time"
              min={minTripTime}
              value={tripTime}
              aria-invalid={Boolean(tripDateError)}
              aria-describedby={tripDateError ? "trip-date-error" : undefined}
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
              className="box-border h-12 w-full min-w-0 rounded-xl border border-white/10 bg-white/5 px-4 text-base text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
            />
          </div>
          <p
            id="trip-date-error"
            role={tripDateError ? "alert" : undefined}
            className="sm:col-span-2 min-h-[1.1rem] text-xs text-red-400"
          >
            {tripDateError || "\u00a0"}
          </p>
        </div>

        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${
            returnJourney ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="returnDate"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
                >
                  Return Date{" "}
                  <span className="font-normal normal-case tracking-normal text-white/40">
                    (needed to book)
                  </span>
                </label>
                <input
                  id="returnDate"
                  ref={returnDateInputRef}
                  name="returnDate"
                  type="date"
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
                  className="box-border h-12 w-full min-w-0 rounded-xl border border-white/10 bg-white/5 px-4 text-base text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
                />
              </div>
              <div>
                <label
                  htmlFor="returnTime"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
                >
                  Return pick up time{" "}
                  <span className="font-normal normal-case tracking-normal text-white/40">
                    (needed to book)
                  </span>
                </label>
                <input
                  id="returnTime"
                  ref={returnTimeInputRef}
                  name="returnTime"
                  type="time"
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
                  className="box-border h-12 w-full min-w-0 rounded-xl border border-white/10 bg-white/5 px-4 text-base text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
                />
              </div>
              <p className="sm:col-span-2 min-h-[1.1rem] text-xs text-red-400">
                {returnDateError || "\u00a0"}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-white/50">Your Journey</p>
          <p className="mt-2 text-sm font-semibold text-white">
            {pickupLabel || "Pickup"}
          </p>
          <p className="my-1 text-center text-emerald" aria-hidden>
            ↓
          </p>
          <p className="text-sm font-semibold text-white">
            {dropoffLabel || "Destination"}
          </p>
          {returnJourney && (
            <p className="mt-3 text-xs leading-relaxed text-white/65">
              Return inferred as {dropoffLabel || "destination"} → {pickupLabel || "pickup"}. Only
              the return date and time are needed below.
            </p>
          )}
          {(tripDate || tripTime) && (
            <p className="mt-3 text-sm text-white/80">
              {tripDate ? formatDisplayDate(tripDate) : "Date TBC"}
              {tripTime ? ` · ${formatDisplayTime(tripTime)}` : ""}
              {returnJourney && returnDate
                ? ` · Return ${formatDisplayDate(returnDate)}${returnTime ? ` · ${formatDisplayTime(returnTime)}` : ""}`
                : ""}
            </p>
          )}
          {partySelectionReady && effectivePassengers != null && suitcases != null ? (
          <p className="mt-2 text-sm text-white/85">
            {formatPassengerChoice(effectivePassengers)}{" "}
            passenger
            {effectivePassengers === 1 ? "" : "s"}{" "}
            · {formatSuitcaseChoice(suitcases)} suitcase
            {suitcases === 1 ? "" : "s"}
            {!exceedsOnlineCapacity ? ` · ${vehicleShortLabel(quoteVehicle)}` : ""}
          </p>
          ) : null}
          <button
            type="button"
            onClick={() => navigateQuoteStep(1)}
            className="mt-2 text-xs font-semibold text-emerald underline-offset-2 hover:underline"
          >
            Edit journey details
          </button>
        </div>
        </div>
          </>
        ) : null}

        {quoteStep === 2 && quoteChoicesReady && (
        <div
          id="quote-price-summary"
          data-booking-nav-heading
          tabIndex={-1}
          className="scroll-mt-44 rounded-xl border border-white/10 bg-navy-dark/40 px-4 py-5 outline-none md:scroll-mt-28"
        >
          {renderQuotePriceSummaryBody()}
        </div>
        )}

        {quoteStep === 3 ? (
          <>
        <div
          id="step3-customer-details"
          ref={step3CustomerDetailsRef}
          className={`${BOOKING_PANEL_CLASS} scroll-mt-44 md:scroll-mt-28`}
        >
          <p
            data-booking-nav-heading
            tabIndex={-1}
            className="text-xs font-medium uppercase tracking-wider text-emerald outline-none"
          >
            Your details
          </p>
          <p className="mt-1 mb-4 text-sm text-white/75">
            {canPayNowOnline
              ? "Enter your details, accept the terms, then pay securely with SumUp to confirm your booking."
              : "We need these details for your booking request. For journeys that need manual confirmation, we’ll email a SumUp payment link after we confirm the job."}
          </p>
          <div className="space-y-4 lg:space-y-3.5">
            <div className="grid gap-4 lg:grid-cols-2 lg:gap-3.5">
              <div>
                <label htmlFor="name" className={BOOKING_LABEL_CLASS}>
                  Your Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={customerName}
                  aria-invalid={Boolean(customerNameError)}
                  aria-describedby={customerNameError ? "customer-name-error" : undefined}
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
                  <p id="customer-name-error" role="alert" className="mt-1.5 text-xs text-red-300">
                    {customerNameError}
                  </p>
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
                  aria-invalid={Boolean(mobileNumberError)}
                  aria-describedby={mobileNumberError ? "customer-mobile-error" : "mobile-helper"}
                  onChange={(e) => {
                    setCustomerMobile(e.target.value);
                    if (e.target.value.trim()) {
                      setMobileNumberError("");
                    }
                  }}
                  placeholder="07xxx xxxxxx"
                  className={BOOKING_INPUT_CLASS}
                />
                <p id="mobile-helper" className={BOOKING_HELPER_CLASS}>
                  So we can call or text if we need to reach you about your booking.
                </p>
                {mobileNumberError && (
                  <p id="customer-mobile-error" role="alert" className="mt-1.5 text-xs text-red-300">
                    {mobileNumberError}
                  </p>
                )}
              </div>
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
                aria-invalid={Boolean(emailAddressError)}
                aria-describedby={emailAddressError ? "customer-email-error" : "email-helper"}
                onChange={(e) => {
                  setCustomerEmail(e.target.value);
                  if (e.target.value.trim()) {
                    setEmailAddressError("");
                  }
                }}
                placeholder="you@example.com"
                className={BOOKING_INPUT_CLASS}
              />
              <p id="email-helper" className={BOOKING_HELPER_CLASS}>
                {canPayNowOnline
                  ? "We’ll email your booking confirmation and receipt after you pay with SumUp."
                  : "So we can email your booking confirmation and, when ready, your SumUp payment link."}
              </p>
              {emailAddressError && (
                <p id="customer-email-error" role="alert" className="mt-1.5 text-xs text-red-300">
                  {emailAddressError}
                </p>
              )}
            </div>

            {((isAirportTrip && isFromAirport) || (isA2AFlow && Boolean(pickupAirportCode))) ||
            (returnJourney &&
              ((isAirportTrip && !isFromAirport) ||
                (isA2AFlow && Boolean(dropoffAirportCode)))) ? (
              <div
                id="step3-flight-details"
                className="scroll-mt-44 space-y-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 md:scroll-mt-28"
              >
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                    Flight number <span className="font-normal text-white/45">(optional)</span>
                  </p>
                  <p className="mt-1 text-sm text-white/60">{BOOKING_FLIGHT_NUMBER_HELPER}</p>
                </div>
                {((isAirportTrip && isFromAirport) ||
                  (isA2AFlow && Boolean(pickupAirportCode))) && (
                  <FlightNumberField
                    id="goingFlightNumber"
                    label="Flight number"
                    helperText={BOOKING_FLIGHT_NUMBER_HELPER}
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
                    enabled={quoteStep === 3}
                    error={goingFlightError}
                    onVerifiedChange={(flight) => {
                      setVerifiedGoingFlight(flight);
                    }}
                  />
                )}
                {returnJourney &&
                  ((isAirportTrip && !isFromAirport) ||
                    (isA2AFlow && Boolean(dropoffAirportCode))) && (
                    <FlightNumberField
                      id="collectionFlightNumber"
                      label="Return flight number"
                      helperText={BOOKING_FLIGHT_NUMBER_HELPER}
                      value={collectionFlightNumber}
                      onChange={(value) => {
                        setCollectionFlightNumber(value);
                        if (value.trim()) {
                          setCollectionFlightError("");
                        }
                      }}
                      tripDate={returnDate}
                      airportCode={effectiveAirportCode}
                      direction="from-airport"
                      enabled={quoteStep === 3}
                      error={collectionFlightError}
                      onVerifiedChange={(flight) => {
                        setVerifiedCollectionFlight(flight);
                      }}
                    />
                  )}
              </div>
            ) : null}
          </div>
        </div>

        {paymentError && (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {paymentError}
          </p>
        )}

                  <div id="step3-booking-review" className={`${BOOKING_PANEL_CLASS} scroll-mt-44 md:scroll-mt-28`}>
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
              {((isAirportTrip && isFromAirport) || (isA2AFlow && pickupAirportCode)) && (
                <PreviewRow
                  label="Flight for going"
                  value={
                    verifiedGoingFlight
                      ? formatVerifiedFlightSummary(verifiedGoingFlight)
                      : goingFlightNumber.trim().toUpperCase()
                  }
                />
              )}
              {returnJourney &&
                ((isAirportTrip && !isFromAirport) || (isA2AFlow && dropoffAirportCode)) && (
                <PreviewRow
                  label="Flight for collection"
                  value={
                    verifiedCollectionFlight
                      ? formatVerifiedFlightSummary(verifiedCollectionFlight)
                      : collectionFlightNumber.trim().toUpperCase()
                  }
                />
              )}
              <PreviewRow
                label="Passengers"
                value={effectivePassengers == null ? "—" : String(effectivePassengers)}
              />
              <PreviewRow
                label="Suitcases"
                value={suitcases == null ? "—" : String(suitcases)}
              />
              {pricingConfirmationRequired ? (
                <PreviewRow label="Pricing" value={priceConfirmationLabel} />
              ) : isManualQuoteJourney ? (
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
                  label={
                    appliedPersonalQuote
                      ? "Personal quoted fare"
                      : returnJourney
                        ? "Your fixed return journey price"
                        : "Your fixed journey price"
                  }
                  value={formatQuote(
                    testChargeAmount ?? appliedPersonalQuote?.agreedAmount ?? liveQuote.amount,
                  )}
                />
              ) : null}
              {appliedPersonalQuote && liveQuote && testChargeAmount === null ? (
                <PreviewRow
                  label="Standard website fare"
                  value={formatQuote(liveQuote.amount)}
                />
              ) : null}
              {isRequestQuote && !isManualQuoteJourney ? (
                <PreviewRow label="Fulfilment" value={MINIBUS_PARTNER_NOTE} />
              ) : null}
            </dl>
          </div>

        {submitError && (
          <p
            id="quote-submit-error"
            role="alert"
            className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
          >
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
                  I understand luggage capacity may need written confirmation before this booking is
                  accepted.
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
                    : appliedPersonalQuote
                      ? formatQuote(appliedPersonalQuote.agreedAmount)
                      : liveQuote
                        ? formatQuote(liveQuote.amount)
                        : undefined
              }
            />

            <MarketingOptIn checked={marketingOptIn} onCheckedChange={setMarketingOptIn} />

            <div
              id="step3-payment-actions"
              ref={step3PaymentActionsRef}
              className="scroll-mt-44 space-y-3 md:scroll-mt-28"
            >
            {canPayNowOnline && liveQuote && (
              <div className="space-y-3">
                {paymentError ? (
                  <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {paymentError}
                  </p>
                ) : null}
                {openCheckout ? (
                  <div className="space-y-3 rounded-2xl border border-emerald/35 bg-emerald/10 px-4 py-4">
                    <p className="text-sm font-semibold text-emerald">Secure payment ready</p>
                    <p className="text-xs leading-relaxed text-white/75">
                      Your booking details are saved for {openCheckout.amountLabel}. Continue to
                      SumUp to finish paying, or edit your booking first.
                    </p>
                    {paymentPopupBlocked ? (
                      <p className="text-xs leading-relaxed text-amber-200">
                        Payment could not open automatically. Tap “Continue to SumUp” below.
                      </p>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={handleReturnToEditBooking}
                        className="w-full rounded-xl border border-white/20 bg-white/5 py-3 text-sm font-semibold text-white transition-all hover:bg-white/10"
                      >
                        Return to / Edit booking
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenPaymentAgain}
                        disabled={paymentLoading}
                        className="w-full rounded-xl bg-white py-3 text-sm font-bold text-navy transition-all hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {paymentLoading ? "Opening secure payment…" : "Continue to SumUp"}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleStartFreshCheckout}
                      className="w-full text-center text-xs font-medium text-white/55 underline-offset-2 hover:text-white/80 hover:underline"
                    >
                      Start a new payment link
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-xs leading-relaxed text-white/50">
                      You’ll be securely redirected to SumUp to complete your payment. Your booking
                      details stay saved if you return to this page.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handlePayNow()}
                      disabled={
                        paymentLoading ||
                        submitted ||
                        !termsAccepted ||
                        !customerName.trim() ||
                        !customerEmail.trim() ||
                        !customerMobile.trim() ||
                        !tripDetailsReady
                      }
                      className="w-full rounded-xl bg-white py-3.5 text-sm font-bold text-navy transition-all hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {paymentLoading
                        ? "Opening secure payment…"
                        : testChargeAmount !== null
                          ? "Pay £1.00 test charge with SumUp"
                          : `Pay ${formatQuote(appliedPersonalQuote?.agreedAmount ?? liveQuote.amount)} now with SumUp`}
                    </button>
                    {(!customerName.trim() ||
                      !customerEmail.trim() ||
                      !customerMobile.trim() ||
                      !termsAccepted) && (
                      <p className="text-center text-xs text-amber-200/90">
                        Enter your name, mobile, email and accept the terms before paying.
                      </p>
                    )}
                    <p className="text-center text-xs text-white/50">
                      Card payments are processed securely by SumUp. You&apos;ll receive a branded
                      invoice by email after payment.
                    </p>
                  </>
                )}
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
                  className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light disabled:cursor-not-allowed disabled:opacity-70"
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
                  className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitted ? submitInProgressLabel : confirmButtonLabel}
                </button>
              </div>
            )}
            {renderStartNewQuoteControls()}
            </div>
          </div>
          </>
        ) : quoteStep === 2 ? (
          <div id="quote-step2-next" className="scroll-mt-44 space-y-3 md:scroll-mt-28">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  navigateQuoteStep(1);
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
                className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light disabled:cursor-not-allowed disabled:opacity-70"
              >
                Continue to your details
              </button>
            </div>
            {liveQuote &&
            canPayNowOnline &&
            !isEnquiryOnly &&
            !showsRequestQuoteFlow &&
            !appliedPersonalQuote &&
            !submitted ? (
              <button
                type="button"
                onClick={handleSaveQuoteClick}
                className="w-full rounded-xl border border-white/25 bg-transparent py-3 text-sm font-semibold text-white transition-all hover:bg-white/5"
              >
                Save Quote
              </button>
            ) : null}
            {renderStartNewQuoteControls()}
            {saveQuotePrompt ? (
              <p className="text-center text-xs text-emerald/90" role="status">
                {saveQuotePrompt}
              </p>
            ) : null}
            {travelDetailsBlocker ? (
              <p className="text-center text-xs text-white/55" role="status">
                {travelDetailsBlocker}
              </p>
            ) : (
              <p className="text-center text-xs text-white/45">
                {exceedsOnlineCapacity
                  ? "Next: your contact details for the tailored quote request."
                  : "Next: your contact details to confirm the booking."}
              </p>
            )}
          </div>
        ) : quoteResultsReady ? null : (
          <div id="quote-step1-next" className="flex w-full scroll-mt-44 flex-col gap-2 md:scroll-mt-28">
            {renderStep1PrimaryActions()}
          </div>
        )}
      </form>
      <SaveQuoteModal
        open={saveQuoteOpen}
        onClose={() => {
          setSaveQuoteOpen(false);
          setSaveQuotePrompt("");
        }}
        buildPayload={() => buildSaveQuotePayload(syncScheduleFieldsFromInputs())}
        onBookNow={() => {
          // Continue existing Book Now path (travel details → pay).
          const form = document.getElementById("quoteForm") as HTMLFormElement | null;
          form?.requestSubmit();
        }}
      />
    </div>
  );
}

export default memo(QuoteCard);
