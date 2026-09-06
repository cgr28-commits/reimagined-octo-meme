"use client";

import { FormEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import AddressInput from "@/components/AddressInput";
import QuoteProgressiveRoute from "@/components/QuoteProgressiveRoute";
import BookingTermsConsent from "@/components/BookingTermsConsent";
import MarketingOptIn from "@/components/MarketingOptIn";
import {
  BookingErrorHelpCluster,
  StartNewQuoteControls,
} from "@/components/QuoteBookingHelpControls";
import TripMap from "@/components/TripMap";
import { buildBookingMessage, buildEnquiryBookingMessage, isValidEmailAddress, isValidMobileNumber, type BookingDetails } from "@/lib/booking-message";
import { buildMarketingOptInFields, recordMarketingOptIn } from "@/lib/marketing-api";
import { TERMS_LAST_UPDATED } from "@/lib/terms";
import { CANCELLATION_POLICY_VERSION } from "../../shared/refund-ops";
import { detectMobileDevice, useIsMobileDevice } from "@/lib/device";
import {
  focusFirstInvalidField,
  quoteStepTargetId,
  scheduleScrollToBookNowAfterExpressAck,
  scrollJourneySummaryAfterTimeConfirm,
  scrollQuoteStage,
  type QuoteStepNavTarget,
} from "@/lib/quote-step-nav-scroll";
import {
  trackDropoffPlaceSelected,
  trackPickupPlaceSelected,
  trackQuoteManualEnquiry,
  trackQuoteRequestClicked,
  trackQuoteStarted,
  trackQuoteToolViewed,
  trackQuoteValidationError,
  trackStartNewQuoteClick,
  trackWhatsAppBookingHelpClick,
} from "@/lib/quote-funnel-analytics";
import {
  bookingTextFieldClass,
  quoteDateTimeFieldShellClass,
  quoteDateTimeInputClass,
  type QuoteFieldHighlightState,
} from "@/lib/quote-ui-highlight";
import {
  AIRPORTS,
  isInstantPayVehicle,
  isVehicleEnquiryOnly,
  isVehicleRequestQuote,
  MAX_ONLINE_PASSENGERS,
  needsLuggageCapacityConfirmation,
  SERVICE_FLAGS,
  showsOnlineGuidePrice,
  SITE,
  VEHICLE_TYPES,
} from "@/lib/data";
import {
  formatPassengerChoice,
  formatSuitcaseChoice,
  MAX_PUBLIC_SUITCASES,
  selectVehicleForParty,
  vehicleShortLabel,
} from "@/lib/vehicle-selection";
import {
  clampPassengerCount,
  PASSENGER_LIMIT_ERROR,
} from "../../shared/passenger-limits";
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
  isPaymentFareMismatchError,
  isPaymentRouteReconfirmationError,
  isPaymentRouteServiceUnavailableError,
  isSumUpPaymentEnabled,
} from "@/lib/create-payment";
import {
  checkCustomerSmartAvailability,
  CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE,
  isCustomerSmartAvailabilityBlockMessage,
  rememberCustomerSmartAvailabilityPreview,
  type CustomerSmartAvailabilityCheckResult,
} from "@/lib/customer-smart-availability-client";
import type { CustomerPublicAlternativeTime } from "../../shared/customer-smart-availability";
import { QUOTE_REQUIRED_FIELD_MESSAGES } from "../../shared/quote-required-field-messages";
import { planJourneyDirectionDependentReset } from "../../shared/quote-journey-direction";
import { CustomerSmartAvailabilityBlocked } from "@/components/CustomerSmartAvailabilityBlocked";
import {
  ROUTE_RECONFIRMATION_MESSAGE,
  ROUTE_SERVICE_UNAVAILABLE_MESSAGE,
  addressTextMatchesPlace,
  placeDisplayLabel,
  restoredPlacesReadyForPayment,
} from "../../shared/route-reconfirmation";
import { calculateServerQuote } from "@/lib/quick-quote-api";
import {
  validatePersonalQuoteCode,
  type PersonalQuotePublicSummary,
} from "@/lib/personal-quote-api";
import SaveQuoteModal from "@/components/SaveQuoteModal";
import ExpressDropOffChoice from "@/components/ExpressDropOffChoice";
import {
  BookWithConfidence,
  FinalPayableBreakdown,
  FixedPriceAssurance,
  PromotionalPriceBreakdown,
  buildOpenWebsiteFareBreakdown,
} from "@/components/QuoteFareTrust";
import {
  canProceedWithoutExpressDropOff,
  composeFareWithExpressDropOff,
  resolveExpressDropOff,
  shouldDefaultExpressSelectedOnNewEligibility,
} from "../../shared/express-drop-off";
import {
  RETURN_OFFER_CONFIG,
  isReturnOfferAirportJourney,
} from "../../shared/return-offer";
import { resolveJourneyAirportFees } from "../../shared/airport-fixed-costs";
import { promoFieldsFromFareBreakdown } from "../../shared/website-promo-pricing";
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
  FLIGHT_NUMBER_FORMAT_ERROR,
  isValidFlightNumberFormat,
} from "@/lib/flight-lookup";
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
  isIncompleteAddressPlace,
  INCOMPLETE_PICKUP_ADDRESS_MESSAGE,
  isPlaceSelected,
  isBelfastAirportRoiInstantJourney,
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
const BOOKING_HELPER_CLASS = "quote-helper-text mt-1.5 text-xs";

function fieldState(options: {
  hasError?: boolean;
  complete: boolean;
  activeStep: boolean;
}): QuoteFieldHighlightState {
  if (options.hasError) return "error";
  if (!options.activeStep) return "default";
  if (options.complete) return "complete";
  return "needs";
}

const ESTATE = "Estate Car (1–4 passengers)" as const;

/** Public online booking: Saloon / Estate only (1–4 passengers). */
const SELECTOR_MAX_PASSENGERS = MAX_ONLINE_PASSENGERS;
const SELECTOR_MAX_SUITCASES = MAX_PUBLIC_SUITCASES;

type VehicleType = (typeof VEHICLE_TYPES)[number];

/** Public site never offers 5–7 / minibus online — always false after clamping. */
function exceedsOnlineVehicleOptions(passengers: number, suitcases: number): boolean {
  return passengers > MAX_ONLINE_PASSENGERS || suitcases > SELECTOR_MAX_SUITCASES;
}

/** True only when the customer has deliberately chosen both party fields (1–4 + bags). */
function isPartySelectionComplete(
  passengers: number | null,
  suitcases: number | null,
): boolean {
  if (passengers == null || suitcases == null) return false;
  return (
    Number.isInteger(passengers) &&
    passengers >= 1 &&
    passengers <= MAX_ONLINE_PASSENGERS &&
    Number.isInteger(suitcases) &&
    suitcases >= 0 &&
    suitcases <= SELECTOR_MAX_SUITCASES
  );
}

function effectivePartyPassengers(passengers: number | null): number | null {
  if (passengers == null) return null;
  if (
    !Number.isInteger(passengers) ||
    passengers < 1 ||
    passengers > MAX_ONLINE_PASSENGERS
  ) {
    return null;
  }
  return passengers;
}

function clampPublicSuitcases(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(SELECTOR_MAX_SUITCASES, Math.max(0, Math.trunc(n)));
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
  needsCompletion = false,
}: {
  label: string;
  options: number[];
  value: number | null;
  onChange: (value: number) => void;
  formatOption?: (value: number) => string;
  needsCompletion?: boolean;
}) {
  return (
    <div
      className={
        needsCompletion && value == null
          ? "rounded-2xl border border-emerald/45 bg-emerald/[0.04] p-2 ring-1 ring-emerald/20"
          : "rounded-2xl border border-transparent p-2"
      }
    >
      <p className="form-label mb-2">
        {label}
        {needsCompletion && value == null ? (
          <span className="ml-1 font-normal normal-case tracking-normal text-emerald/80">
            (required)
          </span>
        ) : null}
      </p>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
        role="group"
        aria-label={label}
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
      <dt className="form-label mb-0">{label}</dt>
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
  /**
   * Force the progressive journey choice (e.g. EMERGE → address-to-address).
   * When omitted, airport landings use direction; venue/drop-off hints without an
   * airport default to address-to-address.
   */
  initialJourneyIntent?: QuoteJourneyIntent;
  /** Ads page_type custom parameter (e.g. emerge_belfast). */
  pageType?: AdsQuotePageType;
  /** Cap passenger selector (EMERGE online capacity is 4). */
  maxPassengers?: number;
  /** Secure follow-up return-offer token — server applies the 5% saving. */
  returnOfferToken?: string;
  /**
   * Quote-ready pickup from a validated Return Offer token only.
   * Never pass URL/query-string address text here.
   */
  initialPickupPlace?: SelectedPlace | null;
  /**
   * Quote-ready drop-off from a validated Return Offer token only.
   * Never pass URL/query-string address text here.
   */
  initialDropoffPlace?: SelectedPlace | null;
};

function resolveLandingJourneyIntent(params: {
  initialJourneyIntent?: QuoteJourneyIntent;
  initialAirportCode: string;
  initialDirection: TripDirection;
  initialAddressHint: string;
  initialDropoffHint: string;
}): QuoteJourneyIntent | null {
  if (params.initialJourneyIntent) {
    return params.initialJourneyIntent;
  }
  if (isCustomerAirportCode(params.initialAirportCode)) {
    return intentFromDirection(params.initialDirection);
  }
  // Venue / event pages (drop-off or address hint, no airport) → door-to-door.
  if (params.initialDropoffHint || params.initialAddressHint) {
    return "address-to-address";
  }
  return null;
}

function QuoteCard({
  initialAirportCode = "",
  initialDirection = "to-airport",
  initialAddressHint = "",
  initialDropoffHint = "",
  initialJourneyIntent,
  pageType = "main",
  maxPassengers = MAX_ONLINE_PASSENGERS,
  returnOfferToken = "",
  initialPickupPlace = null,
  initialDropoffPlace = null,
}: QuoteCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const step1JourneyRef = useRef<HTMLDivElement>(null);
  /** Stage 6: YOUR ROUTE / results stack after bags complete. */
  const routeSummaryRef = useRef<HTMLDivElement>(null);
  const step2TravelDetailsRef = useRef<HTMLDivElement>(null);
  const step2JourneySummaryRef = useRef<HTMLDivElement>(null);
  const step3CustomerDetailsRef = useRef<HTMLDivElement>(null);
  const step3PaymentActionsRef = useRef<HTMLDivElement>(null);
  const shortNoticeResultRef = useRef<HTMLDivElement>(null);
  const bookingResultRef = useRef<HTMLDivElement>(null);
  /** Scroll once when availability-confirmation result first appears (not on re-renders). */
  const pendingShortNoticeScrollRef = useRef(false);
  /** Scroll once when booking/quote-request confirmation card first appears. */
  const pendingBookingResultScrollRef = useRef(false);
  /** Set only by explicit Book Now / Continue / Back — never by quote re-renders. */
  const pendingQuoteStepNavScrollRef = useRef<QuoteStepNavTarget | null>(null);
  /** Ignore a second tap while availability + step-3 commit are in flight. */
  const continueToDetailsInFlightRef = useRef(false);
  const [continueToDetailsBusy, setContinueToDetailsBusy] = useState(false);
  /** Stable id for once-per-attempt Step 1 funnel diagnostics (not PII). */
  const quoteFunnelAttemptIdRef = useRef(
    `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
  );
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
  const confirmedInitialPickup = isQuoteReadyPlace(initialPickupPlace)
    ? initialPickupPlace
    : null;
  const confirmedInitialDropoff = isQuoteReadyPlace(initialDropoffPlace)
    ? initialDropoffPlace
    : null;
  const [pickupAddress, setPickupAddress] = useState(
    confirmedInitialPickup
      ? confirmedInitialPickup.displayAddress || confirmedInitialPickup.formattedAddress
      : initialDirection === "from-airport" && initialAirportPlace
        ? initialAirportPlace.displayAddress || initialAirportPlace.formattedAddress
        : initialDirection === "to-airport"
          ? initialAddressHint
          : "",
  );
  const [dropoffAddress, setDropoffAddress] = useState(
    confirmedInitialDropoff
      ? confirmedInitialDropoff.displayAddress || confirmedInitialDropoff.formattedAddress
      : initialDropoffHint ||
        (initialDirection === "to-airport" && initialAirportPlace
          ? initialAirportPlace.displayAddress || initialAirportPlace.formattedAddress
          : initialDirection === "from-airport"
            ? initialAddressHint
            : ""),
  );
  const [pickupPlace, setPickupPlace] = useState<SelectedPlace>(() =>
    confirmedInitialPickup
      ? confirmedInitialPickup
      : initialDirection === "from-airport" && initialAirportPlace
        ? initialAirportPlace
        : emptySelectedPlace(),
  );
  const [dropoffPlace, setDropoffPlace] = useState<SelectedPlace>(() =>
    confirmedInitialDropoff
      ? confirmedInitialDropoff
      : initialDirection === "to-airport" && initialAirportPlace
        ? initialAirportPlace
        : emptySelectedPlace(),
  );
  const [pickupPlaceError, setPickupPlaceError] = useState("");
  const [dropoffPlaceError, setDropoffPlaceError] = useState("");
  const [passengersError, setPassengersError] = useState("");
  const [suitcasesError, setSuitcasesError] = useState("");
  const [smartAvailabilityBlocked, setSmartAvailabilityBlocked] = useState(false);
  const [availabilityAlternatives, setAvailabilityAlternatives] = useState<
    CustomerPublicAlternativeTime[]
  >([]);
  const [selectingAlternativeTime, setSelectingAlternativeTime] = useState<string | null>(null);
  /** Returning customer must re-pick Places when restore lacked coords / mismatched text. */
  const [routeReconfirmationRequired, setRouteReconfirmationRequired] = useState(false);
  const [pickupRestoredHint, setPickupRestoredHint] = useState(false);
  const [dropoffRestoredHint, setDropoffRestoredHint] = useState(false);
  /** Explicit One Way / Return — null until the customer taps a choice. */
  const [journeyMode, setJourneyMode] = useState<"one-way" | "return" | null>(
    returnOfferToken ? "one-way" : null,
  );
  const returnJourney = journeyMode === "return";
  const [tripDateError, setTripDateError] = useState("");
  const [returnDateError, setReturnDateError] = useState("");
  const [customerNameError, setCustomerNameError] = useState("");
  const [goingFlightNumber, setGoingFlightNumber] = useState("");
  const [collectionFlightNumber, setCollectionFlightNumber] = useState("");
  const [goingFlightError, setGoingFlightError] = useState("");
  const [collectionFlightError, setCollectionFlightError] = useState("");
  const [goingFlightLookupStatus, setGoingFlightLookupStatus] = useState<
    "idle" | "loading" | "verified" | "error" | "unavailable"
  >("idle");
  const [collectionFlightLookupStatus, setCollectionFlightLookupStatus] = useState<
    "idle" | "loading" | "verified" | "error" | "unavailable"
  >("idle");
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
  const [journeyIntent, setJourneyIntent] = useState<QuoteJourneyIntent | null>(() =>
    resolveLandingJourneyIntent({
      initialJourneyIntent,
      initialAirportCode,
      initialDirection,
      initialAddressHint,
      initialDropoffHint,
    }),
  );
  const [intentAirportCode, setIntentAirportCode] = useState<CustomerAirportCode | "">(() => {
    if (isCustomerAirportCode(initialAirportCode)) {
      return initialAirportCode;
    }
    return "";
  });
  const [routeMetrics, setRouteMetrics] = useState<TripRouteMetrics | null>(null);
  /** Worker-authoritative journey/fixed split (same engine as SumUp). Prefer over browser metrics. */
  const [serverFareParts, setServerFareParts] = useState<{
    journeyFareGbp: number;
    airportFixedCostsGbp: number;
    amountGbp: number;
  } | null>(null);
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
  const [expressDropOffSelected, setExpressDropOffSelected] = useState(true);
  const [expressRemovalAck, setExpressRemovalAck] = useState(false);
  const [expressAckRequired, setExpressAckRequired] = useState(false);
  const [expressEditing, setExpressEditing] = useState(false);
  /** A2A-only: fee line ids the customer independently removed. */
  const [removedAirportFeeIds, setRemovedAirportFeeIds] = useState<string[]>([]);
  const expressEligibilityPrimedRef = useRef(false);
  const expressWasEligibleRef = useRef(false);
  const expressRemovalAckWasCheckedRef = useRef(false);
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
      effectivePartyPassengers(passengers) ?? passengers,
      suitcases,
    );
  const [capacityConfirmed, setCapacityConfirmed] = useState(false);
  const [confirmStartNewQuote, setConfirmStartNewQuote] = useState(false);
  /** Bumped on Start a New Quote so address inputs remount with clean internal state. */
  const [formResetKey, setFormResetKey] = useState(0);

  useEffect(() => {
    const pax = effectivePartyPassengers(passengers);
    if (pax == null || suitcases == null) {
      return;
    }
    setVehicle(getAutoVehicle(pax, suitcases, IS_A2A_PRIMARY));
  }, [passengers, suitcases]);
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
    !isDublinCityCorridorJourney(pickupPlace, dropoffPlace) &&
    !isBelfastAirportRoiInstantJourney(pickupPlace, dropoffPlace);
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
  /** Incomplete place selection — never show out-of-area for these. */
  const isIncompletePickupAddress =
    isA2AFlow &&
    isPlaceSelected(pickupPlace) &&
    isIncompleteAddressPlace(pickupPlace) &&
    !detectAirportCodeFromPlace(pickupPlace);
  const showsRequestQuoteFlow =
    isRequestQuote || isManualQuoteJourney || pricingConfirmationRequired;
  const effectiveAirportCode = isA2AFlow
    ? pickupAirportCode || dropoffAirportCode || ""
    : airportCode;
  const isFromAirport = isA2AFlow
    ? Boolean(pickupAirportCode)
    : tripDirection === "from-airport";
  /**
   * Outbound flight number: airport pickup only (collecting the customer from an airport).
   * To-airport / address-to-address do not ask for an outbound flight.
   */
  const needsOutboundFlightNumber =
    (isAirportTrip && isFromAirport) ||
    (isA2AFlow && Boolean(pickupAirportCode)) ||
    journeyKind === "airport-to-address" ||
    journeyKind === "airport-to-airport";
  /**
   * Return/collection flight: only when returning from an airport drop-off
   * (customer is collected at the airport on the return leg).
   */
  const needsReturnCollectionFlightNumber =
    returnJourney &&
    ((isAirportTrip && !isFromAirport) ||
      (isA2AFlow && Boolean(dropoffAirportCode)) ||
      journeyKind === "address-to-airport");
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
    // Public online path is 1–4 only.
    if (passengers == null) return;
    if (passengers > passengerLimit) {
      setPassengers(passengerLimit);
    }
    if (exactPassengers != null) {
      setExactPassengers(null);
    }
  }, [passengerLimit, passengers, exactPassengers]);

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
    rememberCustomerSmartAvailabilityPreview();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") !== "return") {
      return;
    }

    // Paid checkout lands on the dedicated thank-you URL for Google Ads.
    // Always www — apex /booking-confirmed/ 404s.
    const confirmedUrl = new URL("/booking-confirmed/", `${SITE.url.replace(/\/$/, "")}/`);
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
      setPassengers(clampPassengerCount(testBooking.passengers));
      setSuitcases(clampPublicSuitcases(testBooking.suitcases));
      setExactPassengers(null);
      setVehicle(testBooking.vehicle);
      setGoingFlightNumber(testBooking.flightNumber);
      return;
    }

    const savedPickup = localStorage.getItem(PICKUP_STORAGE_KEY);
    const savedDropoff = localStorage.getItem(DROPOFF_STORAGE_KEY);
    // Keep dedicated landing-page address hints (e.g. Bangor / event venues) over stale localStorage.
    // Also keep the route-page airport place so transfer landings stay preselected.
    const keepInitialPickup =
      Boolean(returnOfferToken) ||
      isQuoteReadyPlace(initialPickupPlace) ||
      (initialDirection === "to-airport" && Boolean(initialAddressHint)) ||
      (initialDirection === "from-airport" && isCustomerAirportCode(initialAirportCode));
    const keepInitialDropoff =
      Boolean(returnOfferToken) ||
      isQuoteReadyPlace(initialDropoffPlace) ||
      Boolean(initialDropoffHint) ||
      (initialDirection === "from-airport" && Boolean(initialAddressHint)) ||
      (initialDirection === "to-airport" && isCustomerAirportCode(initialAirportCode));

    // Restore quote + customer details after SumUp tab switches / accidental reloads.
    const draft = readBookingFormDraft();

    // Places first: only quote-ready objects (placeId + lat/lng) count as confirmed.
    // Address text alone must never unlock payment.
    const restoredPickupPlace =
      !keepInitialPickup && draft?.pickupPlace && isQuoteReadyPlace(draft.pickupPlace)
        ? draft.pickupPlace
        : !keepInitialPickup
          ? readConfirmedPickupPlace()
          : null;
    const restoredDropoffPlace =
      !keepInitialDropoff && draft?.dropoffPlace && isQuoteReadyPlace(draft.dropoffPlace)
        ? draft.dropoffPlace
        : !keepInitialDropoff
          ? readConfirmedDropoffPlace()
          : null;

    const draftPickupText = !keepInitialPickup
      ? (draft?.pickupAddress?.trim() || savedPickup?.trim() || "")
      : "";
    const draftDropoffText = !keepInitialDropoff
      ? (draft?.dropoffAddress?.trim() || savedDropoff?.trim() || "")
      : "";

    let needsRouteReconfirm = false;

    if (!keepInitialPickup) {
      if (
        restoredPickupPlace &&
        (!draftPickupText || addressTextMatchesPlace(draftPickupText, restoredPickupPlace))
      ) {
        setPickupPlace(restoredPickupPlace);
        setPickupAddress(placeDisplayLabel(restoredPickupPlace) || draftPickupText);
        setPickupRestoredHint(true);
        setPickupPlaceError("");
      } else if (draftPickupText) {
        // Text without matching confirmed place — show it, but force reselection.
        setPickupAddress(draftPickupText);
        setPickupPlace(emptySelectedPlace());
        setPickupRestoredHint(false);
        setPickupPlaceError(ROUTE_RECONFIRMATION_MESSAGE);
        needsRouteReconfirm = true;
        clearConfirmedPickupPlace();
      }
    }

    if (!keepInitialDropoff) {
      if (
        restoredDropoffPlace &&
        (!draftDropoffText || addressTextMatchesPlace(draftDropoffText, restoredDropoffPlace))
      ) {
        setDropoffPlace(restoredDropoffPlace);
        setDropoffAddress(placeDisplayLabel(restoredDropoffPlace) || draftDropoffText);
        setDropoffRestoredHint(true);
        setDropoffPlaceError("");
      } else if (draftDropoffText) {
        setDropoffAddress(draftDropoffText);
        setDropoffPlace(emptySelectedPlace());
        setDropoffRestoredHint(false);
        setDropoffPlaceError(ROUTE_RECONFIRMATION_MESSAGE);
        needsRouteReconfirm = true;
        clearConfirmedDropoffPlace();
      }
    }

    if (needsRouteReconfirm) {
      setRouteReconfirmationRequired(true);
      setRouteMetrics(null);
      setServerFareParts(null);
    }

    if (draft && !testBooking) {
      // Address/place restore handled above — do not re-apply text-only as confirmed.
      if (draft.tripDate) setTripDate(draft.tripDate);
      if (draft.tripTime) setTripTime(draft.tripTime);
      if (!returnOfferToken && typeof draft.returnJourney === "boolean") {
        setJourneyMode(draft.returnJourney ? "return" : "one-way");
      }
      if (
        !returnOfferToken &&
        (draft.journeyMode === "one-way" || draft.journeyMode === "return")
      ) {
        setJourneyMode(draft.journeyMode);
      }
      if (draft.returnDate) setReturnDate(draft.returnDate);
      if (draft.returnTime) setReturnTime(draft.returnTime);
      if (typeof draft.passengers === "number" && draft.passengers > 0) {
        setPassengers(clampPassengerCount(draft.passengers));
      }
      if (typeof draft.suitcases === "number" && draft.suitcases >= 0) {
        setSuitcases(clampPublicSuitcases(draft.suitcases));
      }
      setExactPassengers(null);
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
      if (!returnOfferToken) {
        if (draft.journeyIntent) setJourneyIntent(draft.journeyIntent);
        if (draft.intentAirportCode) setIntentAirportCode(draft.intentAirportCode);
      }
      if (typeof draft.termsAccepted === "boolean") setTermsAccepted(draft.termsAccepted);
      if (typeof draft.marketingOptIn === "boolean") setMarketingOptIn(draft.marketingOptIn);
      if (typeof draft.expressDropOffSelected === "boolean") {
        setExpressDropOffSelected(draft.expressDropOffSelected);
        expressEligibilityPrimedRef.current = false;
      }
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
  }, [
    initialAddressHint,
    initialAirportCode,
    initialDirection,
    initialDropoffHint,
    initialDropoffPlace,
    initialPickupPlace,
    returnOfferToken,
  ]);

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
        setPassengers(clampPassengerCount(draft.passengers));
      }
      if (typeof draft.suitcases === "number" && draft.suitcases >= 0) {
        setSuitcases(clampPublicSuitcases(draft.suitcases));
      }
      setExactPassengers(null);
      if (
        draft.vehicle &&
        (VEHICLE_TYPES as readonly string[]).includes(draft.vehicle)
      ) {
        setVehicle(draft.vehicle as VehicleType);
      }
      setBookingSent(false);
      setQuoteStep(1);
    }

    if (!returnOfferToken && window.location.hash === "#quote") {
      const params = new URLSearchParams(window.location.search);
      const airportFromQuery = params.get("airport")?.trim().toUpperCase();
      if (airportFromQuery) {
        applyAirportPrefill(airportFromQuery);
      }
    }

    if (!returnOfferToken) {
      const draftPrefill = readPrefillQuoteDraft();
      if (draftPrefill) {
        applyDraftPrefill(draftPrefill);
      } else {
        const stored = readPrefillAirport();
        if (stored) {
          applyAirportPrefill(stored);
        }
      }
    }

    function handlePrefill(event: Event) {
      if (returnOfferToken) return;
      const code = (event as CustomEvent<string>).detail;
      if (code) {
        applyAirportPrefill(code);
      }
    }

    function handleDraftPrefill(event: Event) {
      if (returnOfferToken) return;
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
  }, [returnOfferToken]);

  const isScheduleComplete =
    Boolean(tripDate && tripTime) &&
    isTripDateOnOrAfterToday(tripDate) &&
    isTripDateTimeNotInPast(tripDate, tripTime) &&
    (!returnJourney ||
      (Boolean(returnDate && returnTime) &&
        isReturnAfterOutbound(tripDate, tripTime, returnDate, returnTime)));

  const partySelectionReady = isPartySelectionComplete(passengers, suitcases);
  const effectivePassengers = effectivePartyPassengers(passengers);
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
  // Public flow clamps to 1–4 / 0–4, so this stays false; kept as a hard guard.
  const exceedsOnlineCapacity =
    quoteChoicesReady &&
    effectivePassengers != null &&
    suitcases != null &&
    exceedsOnlineVehicleOptions(effectivePassengers, suitcases);
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
      // Address↔address: no live public price (personalised quote). Needs route metrics
      // only if owner tools compute a guide fare via calculatePointToPointQuote.
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
        null,
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
      null,
      {
        pickup: pickupPlace ?? undefined,
        dropoff: dropoffPlace ?? undefined,
      },
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

  // Prefer Worker-authoritative fare (same resolveWorkerTripRouteMetrics + engine as SumUp)
  // so the displayed/consent amount matches checkout. Browser metrics stay for map display.
  const refreshAuthoritativeServerQuote = useCallback(async (): Promise<boolean> => {
    if (!canShowPrice || isManualQuoteJourney || pricingConfirmationRequired) {
      setServerFareParts(null);
      return false;
    }
    if (isEnquiryOnly && !showGuidePrice) {
      setServerFareParts(null);
      return false;
    }
    const pickup = pickupAddress.trim();
    const dropoff = dropoffAddress.trim();
    if (!pickup || !dropoff || passengers == null || suitcases == null || journeyMode == null) {
      setServerFareParts(null);
      return false;
    }
    try {
      const result = await calculateServerQuote({
        pickupAddress: pickup,
        dropoffAddress: dropoff,
        // Omit client airportCode — Worker derives from addresses (payment parity).
        returnJourney,
        outboundDate: tripDate.trim(),
        outboundTime: tripTime.trim(),
        returnDate: returnJourney ? returnDate.trim() : undefined,
        returnTime: returnJourney ? returnTime.trim() : undefined,
        passengers,
        suitcases,
        // Prefer Worker OSRM; if Workers cannot reach OSRM, use browser road metrics.
        pickupLat: pickupPlace?.lat ?? undefined,
        pickupLng: pickupPlace?.lng ?? undefined,
        dropoffLat: dropoffPlace?.lat ?? undefined,
        dropoffLng: dropoffPlace?.lng ?? undefined,
        pickupPlaceId: pickupPlace?.placeId?.trim() || undefined,
        dropoffPlaceId: dropoffPlace?.placeId?.trim() || undefined,
        routeMetrics: routeMetrics ?? undefined,
      });
      if (
        result.ok &&
        Number.isFinite(result.amount) &&
        typeof result.journeyFareGbp === "number" &&
        Number.isFinite(result.journeyFareGbp)
      ) {
        setServerFareParts({
          journeyFareGbp: Math.round(result.journeyFareGbp * 100) / 100,
          airportFixedCostsGbp:
            typeof result.airportFixedCostsGbp === "number"
              ? Math.round(result.airportFixedCostsGbp * 100) / 100
              : 0,
          amountGbp: Math.round(result.amount * 100) / 100,
        });
        if (
          Number.isFinite(result.distanceKm) &&
          Number.isFinite(result.durationMinutes) &&
          (result.distanceKm ?? 0) > 0 &&
          (result.durationMinutes ?? 0) > 0
        ) {
          setRouteMetrics({
            distanceKm: result.distanceKm!,
            durationMinutes: result.durationMinutes!,
          });
        }
        if (result.smartAvailability?.enforced) {
          applyCustomerAvailabilityResult({
            blocked: Boolean(result.smartAvailability.blocked),
            available: result.smartAvailability.available !== false,
            customerMessage: result.smartAvailability.customerMessage,
            alternativeTimes: result.smartAvailability.alternativeTimes || [],
          });
        }
        return true;
      }
      setServerFareParts(null);
      return false;
    } catch {
      setServerFareParts(null);
      return false;
    }
  }, [
    canShowPrice,
    dropoffAddress,
    dropoffPlace?.lat,
    dropoffPlace?.lng,
    isEnquiryOnly,
    isManualQuoteJourney,
    journeyMode,
    passengers,
    pickupAddress,
    pickupPlace?.lat,
    pickupPlace?.lng,
    pricingConfirmationRequired,
    returnDate,
    returnJourney,
    returnTime,
    routeMetrics,
    showGuidePrice,
    suitcases,
    tripDate,
    tripTime,
  ]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (cancelled) return;
        await refreshAuthoritativeServerQuote();
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [refreshAuthoritativeServerQuote, quoteVehicle]);

  const journeyDistanceLabel = routeMetrics
    ? formatJourneyDistance(routeMetrics.distanceKm)
    : "";
  const journeyDurationLabel = routeMetrics
    ? formatJourneyDuration(routeMetrics.durationMinutes)
    : "";

  const expressSelection = useMemo(
    () =>
      resolveExpressDropOff({
        airportCode: effectiveAirportCode || null,
        fromAirport: isFromAirport,
        returnJourney,
        selected: expressDropOffSelected,
      }),
    [effectiveAirportCode, isFromAirport, returnJourney, expressDropOffSelected],
  );

  // Recalculate Express eligibility when airport / direction / return changes.
  useEffect(() => {
    const nowEligible = resolveExpressDropOff({
      airportCode: effectiveAirportCode || null,
      fromAirport: isFromAirport,
      returnJourney,
      selected: true,
    }).eligible;

    if (!expressEligibilityPrimedRef.current) {
      expressEligibilityPrimedRef.current = true;
      expressWasEligibleRef.current = nowEligible;
      return;
    }

    if (
      shouldDefaultExpressSelectedOnNewEligibility({
        wasEligible: expressWasEligibleRef.current,
        nowEligible,
      })
    ) {
      setExpressDropOffSelected(true);
      setExpressRemovalAck(false);
      setExpressAckRequired(false);
    }
    if (!nowEligible) {
      setExpressRemovalAck(false);
      setExpressAckRequired(false);
      setExpressEditing(false);
    }
    expressWasEligibleRef.current = nowEligible;
  }, [effectiveAirportCode, isFromAirport, returnJourney]);

  // After the free Express acknowledgement is ticked, scroll Book Now into view on mobile.
  // Runs post-paint (not inside the checkbox event) so iOS cannot immediately undo the scroll.
  useEffect(() => {
    const justChecked = expressRemovalAck && !expressRemovalAckWasCheckedRef.current;
    expressRemovalAckWasCheckedRef.current = expressRemovalAck;
    if (!justChecked) return;

    const isMobile = isMobileDevice ?? detectMobileDevice();
    if (!isMobile) return;

    return scheduleScrollToBookNowAfterExpressAck();
  }, [expressRemovalAck, isMobileDevice]);

  /**
   * Open-website promotional fare path (same-order return discount + return offer).
   * Always recompose from the current Express fee — never cache a prior selection.
   */
  const useOpenWebsitePromoPricing =
    testChargeAmount == null &&
    !appliedPersonalQuote &&
    Boolean(liveQuote) &&
    !showsRequestQuoteFlow &&
    !isEnquiryOnly &&
    !pricingConfirmationRequired &&
    !isManualQuoteJourney;

  const isAirportToAirportJourney = journeyKind === "airport-to-airport";

  const airportFeeResolution = useMemo(() => {
    if (isAirportToAirportJourney && pickupAirportCode && dropoffAirportCode) {
      return resolveJourneyAirportFees({
        isAirportToAirport: true,
        pickupAirportCode,
        dropoffAirportCode,
        returnJourney,
        removedFeeIds: removedAirportFeeIds,
      });
    }
    if (effectiveAirportCode && (isAirportTrip || journeyKind === "airport-to-address" || journeyKind === "address-to-airport")) {
      return resolveJourneyAirportFees({
        isAirportToAirport: false,
        airportCode: effectiveAirportCode,
        fromAirport: isFromAirport,
        returnJourney,
        removedFeeIds: removedAirportFeeIds,
      });
    }
    return resolveJourneyAirportFees({
      isAirportToAirport: false,
      removedFeeIds: [],
    });
  }, [
    isAirportToAirportJourney,
    pickupAirportCode,
    dropoffAirportCode,
    effectiveAirportCode,
    isAirportTrip,
    journeyKind,
    isFromAirport,
    returnJourney,
    removedAirportFeeIds,
  ]);

  // Drop stale A2A removals when the route or journey kind changes.
  useEffect(() => {
    setRemovedAirportFeeIds([]);
  }, [
    pickupAirportCode,
    dropoffAirportCode,
    effectiveAirportCode,
    journeyKind,
    isFromAirport,
    returnJourney,
  ]);

  const journeyFareParts = useMemo(() => {
    // Prefer Worker-authoritative split so consent amount matches SumUp requote.
    if (serverFareParts) {
      const fixedFromLines =
        airportFeeResolution.lines.length > 0
          ? airportFeeResolution.totalAppliedGbp
          : serverFareParts.airportFixedCostsGbp;
      return {
        journeyFareGbp: serverFareParts.journeyFareGbp,
        airportFixedCostsGbp: fixedFromLines,
      };
    }
    if (!liveQuote || typeof liveQuote.amount !== "number") {
      return { journeyFareGbp: null as number | null, airportFixedCostsGbp: 0 };
    }
    const quotedFixed =
      typeof liveQuote.airportFixedCostsGbp === "number" &&
      Number.isFinite(liveQuote.airportFixedCostsGbp)
        ? Math.max(0, Math.round(liveQuote.airportFixedCostsGbp * 100) / 100)
        : 0;
    const journey =
      typeof liveQuote.journeyFareGbp === "number" && Number.isFinite(liveQuote.journeyFareGbp)
        ? Math.max(0, Math.round(liveQuote.journeyFareGbp * 100) / 100)
        : Math.max(0, Math.round((liveQuote.amount - quotedFixed) * 100) / 100);
    // Prefer authoritative fee-line total (honours A2A removals; mandatory otherwise).
    const fixed =
      airportFeeResolution.lines.length > 0
        ? airportFeeResolution.totalAppliedGbp
        : quotedFixed;
    return { journeyFareGbp: journey, airportFixedCostsGbp: fixed };
  }, [liveQuote, airportFeeResolution, serverFareParts]);

  const openWebsiteFareBreakdown = useMemo(() => {
    if (!useOpenWebsitePromoPricing || journeyFareParts.journeyFareGbp == null) {
      return null;
    }
    const applyReturnOffer =
      Boolean(returnOfferToken) &&
      !returnJourney &&
      isReturnOfferAirportJourney(pickupAddress, dropoffAddress);
    return buildOpenWebsiteFareBreakdown({
      journeyFareBeforeAirportAccessGbp: journeyFareParts.journeyFareGbp,
      airportFixedCostsGbp: journeyFareParts.airportFixedCostsGbp,
      airportAccessChargeGbp: expressSelection.feeGbp,
      returnJourney,
      ...(applyReturnOffer
        ? { returnOfferDiscountRate: RETURN_OFFER_CONFIG.discountRate }
        : {}),
    });
  }, [
    useOpenWebsitePromoPricing,
    journeyFareParts.journeyFareGbp,
    journeyFareParts.airportFixedCostsGbp,
    expressSelection.feeGbp,
    returnJourney,
    returnOfferToken,
    pickupAddress,
    dropoffAddress,
  ]);

  const transferFareGbp = useMemo(() => {
    if (testChargeAmount != null) return testChargeAmount;
    if (appliedPersonalQuote && typeof appliedPersonalQuote.agreedAmount === "number") {
      return appliedPersonalQuote.agreedAmount;
    }
    if (openWebsiteFareBreakdown) {
      return openWebsiteFareBreakdown.transferFareAfterPromotionsGbp;
    }
    return liveQuote?.amount ?? null;
  }, [
    testChargeAmount,
    appliedPersonalQuote,
    openWebsiteFareBreakdown,
    liveQuote?.amount,
  ]);

  const pricedFare = useMemo(() => {
    if (openWebsiteFareBreakdown) {
      return {
        transferFareGbp: openWebsiteFareBreakdown.transferFareAfterPromotionsGbp,
        extrasGbp: 0,
        expressDropOffFeeGbp: openWebsiteFareBreakdown.airportAccessChargeGbp,
        totalGbp: openWebsiteFareBreakdown.finalAmountPayableGbp,
      };
    }
    if (transferFareGbp == null || !Number.isFinite(transferFareGbp)) return null;
    // Test £1 charge: do not add Express.
    if (testChargeAmount != null) {
      return composeFareWithExpressDropOff({
        transferFareGbp: testChargeAmount,
        expressDropOffFeeGbp: 0,
      });
    }
    return composeFareWithExpressDropOff({
      transferFareGbp,
      expressDropOffFeeGbp: expressSelection.feeGbp,
    });
  }, [
    openWebsiteFareBreakdown,
    transferFareGbp,
    testChargeAmount,
    expressSelection.feeGbp,
  ]);

  /** Pay online at quote time — saloon/estate when SumUp enabled. */
  const placesConfirmedForPayment = restoredPlacesReadyForPayment({
    pickupAddress,
    dropoffAddress,
    pickupPlace,
    dropoffPlace,
  });
  const routeValidationBlockingPayment =
    routeReconfirmationRequired ||
    Boolean(pickupPlaceError) ||
    Boolean(dropoffPlaceError) ||
    !placesConfirmedForPayment ||
    !routeMetrics;
  const canPayNowOnline =
    SERVICE_FLAGS.customerSumUpPay &&
    isSumUpPaymentEnabled() &&
    !isEnquiryOnly &&
    !isManualQuoteJourney &&
    !pricingConfirmationRequired &&
    isInstantPayVehicle(quoteVehicle) &&
    Boolean(liveQuote) &&
    !routeValidationBlockingPayment &&
    !smartAvailabilityBlocked;

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
    setServerFareParts(null);
  }

  /** Any address text edit clears stale route/price — never pay on a previous pair's metrics. */
  function clearStaleRouteAndPriceAfterAddressEdit() {
    setRouteMetrics(null);
    setServerFareParts(null);
    setRouteReconfirmationRequired(false);
    setPaymentError("");
  }

  function requireConfirmedPlacesForPayment(): boolean {
    const pickupOk = addressTextMatchesPlace(pickupAddress, pickupPlace);
    const dropoffOk = addressTextMatchesPlace(dropoffAddress, dropoffPlace);
    if (pickupOk && dropoffOk && routeMetrics) {
      setPickupPlaceError("");
      setDropoffPlaceError("");
      setRouteReconfirmationRequired(false);
      return true;
    }
    if (!pickupOk) {
      setPickupPlaceError(ROUTE_RECONFIRMATION_MESSAGE);
    }
    if (!dropoffOk) {
      setDropoffPlaceError(ROUTE_RECONFIRMATION_MESSAGE);
    }
    setRouteReconfirmationRequired(true);
    setRouteMetrics(null);
    setServerFareParts(null);
    setPaymentError(ROUTE_RECONFIRMATION_MESSAGE);
    setQuoteStep(1);
    window.setTimeout(() => {
      focusFirstInvalidField(cardRef.current ?? document);
    }, 80);
    return false;
  }

  function handlePickupChange(value: string) {
    setPickupAddress(value);
    setPickupRestoredHint(false);
    const hadConfirmed = isPlaceSelected(pickupPlace) || isQuoteReadyPlace(pickupPlace);
    setPickupPlace(emptySelectedPlace());
    setPickupPlaceError("");
    clearConfirmedPickupPlace();
    clearStaleRouteAndPriceAfterAddressEdit();
    if (hadConfirmed || isA2AFlow) {
      clearDownstreamQuoteChoices();
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
    const hadConfirmed = isPlaceSelected(dropoffPlace) || isQuoteReadyPlace(dropoffPlace);
    setDropoffPlace(emptySelectedPlace());
    setDropoffPlaceError("");
    clearConfirmedDropoffPlace();
    clearStaleRouteAndPriceAfterAddressEdit();
    if (hadConfirmed || isA2AFlow) {
      clearDownstreamQuoteChoices();
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
      setRouteReconfirmationRequired(false);
      setPickupPlaceError("");
      setPaymentError("");
    } else if (display.trim()) {
      savePickupAddressLabel(display);
      clearConfirmedPickupPlace();
    }
    if (addressChanged) {
      clearDownstreamQuoteChoices();
    }
    // Completing the address pair: blur so iOS autocomplete cannot steal a second scroll.
    if (
      isA2AFlow &&
      isPlaceSelected(place) &&
      isPlaceSelected(dropoffPlace) &&
      typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur();
    }
  }

  /** Places autocomplete selection only (not airport quick-select). */
  function handlePickupPlacesSuggestionSelect(place: SelectedPlace) {
    handlePickupPlaceSelect(place);
    if (isQuoteReadyPlace(place) && place.placeId?.trim()) {
      markQuoteFunnelStarted();
      trackPickupPlaceSelected(
        quoteFunnelAttemptIdRef.current,
        place.placeId,
        quoteFunnelParams(),
      );
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
      setRouteReconfirmationRequired(false);
      setDropoffPlaceError("");
      setPaymentError("");
    } else if (display.trim()) {
      saveDropoffAddressLabel(display);
      clearConfirmedDropoffPlace();
    }
    if (addressChanged) {
      clearDownstreamQuoteChoices();
    }
    if (
      isA2AFlow &&
      isPlaceSelected(pickupPlace) &&
      isPlaceSelected(place) &&
      typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur();
    }
  }

  /** Places autocomplete selection only (not airport quick-select). */
  function handleDropoffPlacesSuggestionSelect(place: SelectedPlace) {
    handleDropoffPlaceSelect(place);
    if (isQuoteReadyPlace(place) && place.placeId?.trim()) {
      markQuoteFunnelStarted();
      trackDropoffPlaceSelected(
        quoteFunnelAttemptIdRef.current,
        place.placeId,
        quoteFunnelParams(),
      );
    }
  }

  function applyJourneyIntent(intent: QuoteJourneyIntent) {
    if (returnOfferToken) {
      return;
    }
    // Mobile Step 1: blur before the next fields render so the browser cannot
    // jump to keep the tapped journey-type button in view.
    if (
      detectMobileDevice() &&
      typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur();
    }
    if (intent !== journeyIntent) {
      const plan = planJourneyDirectionDependentReset({
        previousIntent: journeyIntent,
        nextIntent: intent,
      });
      if (plan.clearPickup) {
        setPickupPlace(emptySelectedPlace());
        setPickupAddress("");
        setPickupRestoredHint(false);
        setPickupPlaceError("");
        clearConfirmedPickupPlace();
        clearPickupAddressStorage();
      }
      if (plan.clearDropoff) {
        setDropoffPlace(emptySelectedPlace());
        setDropoffAddress("");
        setDropoffRestoredHint(false);
        setDropoffPlaceError("");
        clearConfirmedDropoffPlace();
        clearDropoffAddressStorage();
      }
      if (plan.clearGoingFlight) {
        setGoingFlightNumber("");
        setGoingFlightError("");
        setVerifiedGoingFlight(null);
        setGoingFlightLookupStatus("idle");
      }
      if (plan.clearCollectionFlight) {
        setCollectionFlightNumber("");
        setCollectionFlightError("");
        setVerifiedCollectionFlight(null);
        setCollectionFlightLookupStatus("idle");
      }
      if (plan.clearAirportSelection) {
        setIntentAirportCode("");
        setAirportCode("");
      }
      setRouteMetrics(null);
      setServerFareParts(null);
      setSmartAvailabilityBlocked(false);
      setPaymentError((prev) =>
        isCustomerSmartAvailabilityBlockMessage(prev) ? "" : prev,
      );
      setFormResetKey((key) => key + 1);
    }
    markQuoteFunnelStarted();
    setJourneyIntent(intent);
    setTripMode("address");
    if (intent === "to-airport") {
      setTripDirection("to-airport");
      if (intentAirportCode) {
        const place = quickSelectToPlace(intentAirportCode);
        if (place) {
          const display = place.displayAddress || place.formattedAddress || placeDisplayText(place);
          setDropoffPlace(place);
          setDropoffAddress(display);
          setDropoffPlaceError("");
          saveConfirmedDropoffPlace(place);
          setAirportCode(intentAirportCode);
        }
      }
    } else if (intent === "from-airport") {
      setTripDirection("from-airport");
      if (intentAirportCode) {
        const place = quickSelectToPlace(intentAirportCode);
        if (place) {
          const display = place.displayAddress || place.formattedAddress || placeDisplayText(place);
          setPickupPlace(place);
          setPickupAddress(display);
          setPickupPlaceError("");
          saveConfirmedPickupPlace(place);
          setAirportCode(intentAirportCode);
        }
      }
    }
  }

  function applyIntentAirport(code: CustomerAirportCode) {
    if (returnOfferToken) {
      return;
    }
    const place = quickSelectToPlace(code);
    if (!place) {
      return;
    }
    if (code !== intentAirportCode) {
      clearDownstreamQuoteChoices();
    }
    setIntentAirportCode(code);
    setAirportCode(code);
    markQuoteFunnelStarted();
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
      setPickupPlaceError(QUOTE_REQUIRED_FIELD_MESSAGES.pickup);
      ok = false;
    } else {
      setPickupPlaceError("");
    }
    if (!isPlaceSelected(dropoffPlace)) {
      setDropoffPlaceError(QUOTE_REQUIRED_FIELD_MESSAGES.destination);
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

  function customerAvailabilityBookingInput() {
    return {
      pickupLabel,
      dropoffLabel,
      tripDate,
      tripTime,
      returnJourney,
      returnDate,
      returnTime,
      vehicle: quoteVehicle,
      airportCode: effectiveAirportCode || null,
      isFromAirport,
      journeyDuration: journeyDurationLabel || null,
      routeDurationMinutes: routeMetrics?.durationMinutes ?? null,
      pickupLat: typeof pickupPlace?.lat === "number" ? pickupPlace.lat : null,
      pickupLng: typeof pickupPlace?.lng === "number" ? pickupPlace.lng : null,
      dropoffLat: typeof dropoffPlace?.lat === "number" ? dropoffPlace.lat : null,
      dropoffLng: typeof dropoffPlace?.lng === "number" ? dropoffPlace.lng : null,
    };
  }

  function applyCustomerAvailabilityResult(result: CustomerSmartAvailabilityCheckResult): boolean {
    if (result.blocked) {
      setSmartAvailabilityBlocked(true);
      setAvailabilityAlternatives(result.alternativeTimes);
      setPaymentError(result.customerMessage || CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE);
      return true;
    }
    setSmartAvailabilityBlocked(false);
    setAvailabilityAlternatives([]);
    setPaymentError((prev) =>
      isCustomerSmartAvailabilityBlockMessage(prev) ? "" : prev,
    );
    return false;
  }

  async function applyCustomerSmartAvailabilityCheck(): Promise<boolean> {
    if (!pickupLabel.trim() || !dropoffLabel.trim() || !tripDate.trim() || !tripTime.trim()) {
      return false;
    }
    const result = await checkCustomerSmartAvailability(customerAvailabilityBookingInput());
    return applyCustomerAvailabilityResult(result);
  }

  async function handleSelectAvailabilityAlternative(option: CustomerPublicAlternativeTime) {
    setSelectingAlternativeTime(option.tripTime);
    setTripDate(option.tripDate);
    setTripTime(option.tripTime);
    if (tripDateInputRef.current) tripDateInputRef.current.value = option.tripDate;
    if (tripTimeInputRef.current) tripTimeInputRef.current.value = option.tripTime;
    setTripDateError("");
    try {
      const result = await checkCustomerSmartAvailability({
        ...customerAvailabilityBookingInput(),
        tripDate: option.tripDate,
        tripTime: option.tripTime,
      });
      applyCustomerAvailabilityResult(result);
    } finally {
      setSelectingAlternativeTime(null);
    }
  }

  function handleChooseAnotherTime() {
    navigateQuoteStep(2);
    window.setTimeout(() => {
      const field = tripTimeInputRef.current ?? document.getElementById("time");
      if (field instanceof HTMLElement) {
        try {
          field.focus({ preventScroll: true });
        } catch {
          field.focus();
        }
        field.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 80);
  }

  function handleChooseAnotherDate() {
    navigateQuoteStep(2);
    window.setTimeout(() => {
      const field = tripDateInputRef.current ?? document.getElementById("date");
      if (field instanceof HTMLElement) {
        try {
          field.focus({ preventScroll: true });
        } catch {
          field.focus();
        }
        field.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 80);
  }

  useEffect(() => {
    if (!pickupLabel.trim() || !dropoffLabel.trim() || !tripDate.trim() || !tripTime.trim()) {
      if (smartAvailabilityBlocked) {
        setSmartAvailabilityBlocked(false);
        setAvailabilityAlternatives([]);
        setPaymentError((prev) =>
          isCustomerSmartAvailabilityBlockMessage(prev) ? "" : prev,
        );
      }
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await checkCustomerSmartAvailability({
          pickupLabel,
          dropoffLabel,
          tripDate,
          tripTime,
          returnJourney,
          returnDate,
          returnTime,
          vehicle: quoteVehicle,
          airportCode: effectiveAirportCode || null,
          isFromAirport,
          journeyDuration: journeyDurationLabel || null,
          routeDurationMinutes: routeMetrics?.durationMinutes ?? null,
          pickupLat: typeof pickupPlace?.lat === "number" ? pickupPlace.lat : null,
          pickupLng: typeof pickupPlace?.lng === "number" ? pickupPlace.lng : null,
          dropoffLat: typeof dropoffPlace?.lat === "number" ? dropoffPlace.lat : null,
          dropoffLng: typeof dropoffPlace?.lng === "number" ? dropoffPlace.lng : null,
        });
        if (cancelled) return;
        applyCustomerAvailabilityResult(result);
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    dropoffLabel,
    dropoffPlace?.lat,
    dropoffPlace?.lng,
    effectiveAirportCode,
    isFromAirport,
    journeyDurationLabel,
    pickupLabel,
    pickupPlace?.lat,
    pickupPlace?.lng,
    quoteVehicle,
    returnDate,
    returnJourney,
    returnTime,
    routeMetrics?.durationMinutes,
    tripDate,
    tripTime,
  ]);

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

  function quoteFunnelParams(extra: {
    cta?: string | null;
    validation_reason?: string | null;
    pricing_path?: string | null;
  } = {}) {
    return {
      quote_step: quoteStep,
      journey_intent: journeyIntent,
      airport_code: intentAirportCode || (isAirportTrip ? airportCode : null),
      passengers,
      suitcases,
      return_journey: journeyMode == null ? null : journeyMode === "return",
      page_type: pageType ?? null,
      ...extra,
    };
  }

  function markQuoteFunnelStarted() {
    trackQuoteStarted(quoteFunnelAttemptIdRef.current, quoteFunnelParams());
    void import("@/lib/ad-fraud-events").then(({ recordAdFraudBehaviour }) => {
      recordAdFraudBehaviour("quote_started");
    });
  }

  // Diagnostic: Step 1 quote calculator became visible (once per page/session + pageType).
  useEffect(() => {
    if (quoteStep !== 1) return;
    const target = step1JourneyRef.current ?? cardRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      trackQuoteToolViewed(quoteFunnelParams());
      return;
    }
    let fired = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (fired) return;
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0.15)) {
          fired = true;
          trackQuoteToolViewed(quoteFunnelParams());
          observer.disconnect();
        }
      },
      { threshold: [0.15, 0.35] },
    );
    observer.observe(target);
    return () => observer.disconnect();
    // Intentionally once when Step 1 mounts / returns — not on every field change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteStep, pageType]);

  // Diagnostic: journey cannot use automatic fixed price (manual / enquiry path).
  useEffect(() => {
    if (quoteStep !== 1 || !hasQuoteRoute) return;
    if (!(isManualQuoteJourney || isEnquiryOnly || pricingConfirmationRequired)) return;
    trackQuoteManualEnquiry(
      quoteFunnelAttemptIdRef.current,
      quoteFunnelParams({
        pricing_path: isManualQuoteJourney
          ? "manual_quote"
          : pricingConfirmationRequired
            ? "pricing_confirmation"
            : "enquiry_only",
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    quoteStep,
    hasQuoteRoute,
    isManualQuoteJourney,
    isEnquiryOnly,
    pricingConfirmationRequired,
  ]);

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
    // Wait for the Ads/quote transaction id so owner-email dedupe is by txn.
    if (!quoteTransactionId) {
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

    // Immediate send; cleanup is a no-op so leaving Step 1 cannot cancel.
    void import("@/lib/ad-fraud-events").then(({ recordAdFraudBehaviour }) => {
      recordAdFraudBehaviour("quote_completed");
    });
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
      estimatedPrice: formatQuote(
        serverFareParts?.amountGbp ?? liveQuote.amount,
      ),
      journeyDistance: journeyDistanceLabel || undefined,
      journeyDuration: journeyDurationLabel || undefined,
      isAirportTrip,
      quoteTransactionId,
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
    quoteTransactionId,
    serverFareParts?.amountGbp,
    suitcases,
    tripDate,
    tripTime,
  ]);

  /**
   * Airport-pickup flight numbers are required (format-valid) whenever the journey
   * collects the customer from an airport. Soft AeroDataBox failures do not block;
   * blank / malformed / hard lookup errors do.
   */
  function validateRequiredFlightNumbers(): boolean {
    let ok = true;

    if (needsOutboundFlightNumber) {
      const trimmed = goingFlightNumber.trim();
      if (!trimmed) {
        setGoingFlightError(QUOTE_REQUIRED_FIELD_MESSAGES.flightNumber);
        ok = false;
      } else if (!isValidFlightNumberFormat(trimmed) || goingFlightLookupStatus === "error") {
        setGoingFlightError(FLIGHT_NUMBER_FORMAT_ERROR);
        ok = false;
      } else {
        setGoingFlightError("");
      }
    } else {
      setGoingFlightError("");
    }

    if (needsReturnCollectionFlightNumber) {
      const trimmed = collectionFlightNumber.trim();
      if (!trimmed) {
        setCollectionFlightError(QUOTE_REQUIRED_FIELD_MESSAGES.flightNumber);
        ok = false;
      } else if (
        !isValidFlightNumberFormat(trimmed) ||
        collectionFlightLookupStatus === "error"
      ) {
        setCollectionFlightError(FLIGHT_NUMBER_FORMAT_ERROR);
        ok = false;
      } else {
        setCollectionFlightError("");
      }
    } else {
      setCollectionFlightError("");
    }

    return ok;
  }

  function clearFlightFieldErrors(): void {
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

    if (!date || !time) {
      setTripDateError(QUOTE_REQUIRED_FIELD_MESSAGES.dateTime);
      ok = false;
    } else if (!isTripDateOnOrAfterToday(date)) {
      setTripDateError("Pickup date cannot be in the past.");
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
      setCustomerNameError(QUOTE_REQUIRED_FIELD_MESSAGES.name);
      ok = false;
    } else {
      setCustomerNameError("");
    }

    if (!customerMobile.trim()) {
      setMobileNumberError(QUOTE_REQUIRED_FIELD_MESSAGES.mobile);
      ok = false;
    } else if (!isValidMobileNumber(customerMobile)) {
      setMobileNumberError(QUOTE_REQUIRED_FIELD_MESSAGES.mobileInvalid);
      ok = false;
    } else {
      setMobileNumberError("");
    }

    if (!customerEmail.trim()) {
      setEmailAddressError(QUOTE_REQUIRED_FIELD_MESSAGES.email);
      ok = false;
    } else if (!isValidEmailAddress(customerEmail)) {
      setEmailAddressError(QUOTE_REQUIRED_FIELD_MESSAGES.emailInvalid);
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

    const estimatedPrice = pricingConfirmationRequired
      ? priceConfirmationLabel
      : liveQuote
      ? isRequestQuote
        ? `Guide price ${formatQuote(pricedFare?.totalGbp ?? liveQuote.amount)} (subject to availability)`
        : !isEnquiryOnly && !isManualQuoteJourney
          ? formatQuote(pricedFare?.totalGbp ?? liveQuote.amount)
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
      ...(journeyKind ? { journeyKind } : {}),
      ...(pickupAirportCode ? { pickupAirportCode } : {}),
      ...(dropoffAirportCode ? { dropoffAirportCode } : {}),
      ...(isAirportToAirportJourney ? { isAirportToAirport: true } : {}),
      expressDropOffSelected: expressSelection.eligible ? expressDropOffSelected : false,
      expressDropOffFee: expressSelection.feeGbp,
      expressDropOffAirport: expressSelection.airportCode,
      ...(openWebsiteFareBreakdown
        ? promoFieldsFromFareBreakdown(openWebsiteFareBreakdown)
        : {}),
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
      setTermsError(QUOTE_REQUIRED_FIELD_MESSAGES.terms);
      return false;
    }

    setTermsError("");
    return true;
  }

  /** Marks every invalid checkout field, then scrolls to the first. Does not start payment. */
  function validateCheckoutRequiredFields(): boolean {
    const contactOk = validateContactDetails();
    const termsOk = requireTermsAccepted();
    if (contactOk && termsOk) return true;
    window.setTimeout(() => {
      const root =
        document.getElementById("step3-customer-details") ??
        cardRef.current ??
        document;
      focusFirstInvalidField(root);
    }, 0);
    return false;
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
    testChargeAmount ??
    (pricedFare?.totalGbp != null ? pricedFare.totalGbp : liveQuote?.amount ?? null);

  async function handlePayNow() {
    if (isCustomerSmartAvailabilityBlockMessage(paymentError)) {
      return;
    }
    if (paymentLoading || submitted) {
      return;
    }
    if (!validateCheckoutRequiredFields()) {
      return;
    }

    if (!liveQuote || !canPayNowOnline) {
      if (!canPayNowOnline) {
        if (routeValidationBlockingPayment) {
          if (!requireConfirmedPlacesForPayment()) {
            return;
          }
          setPaymentError(ROUTE_RECONFIRMATION_MESSAGE);
          return;
        }
        setPaymentError(
          "Online payment is available when an instant fare is shown. Request to book instead and we’ll email a SumUp link once confirmed.",
        );
      }
      return;
    }

    void import("@/lib/ad-fraud-events").then(({ recordAdFraudBehaviour }) => {
      recordAdFraudBehaviour("booking_started", { path: "pay_now" });
    });

    if (!requireConfirmedPlacesForPayment()) {
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

    if (!validateRequiredFlightNumbers()) {
      setPaymentError(FLIGHT_NUMBER_FORMAT_ERROR);
      setQuoteStep(2);
      return;
    }

    if (!requireCapacityConfirmed()) {
      return;
    }

    const availabilityBlocked = await applyCustomerSmartAvailabilityCheck();
    if (availabilityBlocked) {
      return;
    }

    if (
      !canProceedWithoutExpressDropOff({
        eligible: expressSelection.eligible,
        selected: expressDropOffSelected,
        removalAcknowledged: expressRemovalAck,
        freeAlternativeAvailable: expressSelection.freeAlternativeAvailable,
      })
    ) {
      setExpressAckRequired(true);
      setPaymentError(
        expressSelection.service === "pick-up"
          ? "Please confirm you understand the free pick-up area before continuing without Express Pick-Up."
          : "Please confirm you understand the free drop-off area before continuing without Express Drop-Off.",
      );
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
      expressDropOffSelected: expressSelection.eligible ? expressDropOffSelected : false,
    });

    try {
      const returnToken = createPaymentReturnToken();
      const checkout = await createPaymentCheckout({
        amount:
          testChargeAmount != null
            ? testChargeAmount
            : appliedPersonalQuote
              ? appliedPersonalQuote.agreedAmount
              : paymentAmount ?? liveQuote.amount ?? 0,
        description: buildPaymentDescription(),
        redirectUrl: buildPaymentRedirectUrl(returnToken),
        booking: bookingDetails,
        pickupPlaceId: pickupPlace?.placeId?.trim() || undefined,
        dropoffPlaceId: dropoffPlace?.placeId?.trim() || undefined,
        expressDropOffSelected: expressSelection.eligible
          ? expressDropOffSelected
          : false,
        ...(useOpenWebsitePromoPricing && journeyFareParts.journeyFareGbp != null
          ? {
              journeyFareGbp: journeyFareParts.journeyFareGbp,
              airportFixedCostsGbp: journeyFareParts.airportFixedCostsGbp,
              removedAirportFeeIds: isAirportToAirportJourney
                ? removedAirportFeeIds
                : [],
              acceptedFinalAmountGbp: paymentAmount ?? undefined,
              ...(returnOfferToken &&
              !returnJourney &&
              isReturnOfferAirportJourney(pickupAddress, dropoffAddress)
                ? { returnOfferToken }
                : {}),
            }
          : {
              acceptedFinalAmountGbp: paymentAmount ?? undefined,
            }),
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
      if (isPaymentFareMismatchError(error)) {
        // Never approximate journey/fixed by subtracting Express — re-quote from the engine.
        const refreshed = await refreshAuthoritativeServerQuote();
        setTermsAccepted(false);
        setTermsError("Please review the updated fare and accept the terms again.");
        setPaymentError(
          refreshed
            ? error.message
            : `${error.message} We could not refresh the live quote automatically — please check your journey details.`,
        );
        setPaymentLoading(false);
        return;
      }
      if (isPaymentRouteReconfirmationError(error)) {
        setRouteReconfirmationRequired(true);
        setRouteMetrics(null);
        setServerFareParts(null);
        const endpoint = error.endpoint ?? "both";
        // Identify only the affected field when the Worker reports which end failed.
        if (endpoint === "pickup") {
          setPickupPlaceError(ROUTE_RECONFIRMATION_MESSAGE);
          setDropoffPlaceError("");
        } else if (endpoint === "dropoff") {
          setPickupPlaceError("");
          setDropoffPlaceError(ROUTE_RECONFIRMATION_MESSAGE);
        } else {
          setPickupPlaceError(ROUTE_RECONFIRMATION_MESSAGE);
          setDropoffPlaceError(ROUTE_RECONFIRMATION_MESSAGE);
        }
        setPaymentError(error.message || ROUTE_RECONFIRMATION_MESSAGE);
        setQuoteStep(1);
        setPaymentLoading(false);
        window.setTimeout(() => {
          focusFirstInvalidField(cardRef.current ?? document);
        }, 80);
        return;
      }
      if (isPaymentRouteServiceUnavailableError(error)) {
        // Do not clear confirmed places or force Step 1 reselection — backend blip.
        setPaymentError(error.message || ROUTE_SERVICE_UNAVAILABLE_MESSAGE);
        setPaymentLoading(false);
        return;
      }
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
    trackStartNewQuoteClick(quoteFunnelParams({ cta: "clear_details_start_new_quote" }));
    clearAbandonedQuotePersistence();
    resetRequestQuoteConversion();
    quoteFunnelAttemptIdRef.current = `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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
    pendingBookingResultScrollRef.current = false;
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
      confirmedInitialPickup
        ? confirmedInitialPickup.displayAddress || confirmedInitialPickup.formattedAddress
        : nextDirection === "from-airport" && airportPlace
          ? airportPlace.displayAddress || airportPlace.formattedAddress
          : nextDirection === "to-airport"
            ? initialAddressHint
            : "",
    );
    setDropoffAddress(
      confirmedInitialDropoff
        ? confirmedInitialDropoff.displayAddress || confirmedInitialDropoff.formattedAddress
        : initialDropoffHint ||
          (nextDirection === "to-airport" && airportPlace
            ? airportPlace.displayAddress || airportPlace.formattedAddress
            : nextDirection === "from-airport"
              ? initialAddressHint
              : ""),
    );
    setPickupPlace(
      confirmedInitialPickup
        ? confirmedInitialPickup
        : nextDirection === "from-airport" && airportPlace
          ? airportPlace
          : emptySelectedPlace(),
    );
    setDropoffPlace(
      confirmedInitialDropoff
        ? confirmedInitialDropoff
        : nextDirection === "to-airport" && airportPlace
          ? airportPlace
          : emptySelectedPlace(),
    );
    setPickupPlaceError("");
    setDropoffPlaceError("");
    setPickupRestoredHint(false);
    setDropoffRestoredHint(false);
    setJourneyMode(returnOfferToken ? "one-way" : null);
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
      resolveLandingJourneyIntent({
        initialJourneyIntent,
        initialAirportCode,
        initialDirection,
        initialAddressHint,
        initialDropoffHint,
      }),
    );
    setIntentAirportCode(isCustomerAirportCode(initialAirportCode) ? initialAirportCode : "");
    setRouteMetrics(null);
    setServerFareParts(null);
    setRouteReconfirmationRequired(false);
    setPickupPlaceError("");
    setDropoffPlaceError("");
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
      scrollQuoteStage(step1JourneyRef.current ?? "step1-journey-details", {
        focusHeading: true,
      });
      const root = cardRef.current ?? document;
      const firstField =
        root.querySelector<HTMLElement>(
          '[data-journey-intent-option], button[aria-pressed], input:not([type="hidden"]), select, textarea',
        ) ?? root.querySelector<HTMLElement>("#step1-journey-details");
      if (firstField) {
        try {
          firstField.focus({ preventScroll: true });
        } catch {
          firstField.focus();
        }
      }
    }, 0);
  }

  function requestStartNewQuote() {
    if (hasSubstantialQuoteInput()) {
      setConfirmStartNewQuote(true);
      return;
    }
    performStartNewQuote();
  }

  const showBookingErrorWhatsAppHelp =
    (Boolean(paymentError.trim()) && !isCustomerSmartAvailabilityBlockMessage(paymentError)) ||
    Boolean(submitError.trim()) ||
    Boolean(pickupPlaceError.trim()) ||
    Boolean(dropoffPlaceError.trim()) ||
    routeReconfirmationRequired ||
    paymentPopupBlocked ||
    Boolean(tripDateError.trim()) ||
    Boolean(returnDateError.trim()) ||
    Boolean(customerNameError.trim()) ||
    Boolean(mobileNumberError.trim()) ||
    Boolean(emailAddressError.trim()) ||
    Boolean(termsError.trim()) ||
    Boolean(goingFlightError.trim()) ||
    Boolean(collectionFlightError.trim()) ||
    Boolean(capacityError.trim());

  /**
   * At most one WhatsApp + Start New Quote error cluster is mounted.
   * Priority: route/place → payment (pay-now) → payment (early) → submit → step actions.
   */
  type ErrorHelpPlacement =
    | "route"
    | "payment-early"
    | "submit"
    | "payment-actions"
    | "results"
    | "step1-actions"
    | "step2"
    | "step3";

  type StartNewQuotePlacement = "results" | "step1-actions" | "step2" | "step3";

  const errorHelpPlacement: ErrorHelpPlacement | null = (() => {
    if (!showBookingErrorWhatsAppHelp) {
      return null;
    }
    if (
      routeReconfirmationRequired ||
      Boolean(pickupPlaceError.trim()) ||
      Boolean(dropoffPlaceError.trim())
    ) {
      return "route";
    }
    if (paymentError.trim() && canPayNowOnline && liveQuote && quoteStep === 3) {
      return "payment-actions";
    }
    if (paymentError.trim() && !(canPayNowOnline && liveQuote)) {
      return "payment-early";
    }
    if (submitError.trim()) {
      return "submit";
    }
    if (paymentPopupBlocked && quoteStep === 3) {
      return "payment-actions";
    }
    if (quoteStep === 3) {
      return "step3";
    }
    if (quoteStep === 2) {
      return "step2";
    }
    if (quoteResultsReady && quoteStep === 1) {
      return "results";
    }
    return "step1-actions";
  })();

  /** Normal (error-free) Start New Quote — never alongside the error help cluster. */
  const startNewQuotePlacement: StartNewQuotePlacement | null = (() => {
    if (errorHelpPlacement) {
      return null;
    }
    const shouldOffer =
      Boolean(liveQuote) ||
      quoteResultsReady ||
      hasQuoteRoute ||
      hasSubstantialQuoteInput();
    if (!shouldOffer) {
      return null;
    }
    if (quoteResultsReady && quoteStep === 1) {
      return "results";
    }
    if (quoteStep === 2) {
      return "step2";
    }
    if (quoteStep === 3) {
      return "step3";
    }
    if (quoteStep === 1) {
      return "step1-actions";
    }
    return null;
  })();

  function renderBookingErrorHelp(placement: ErrorHelpPlacement) {
    if (errorHelpPlacement !== placement) {
      return null;
    }
    return (
      <BookingErrorHelpCluster
        onWhatsAppClick={() => {
          trackWhatsAppBookingHelpClick(
            quoteFunnelParams({ cta: "get_booking_help_whatsapp" }),
          );
        }}
        confirmOpen={confirmStartNewQuote}
        onRequestStart={requestStartNewQuote}
        onCancelConfirm={() => setConfirmStartNewQuote(false)}
        onConfirmStart={performStartNewQuote}
      />
    );
  }

  function renderStartNewQuoteControls(placement: StartNewQuotePlacement) {
    if (startNewQuotePlacement !== placement) {
      return null;
    }
    return (
      <StartNewQuoteControls
        confirmOpen={confirmStartNewQuote}
        onRequestStart={requestStartNewQuote}
        onCancelConfirm={() => setConfirmStartNewQuote(false)}
        onConfirmStart={performStartNewQuote}
      />
    );
  }

  async function confirmBooking(delivery: BookingDelivery) {
    if (submitted || bookingSent) {
      return;
    }
    if (!validateCheckoutRequiredFields()) {
      return;
    }
    if (!requireCapacityConfirmed()) {
      return;
    }

    void import("@/lib/ad-fraud-events").then(({ recordAdFraudBehaviour }) => {
      recordAdFraudBehaviour("booking_started", { path: delivery });
    });

    const details = buildConfirmedBookingDetails();
    const isMobile = isMobileDevice ?? detectMobileDevice();
    setSubmitted(true);
    setSubmitError("");
    setBookingReference("");

    let reference = "";
    try {
      if (isEnquiryOnly || isManualQuoteJourney || pricingConfirmationRequired || exceedsOnlineCapacity) {
        const enquiryMessage = buildEnquiryBookingMessage(details);
        const subject = pricingConfirmationRequired
          ? `Price confirmation request — ${details.customerName}`
          : journeyKind === "address-to-address"
            ? `Address-to-Address quote request — ${details.customerName}`
          : isOutOfAreaPickupJourney
          ? `Out-of-area pickup quote request — ${details.customerName}`
          : isRoiJourney
            ? `ROI long-distance quote request — ${details.customerName}`
            : `New vehicle enquiry — ${details.customerName}`;

        // Persist A2A personalised-quote requests into Owner dashboard (Awaiting Quote).
        if (journeyKind === "address-to-address" && isManualQuoteJourney) {
          try {
            const { createA2aQuoteRequest } = await import("@/lib/a2a-quote-api");
            const created = await createA2aQuoteRequest({
              ...details,
              estimatedPrice: null,
              isAirportTrip: false,
            });
            if (created.reference) {
              reference = created.reference;
            }
          } catch (persistErr) {
            console.error("A2A quote request persist failed", persistErr);
          }
        }

        // Personalised quote requests always go through the website (Owner A2A Quotes).
        // WhatsApp remains a help option in the site chrome — not a submit channel here.
        if (isManualQuoteJourney || !isMobile || delivery === "email") {
          const emailRef = await submitEnquiryByEmail({
            customerName: details.customerName,
            message: enquiryMessage,
            subject,
            booking: details,
          });
          if (!reference) reference = emailRef;
        } else {
          const waRef = await submitMobileWhatsAppEnquiry({
            customerName: details.customerName,
            message: enquiryMessage,
            subject,
            booking: details,
          });
          if (!reference) reference = waRef;
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
        isManualQuoteJourney
          ? `We couldn't submit your quote request. Please try again or contact ${SITE.email} with your trip details.`
          : delivery === "email" || !isMobile
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
    setBookingDelivery(isManualQuoteJourney ? "email" : delivery);
    // Tall step-3 form unmounts → short confirmation card; scroll after render
    // so mobile does not remain on homepage sections below the quote.
    pendingBookingResultScrollRef.current = true;
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

    if (isMobile && delivery === "whatsapp" && !isManualQuoteJourney) {
      openWhatsAppBookingMessage(
        isEnquiryOnly || exceedsOnlineCapacity
          ? buildEnquiryBookingMessage(details, reference)
          : buildBookingMessage(details, reference),
      );
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError("");
    setBookingSent(false);
    pendingBookingResultScrollRef.current = false;
    setBookingReference("");
    setBookingDelivery(null);

    if (quoteStep === 1) {
      const step1Cta =
        liveQuote && canPayNowOnline && !isEnquiryOnly && !showsRequestQuoteFlow
          ? "book_now"
          : "continue_to_travel_details";
      trackQuoteRequestClicked(quoteFunnelParams({ cta: step1Cta }));

      const failStep1 = (reason: string, message: string) => {
        trackQuoteValidationError(reason, quoteFunnelParams({ cta: step1Cta }));
        setSubmitError(message);
      };

      if (isA2AFlow) {
        if (!journeyIntent) {
          failStep1("missing_journey_intent", "Please choose where you are travelling.");
          return;
        }
        if (
          (journeyIntent === "to-airport" || journeyIntent === "from-airport") &&
          !intentAirportCode
        ) {
          failStep1("missing_airport", "Please choose an airport.");
          return;
        }
        if (!validateA2APlaces()) {
          trackQuoteValidationError(
            !isPlaceSelected(pickupPlace)
              ? "places_pickup_not_selected"
              : !isPlaceSelected(dropoffPlace)
                ? "places_dropoff_not_selected"
                : "places_same_pickup_dropoff",
            quoteFunnelParams({ cta: step1Cta }),
          );
          window.setTimeout(() => {
            focusFirstInvalidField(cardRef.current ?? document);
          }, 0);
          return;
        }
      }
      if (!hasQuoteRoute) {
        if (isA2AFlow && journeyIntent === "to-airport") {
          setPickupPlaceError(QUOTE_REQUIRED_FIELD_MESSAGES.pickup);
        } else if (isA2AFlow && journeyIntent === "from-airport") {
          setDropoffPlaceError(QUOTE_REQUIRED_FIELD_MESSAGES.destination);
        } else {
          if (!pickupAddress.trim() && !isPlaceSelected(pickupPlace)) {
            setPickupPlaceError(QUOTE_REQUIRED_FIELD_MESSAGES.pickup);
          }
          if (!dropoffAddress.trim() && !isPlaceSelected(dropoffPlace)) {
            setDropoffPlaceError(QUOTE_REQUIRED_FIELD_MESSAGES.destination);
          }
        }
        failStep1(
          "incomplete_route",
          isA2AFlow && journeyIntent === "to-airport"
            ? QUOTE_REQUIRED_FIELD_MESSAGES.pickup
            : isA2AFlow && journeyIntent === "from-airport"
              ? QUOTE_REQUIRED_FIELD_MESSAGES.destination
              : "Please complete your journey details.",
        );
        window.setTimeout(() => {
          focusFirstInvalidField(cardRef.current ?? document);
        }, 0);
        return;
      }
      if (journeyMode == null) {
        failStep1("missing_journey_mode", "Choose One way or Return to continue.");
        scrollQuoteStage("journey-type-selector");
        return;
      }
      if (!partySelectionReady) {
        if (passengers == null) {
          setPassengersError(QUOTE_REQUIRED_FIELD_MESSAGES.passengers);
        }
        if (suitcases == null) {
          setSuitcasesError(QUOTE_REQUIRED_FIELD_MESSAGES.suitcases);
        }
        failStep1(
          "missing_party",
          passengers == null
            ? QUOTE_REQUIRED_FIELD_MESSAGES.passengers
            : QUOTE_REQUIRED_FIELD_MESSAGES.suitcases,
        );
        scrollQuoteStage("passenger-luggage-section");
        window.setTimeout(() => {
          focusFirstInvalidField(cardRef.current ?? document);
        }, 0);
        return;
      }
      if (
        passengers != null &&
        (passengers > MAX_ONLINE_PASSENGERS || passengers < 1)
      ) {
        failStep1("invalid_passengers", PASSENGER_LIMIT_ERROR);
        return;
      }
      if (
        suitcases != null &&
        (suitcases < 0 || suitcases > SELECTOR_MAX_SUITCASES)
      ) {
        failStep1("invalid_suitcases", "Please select 0–4 large suitcases.");
        return;
      }
      if (!exceedsOnlineCapacity && !isEnquiryOnly && !isManualQuoteJourney && !pricingConfirmationRequired && !liveQuote) {
        trackQuoteValidationError("price_not_ready", quoteFunnelParams({ cta: step1Cta }));
        return;
      }
      if (
        !canProceedWithoutExpressDropOff({
          eligible: expressSelection.eligible,
          selected: expressDropOffSelected,
          removalAcknowledged: expressRemovalAck,
          freeAlternativeAvailable: expressSelection.freeAlternativeAvailable,
        })
      ) {
        setExpressAckRequired(true);
        failStep1(
          "express_ack_required",
          expressSelection.service === "pick-up"
            ? "Please confirm you understand the free pick-up area before continuing without Express Pick-Up."
            : "Please confirm you understand the free drop-off area before continuing without Express Drop-Off.",
        );
        return;
      }
      setSubmitError("");
      setExpressEditing(false);
      // Blur CTA before DOM swap so iOS does not keep scroll anchored to the old button.
      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      pendingQuoteStepNavScrollRef.current = 2;
      setQuoteStep(2);
      return;
    }

    if (quoteStep === 2) {
      // Step 2 uses an explicit Continue handler so date/time DOM values are synced first.
      return;
    }

    if (!validateCheckoutRequiredFields()) {
      return;
    }
    if (!usesWhatsApp || isManualQuoteJourney) {
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
    pendingBookingResultScrollRef.current = false;
    setBookingReference("");
    setBookingDelivery(null);
    setTermsAccepted(false);
    setTermsError("");
    setMarketingOptIn(false);
  }

  async function handleContinueTravelDetails() {
    if (continueToDetailsInFlightRef.current) return;
    continueToDetailsInFlightRef.current = true;
    setContinueToDetailsBusy(true);
    try {
      setSubmitError("");
      const schedule = syncScheduleFieldsFromInputs();
      if (!validateTripForBooking(schedule)) {
        return;
      }
      // Soft lookup loading/unavailable must not require a second click — format validity is the gate.
      if (!validateRequiredFlightNumbers()) {
        setSubmitError(
          goingFlightError || collectionFlightError || QUOTE_REQUIRED_FIELD_MESSAGES.flightNumber,
        );
        window.setTimeout(() => {
          focusFirstInvalidField(cardRef.current ?? document);
        }, 0);
        return;
      }
      const blocked = await applyCustomerSmartAvailabilityCheck();
      if (blocked) {
        window.setTimeout(() => {
          const el = document.getElementById("customer-smart-availability-blocked");
          if (el) {
            scrollQuoteStage(el);
          }
        }, 80);
        return;
      }
      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      // Commit Your Details in this tap so the section exists immediately.
      // Do not use pendingQuoteStepNavScrollRef — that waits for useEffect + two frames.
      flushSync(() => {
        setQuoteStep(3);
      });
      scrollQuoteStage(step3CustomerDetailsRef.current ?? "step3-customer-details", {
        focusHeading: true,
        immediate: true,
        correctAfterMs: 120,
      });
    } finally {
      continueToDetailsInFlightRef.current = false;
      setContinueToDetailsBusy(false);
    }
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
    return scrollQuoteStage(element ?? quoteStepTargetId(target), {
      focusHeading: true,
      correctAfterMs: 150,
    });
  }, [quoteStep]);

  // Availability-confirmation result: scroll once to the confirmation card.
  useEffect(() => {
    if (!shortNoticeResult || !pendingShortNoticeScrollRef.current) {
      return;
    }
    pendingShortNoticeScrollRef.current = false;
    return scrollQuoteStage(
      shortNoticeResultRef.current ?? "quote-availability-confirmation",
      { focusHeading: true, correctAfterMs: 150 },
    );
  }, [shortNoticeResult]);

  // Quote/booking submission success: scroll once to the confirmation card.
  useEffect(() => {
    if (!bookingSent || !pendingBookingResultScrollRef.current) {
      return;
    }
    pendingBookingResultScrollRef.current = false;
    return scrollQuoteStage(bookingResultRef.current ?? "bookingRequestResult", {
      focusHeading: true,
      correctAfterMs: 150,
    });
  }, [bookingSent]);

  // -------------------------------------------------------------------------
  // Consolidated progressive scroll (A2A primary + legacy).
  // ONE action → ONE scroll → ONE destination via scrollQuoteStage.
  // Never targets homepage / #airports. Never scrolls on field keystrokes,
  // route-metric updates, or time onChange while the iOS picker is open.
  // -------------------------------------------------------------------------
  const a2aShowJourneyMode =
    isA2AFlow &&
    quoteStep === 1 &&
    (journeyIntent === "address-to-address"
      ? isPlaceSelected(pickupPlace) && isPlaceSelected(dropoffPlace)
      : journeyIntent === "to-airport"
        ? Boolean(intentAirportCode) && isPlaceSelected(pickupPlace)
        : journeyIntent === "from-airport"
          ? Boolean(intentAirportCode) && isPlaceSelected(dropoffPlace)
          : false);
  const a2aShowParty = a2aShowJourneyMode && journeyMode != null;

  const prevJourneyIntentRef = useRef<QuoteJourneyIntent | null>(null);
  const hadA2aAddressesScrollRef = useRef(false);
  const hadA2aJourneyTypeScrollRef = useRef(false);
  const hadA2aPartyScrollRef = useRef(false);
  /** Capacity incomplete→complete arms a pending Your Route scroll (once). */
  const pendingRouteSummaryScrollRef = useRef(false);
  const hadRouteSummaryScrollRef = useRef(false);
  /** Time picker Done/blur → flight number (when shown) or Your Journey (once per step-2 visit). */
  const hadJourneySummaryScrollRef = useRef(false);
  const hadLegacyJourneyModeScrollRef = useRef(false);
  const hadLegacyPartyScrollRef = useRef(false);
  const prevPartyCompleteRef = useRef(false);

  // Stage 1: Address to Address tapped → PICKUP / DESTINATION fields.
  // Desktop only. On mobile (< md / 768px) the viewport must stay still.
  useEffect(() => {
    if (!isA2AFlow || quoteStep !== 1) {
      prevJourneyIntentRef.current = journeyIntent;
      hadA2aAddressesScrollRef.current = false;
      return;
    }
    const becameAddressToAddress =
      journeyIntent === "address-to-address" &&
      prevJourneyIntentRef.current !== "address-to-address";
    prevJourneyIntentRef.current = journeyIntent;
    if (!becameAddressToAddress || hadA2aAddressesScrollRef.current) return;
    hadA2aAddressesScrollRef.current = true;
    if (detectMobileDevice()) return;
    // No layout-correction pulse — stage scrolls are precise one-shots (avoids judder).
    return scrollQuoteStage("quote-section-addresses", { correctAfterMs: 0 });
  }, [isA2AFlow, journeyIntent, quoteStep]);

  // Stage 3: both addresses selected → JOURNEY (One way / Return) only.
  // Pickup alone must not scroll. Route/vehicle renders must not steal viewport.
  // Desktop only — mobile Step 1 must not jump after an address becomes valid.
  useEffect(() => {
    if (!isA2AFlow || quoteStep !== 1) {
      hadA2aJourneyTypeScrollRef.current = false;
      return;
    }
    if (!a2aShowJourneyMode || journeyMode != null) {
      if (!a2aShowJourneyMode) {
        hadA2aJourneyTypeScrollRef.current = false;
      }
      return;
    }
    if (hadA2aJourneyTypeScrollRef.current) return;
    hadA2aJourneyTypeScrollRef.current = true;
    // Desktop only. On mobile Step 1 the next section may appear below;
    // the customer scrolls to it themselves.
    if (detectMobileDevice()) return;
    return scrollQuoteStage("journey-type-selector", { correctAfterMs: 0 });
  }, [a2aShowJourneyMode, isA2AFlow, journeyMode, quoteStep]);

  // Stage 4: One way / Return selected → passenger / luggage (not bags→route yet).
  useEffect(() => {
    if (!isA2AFlow || quoteStep !== 1) {
      hadA2aPartyScrollRef.current = false;
      return;
    }
    if (!a2aShowParty) {
      hadA2aPartyScrollRef.current = false;
      return;
    }
    if (hadA2aPartyScrollRef.current) return;
    hadA2aPartyScrollRef.current = true;
    return scrollQuoteStage("passenger-luggage-section", { correctAfterMs: 0 });
  }, [a2aShowParty, isA2AFlow, quoteStep]);

  // Stage 6: capacity incomplete → complete → YOUR ROUTE stack (once).
  // Lands on the results block that starts with YOUR ROUTE (vehicle + personalised
  // quote sit underneath). Suitcase 2→3 after complete must not re-scroll.
  // Metrics/vehicle renders must not steal the viewport.
  useEffect(() => {
    if (quoteStep !== 1) {
      prevPartyCompleteRef.current = false;
      pendingRouteSummaryScrollRef.current = false;
      hadRouteSummaryScrollRef.current = false;
      return;
    }

    const capacityComplete = quoteChoicesReady && hasQuoteRoute;
    const becameComplete = capacityComplete && !prevPartyCompleteRef.current;
    prevPartyCompleteRef.current = capacityComplete;

    if (!capacityComplete) {
      pendingRouteSummaryScrollRef.current = false;
      hadRouteSummaryScrollRef.current = false;
      return;
    }

    if (!becameComplete || hadRouteSummaryScrollRef.current) {
      return;
    }

    hadRouteSummaryScrollRef.current = true;
    pendingRouteSummaryScrollRef.current = false;
    // Prefer the dedicated ref — matches the YOUR ROUTE → vehicle → quote stack.
    return scrollQuoteStage(routeSummaryRef.current ?? "quote-route-summary", {
      correctAfterMs: 0,
    });
  }, [hasQuoteRoute, quoteChoicesReady, quoteStep]);

  // Reset time→Your Journey one-shot when leaving travel-details step.
  useEffect(() => {
    if (quoteStep !== 2) {
      hadJourneySummaryScrollRef.current = false;
    }
  }, [quoteStep]);

  // Legacy (non-A2A) form: addresses → One Way/Return, then passengers after mode chosen.
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
      // Address pair complete → One way / Return. Desktop only.
      if (detectMobileDevice()) return;
      return scrollQuoteStage("journey-type-selector", { correctAfterMs: 0 });
    }
    if (hadLegacyPartyScrollRef.current) return;
    hadLegacyPartyScrollRef.current = true;
    return scrollQuoteStage("passenger-luggage-section", { correctAfterMs: 0 });
  }, [hasQuoteRoute, isA2AFlow, journeyMode, quoteStep]);

  /**
   * Stage 10→11: iPhone time picker Done / blur only.
   * Never called from onChange — customer must finish the picker first.
   * Prefer the flight-number block when shown (airport pickup), otherwise
   * YOUR JOURNEY — and clamp so Continue stays fully visible (no overshoot).
   */
  function requestJourneySummaryScrollAfterTimeConfirm() {
    if (quoteStep !== 2) return;
    if (hadJourneySummaryScrollRef.current) return;
    const schedule = syncScheduleFieldsFromInputs();
    const date = schedule.tripDate;
    const time = schedule.tripTime;
    const retDate = schedule.returnDate;
    const retTime = schedule.returnTime;
    const complete =
      Boolean(date && time) &&
      isTripDateOnOrAfterToday(date) &&
      isTripDateTimeNotInPast(date, time) &&
      (!returnJourney ||
        (Boolean(retDate && retTime) &&
          isReturnAfterOutbound(date, time, retDate, retTime)));
    if (!complete) return;
    hadJourneySummaryScrollRef.current = true;
    const preferFlightDetails =
      needsOutboundFlightNumber || needsReturnCollectionFlightNumber;
    scrollJourneySummaryAfterTimeConfirm(
      preferFlightDetails
        ? "step2-flight-details"
        : (step2JourneySummaryRef.current ?? "step2-journey-summary"),
      "quote-step2-next",
    );
  }

  const submitInProgressLabel = isManualQuoteJourney
    ? "Submitting quote request…"
    : showsRequestQuoteFlow
    ? "Sending quote request…"
    : isEnquiryOnly
      ? "Sending enquiry…"
      : "Sending booking…";

  const confirmButtonLabel = isManualQuoteJourney
    ? "Submit Quote Request"
    : showsRequestQuoteFlow
    ? pricingConfirmationRequired
      ? "Request a Quote"
      : liveQuote
        ? `Request quote · ${formatQuote(pricedFare?.totalGbp ?? liveQuote.amount)}`
        : "Request a Quote"
    : isEnquiryOnly
      ? "Send enquiry"
      : liveQuote
        ? `Confirm & book for ${formatQuote(pricedFare?.totalGbp ?? liveQuote.amount)}`
        : "Confirm & book";

  const whatsAppConfirmLabel = showsRequestQuoteFlow
    ? pricingConfirmationRequired || isManualQuoteJourney
      ? "Chat on WhatsApp"
      : liveQuote
        ? `Request quote via WhatsApp — ${formatQuote(pricedFare?.totalGbp ?? liveQuote.amount)}`
        : "Chat on WhatsApp"
    : isEnquiryOnly
      ? "Send enquiry via WhatsApp"
      : liveQuote
        ? `Send via WhatsApp — ${formatQuote(pricedFare?.totalGbp ?? liveQuote.amount)}`
        : "Confirm & send via WhatsApp";

  const quoteHint = pricingConfirmationRequired
    ? hasQuoteRoute
      ? "Continue to request your price — we’ll confirm the fare before payment."
      : isA2AFlow && !isAddressPairComplete
        ? "Select pickup and drop-off addresses from the suggestions."
        : "Enter your journey details to request a confirmed price."
    : isManualQuoteJourney
    ? hasQuoteRoute
      ? "Continue with your travel details to send your personalised quote request."
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
          ? "Select an airport to see a guide price"
          : ldyServiceAreaInvalid
            ? isFromAirport
              ? "We transfer from Derry Airport to the greater Belfast area — enter a Belfast-area drop-off address"
              : "Pickups for Derry Airport must be in the greater Belfast area — enter a Belfast-area pickup address"
            : !isAirportAddressComplete
              ? `Enter your ${isFromAirport ? "drop-off" : "pickup"} address to see a guide price`
              : ""
        : !isAddressPairComplete
          ? "Enter pickup and drop-off addresses to see a guide price"
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

  /**
   * Airport-pickup flight number — collected on Step 2 (Travel details).
   * Required for airport collections; never shown for pure to-airport one-ways.
   */
  function renderFlightDetailsSection(activeOnStep: 2 | 3) {
    if (!needsOutboundFlightNumber && !needsReturnCollectionFlightNumber) {
      return null;
    }
    return (
      <div
        id={activeOnStep === 2 ? "step2-flight-details" : "step3-flight-details"}
        className="scroll-mt-44 space-y-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 md:scroll-mt-28"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-emerald">
            Flight number{" "}
            <span className="font-normal text-ink-secondary">(required)</span>
          </p>
          <p className="mt-1 text-sm text-white/60">{BOOKING_FLIGHT_NUMBER_HELPER}</p>
        </div>
        {needsOutboundFlightNumber ? (
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
            enabled={quoteStep === activeOnStep}
            error={goingFlightError}
            onStatusChange={setGoingFlightLookupStatus}
            onVerifiedChange={(flight) => {
              setVerifiedGoingFlight(flight);
            }}
          />
        ) : null}
        {needsReturnCollectionFlightNumber ? (
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
            enabled={quoteStep === activeOnStep}
            error={collectionFlightError}
            onStatusChange={setCollectionFlightLookupStatus}
            onVerifiedChange={(flight) => {
              setVerifiedCollectionFlight(flight);
            }}
          />
        ) : null}
      </div>
    );
  }

  function renderAirportFeeLines() {
    if (airportFeeResolution.lines.length === 0 || testChargeAmount !== null) {
      return null;
    }
    return (
      <div className="mt-3 space-y-2 text-left" data-airport-fee-lines>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
          Airport charges
        </p>
        <ul className="space-y-2">
          {airportFeeResolution.lines.map((line) => (
            <li
              key={line.id}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-white">
                    {line.label}
                    {line.leg === "return" ? (
                      <span className="ml-1.5 text-xs font-normal text-white/45">
                        (return)
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-white/55">
                    {line.removed
                      ? "Removed — free-area alternative selected"
                      : line.removable
                        ? "Free-area alternative available"
                        : "Included in your fixed price"}
                  </p>
                </div>
                <p
                  className={`shrink-0 tabular-nums font-semibold ${
                    line.removed ? "text-white/40 line-through" : "text-white"
                  }`}
                >
                  £{line.originalAmountGbp.toFixed(2)}
                </p>
              </div>
              {line.removable ? (
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-emerald underline-offset-2 hover:underline"
                  onClick={() => {
                    setRemovedAirportFeeIds((current) =>
                      line.removed
                        ? current.filter((id) => id !== line.id)
                        : current.includes(line.id)
                          ? current
                          : [...current, line.id],
                    );
                  }}
                >
                  {line.removed ? "Add this charge back" : "Remove this charge"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  function renderExpressChoiceInPriceCard(mode: "full" | "summary") {
    if (
      !expressSelection.eligible ||
      !expressSelection.airportCode ||
      !expressSelection.service ||
      testChargeAmount !== null
    ) {
      return null;
    }
    return (
      <div className="mt-3 text-left" data-express-airport-choice>
        <ExpressDropOffChoice
          mode={mode}
          editing={expressEditing}
          onEditingChange={setExpressEditing}
          airportCode={expressSelection.airportCode}
          service={expressSelection.service}
          allowFreeAlternative={expressSelection.freeAlternativeAvailable}
          selected={expressDropOffSelected}
          removalAcknowledged={expressRemovalAck}
          requireAcknowledgement={expressAckRequired}
          onSelectedChange={(selected) => {
            setExpressDropOffSelected(selected);
            setExpressAckRequired(false);
            if (selected) setExpressRemovalAck(false);
          }}
          onRemovalAcknowledgedChange={(ack) => {
            setExpressRemovalAck(ack);
            if (ack) setExpressAckRequired(false);
          }}
        />
      </div>
    );
  }

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
          </>
        ) : isManualQuoteJourney ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wider text-emerald">
              Personalised Quote
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Get a personalised quote for your journey
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              {journeyKind === "address-to-address"
                ? "Address-to-address journeys are individually priced. Continue with your travel details and submit your quote request."
                : isOutOfAreaPickupJourney
                  ? "This journey needs a personalised quote. Continue with your travel details and submit your quote request."
                  : "Continue with your travel details and submit your quote request — we’ll confirm your personal price before any payment is taken."}
            </p>
          </>
        ) : showsRequestQuoteFlow && liveQuote ? (
          <>
            <p className="quote-price-label">
              {returnJourney
                ? "Guide return price · request a quote"
                : "Guide price · request a quote"}
            </p>
            <p className="quote-price-figure mt-2">
              {formatQuote(pricedFare?.totalGbp ?? liveQuote.amount)}
            </p>
            {renderExpressChoiceInPriceCard(quoteStep === 1 ? "full" : "summary")}
            <p className="mt-3 text-sm text-white/75">
              Vehicle: {vehicleShortLabel(quoteVehicle)}
              <span className="mx-2 text-white/35">·</span>
              Passengers: {formatPassengerChoice(effectivePassengers as number)}
              <span className="mx-2 text-white/35">·</span>
              Large suitcases: {formatSuitcaseChoice(suitcases as number)}
            </p>
            <PriceInclusionBlock
              isAirportTrip={isAirportLegForInclusions}
              isFromAirport={isFromAirport}
              returnJourney={returnJourney}
              airportCode={effectiveAirportCode}
              addressToAddress={isAddressToAddressInclusions}
              guideSuffix="This is a guide price only — not an instant confirmation."
            />
            {returnJourney && openWebsiteFareBreakdown ? (
              <PromotionalPriceBreakdown
                breakdown={openWebsiteFareBreakdown}
                service={expressSelection.service ?? "drop-off"}
                freeAirportAccessSelected={
                  expressSelection.eligible && expressSelection.feeGbp === 0
                }
              />
            ) : returnJourney ? (
              <p className="mt-2 text-xs font-medium text-emerald/90">
                Includes 5% return booking discount on the guide price.
              </p>
            ) : null}
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
            {!tripDetailsReady && quoteHint ? (
              <p className="mt-3 text-sm text-white/70">{quoteHint}</p>
            ) : null}
          </>
        ) : liveQuote ? (
          <>
            <p className="quote-price-label">
              {testChargeAmount !== null
                ? "Test SumUp charge"
                : appliedPersonalQuote
                  ? "Personal quoted fare"
                  : returnJourney
                    ? "Your Fixed Return Journey Price"
                    : "Your Fixed Journey Price"}
            </p>
            <p className="quote-price-figure mt-2">
              {formatQuote(
                testChargeAmount ??
                  pricedFare?.totalGbp ??
                  appliedPersonalQuote?.agreedAmount ??
                  liveQuote.amount,
              )}
            </p>
            {testChargeAmount === null && !appliedPersonalQuote ? (
              <FixedPriceAssurance />
            ) : null}
            {testChargeAmount === null && !appliedPersonalQuote && openWebsiteFareBreakdown ? (
              <PromotionalPriceBreakdown
                breakdown={openWebsiteFareBreakdown}
                service={expressSelection.service ?? "drop-off"}
                freeAirportAccessSelected={
                  expressSelection.eligible && expressSelection.feeGbp === 0
                }
              />
            ) : null}
            {renderAirportFeeLines()}
            {renderExpressChoiceInPriceCard(quoteStep === 1 ? "full" : "summary")}
            {appliedPersonalQuote && testChargeAmount === null ? (
              <p className="mt-2 text-sm text-emerald/90">
                Personal quote applied
                <span className="quote-secondary mt-1 block text-xs">
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
              <p className="quote-secondary mt-2 text-xs">
                Route price would be {formatQuote(liveQuote.amount)} — not charged in test mode.
              </p>
            )}
            <PriceInclusionBlock
              isAirportTrip={isAirportLegForInclusions}
              isFromAirport={isFromAirport}
              returnJourney={returnJourney}
              airportCode={effectiveAirportCode}
              addressToAddress={isAddressToAddressInclusions}
            />
          </>
        ) : (
          <>
            <p className="quote-price-label">
              Your Fixed Journey Price
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{quoteHint}</p>
          </>
        )}
        <p className="quote-secondary mt-3.5 text-xs leading-relaxed">
          {pricingConfirmationRequired || isManualQuoteJourney
            ? "We’ll confirm your price before any payment is taken."
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
          id="quote-book-now-button"
          disabled={
            submitted ||
            !quoteChoicesReady ||
            (isEnquiryOnly ||
            isManualQuoteJourney ||
            pricingConfirmationRequired ||
            exceedsOnlineCapacity
              ? !hasQuoteRoute
              : !liveQuote)
          }
          className="btn-primary w-full"
        >
          {submitted
            ? submitInProgressLabel
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
            className="btn-secondary w-full"
          >
            Save Quote
          </button>
        ) : null}
        {liveQuote || hasQuoteRoute || passengers != null || suitcases != null
          ? renderStartNewQuoteControls("step1-actions")
          : null}
        {renderBookingErrorHelp("step1-actions")}
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
            <p className="quote-price-figure mt-4">
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
            className="btn-primary mt-6 w-full max-w-sm sm:w-auto sm:px-8"
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
        ref={(node) => {
          cardRef.current = node;
          bookingResultRef.current = node;
        }}
        id="bookingRequestResult"
        className="glass-card min-w-0 scroll-mt-44 rounded-2xl p-6 sm:p-8 md:scroll-mt-28"
      >
        <div className="rounded-xl border border-white/10 bg-navy-dark/50 px-5 py-8 text-center sm:px-8 sm:py-10">
          <p
            data-booking-nav-heading
            tabIndex={-1}
            className="text-xs font-medium uppercase tracking-wider text-emerald outline-none"
          >
            {isManualQuoteJourney
              ? "Quote request received"
              : showsRequestQuoteFlow || exceedsOnlineCapacity
              ? "Quote request submitted"
              : isEnquiryOnly
                ? "Enquiry submitted"
                : "Booking submitted"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Thank you
          </h2>
          {quoteConversionValue && !isManualQuoteJourney ? (
            <p className="quote-price-figure mt-4">
              {formatQuote(quoteConversionValue)}
            </p>
          ) : null}
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/80 sm:text-base">
            {isManualQuoteJourney
              ? "We’ve received your journey details. We’ll review your request and send you your personalised price. No payment has been taken."
              : showsRequestQuoteFlow || exceedsOnlineCapacity
              ? isOutOfAreaPickupJourney
                ? "We’ve received your out-of-area pickup request. We’ll review it manually, confirm availability, and send your personal fixed quote shortly. No payment is taken until the fare is confirmed."
                : isRoiJourney
                  ? "We’ve received your Republic of Ireland long-distance transfer request. We’ll confirm your fixed price and send your personal quote shortly."
                  : "We’ve received your quote request. We’ll confirm availability and send your personal quote shortly."
              : isEnquiryOnly
                ? "We’ve received your enquiry. We’ll confirm availability and send your personal quote shortly. When you’re ready to book, we’ll send a SumUp payment link — your trip is confirmed after payment."
                : "We’ve received your booking request. If you paid online with SumUp, your booking is confirmed. Otherwise we’ll confirm the job and email a SumUp payment link — your trip is confirmed after payment."}
          </p>
          {(bookingReference || quoteTransactionId) && (
            <p className="mt-4 text-sm text-white/60">
              Reference: {bookingReference || quoteTransactionId}
            </p>
          )}
          {!isManualQuoteJourney && bookingDelivery === "whatsapp" && (
            <p className="mx-auto mt-4 max-w-md text-sm text-white/60">
              Your {isEnquiryOnly ? "enquiry" : "booking"} message should open in WhatsApp. If it
              didn&apos;t, open WhatsApp and message @{SITE.whatsappUsername}.
            </p>
          )}
          {!isManualQuoteJourney && bookingDelivery === "email" && (
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
            className="btn-primary mt-6 w-full sm:w-auto sm:px-8"
          >
            Start a New Quote
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={cardRef} className="glass-card min-w-0 rounded-[1.05rem] p-4 sm:p-7 lg:p-6 xl:p-7">
      <div className="mb-4 sm:mb-5 lg:mb-5">
        <h2
          data-site-nav-heading="quote"
          tabIndex={-1}
          className="font-display text-[1.35rem] font-semibold leading-tight tracking-tight text-white outline-none sm:text-[1.85rem] lg:text-[1.75rem]"
        >
          Get a Live Quote
        </h2>
        {returnOfferToken ? (
          <div className="mt-3 rounded-xl border border-emerald/30 bg-emerald/[0.08] px-3.5 py-3">
            <p className="text-sm font-semibold text-emerald">Your 5% Return Journey Offer</p>
            <p className="mt-1 text-sm font-semibold text-white">
              Your 5% saving has been applied automatically.
            </p>
            <p className="mt-1 text-xs leading-snug text-white/70">
              You are booking one return journey from your original trip. There is no extra
              discount option to choose.
            </p>
          </div>
        ) : null}
        <div className="mt-1 text-sm leading-snug quote-secondary sm:mt-2.5 sm:leading-relaxed lg:text-[0.9rem] lg:leading-relaxed">
          {/* Mobile: compact — frees space for journey choices above the fold */}
          <p className="md:hidden text-[0.8125rem]">
            Get your fixed price in three quick steps.
          </p>
          {/* Desktop: fuller explanation */}
          <p className="hidden md:block">
            {pricingConfirmationRequired
              ? "Three quick steps — your journey, travel details, then your details. We’ll confirm your fare before any payment."
              : "Three quick steps — your journey, travel details, then your details. Instant fares can be paid online by card to confirm; otherwise Request to book and we’ll email a SumUp link after we confirm."}
          </p>
        </div>
        <ol className="mt-2 grid grid-cols-3 gap-1 sm:mt-4 sm:gap-2" aria-label="Booking steps">
          {[
            { step: 1 as const, label: isA2AFlow ? "Your journey" : "Airport & address" },
            { step: 2 as const, label: "Price & travel" },
            { step: 3 as const, label: canPayNowOnline ? "Pay & confirm" : "Your details" },
          ].map((item) => {
            const active = quoteStep === item.step;
            const done = quoteStep > item.step;
            return (
              <li
                key={item.step}
                aria-current={active ? "step" : undefined}
                className={`quote-step ${
                  active ? "quote-step-active" : done ? "quote-step-done" : ""
                }`}
              >
                <span className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider">
                  {done ? (
                    <svg
                      className="h-3 w-3 shrink-0 text-emerald"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="M3.5 8.5 6.5 11.5 12.5 4.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                  <span>Step {item.step}</span>
                  {done ? <span className="sr-only">completed</span> : null}
                  {active ? <span className="sr-only">current</span> : null}
                </span>
                <span className="mt-0.5 block text-[11px] font-semibold leading-tight sm:text-xs">
                  {item.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <form id="quoteForm" onSubmit={handleSubmit} className="relative space-y-3 overflow-x-clip overflow-y-visible sm:space-y-4 lg:space-y-3.5">
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
        {routeReconfirmationRequired || pickupPlaceError || dropoffPlaceError ? (
          <div className="space-y-3">
            <p
              role="alert"
              data-field-error
              className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
            >
              {ROUTE_RECONFIRMATION_MESSAGE}
            </p>
            {renderBookingErrorHelp("route")}
          </div>
        ) : null}
        {quoteStep === 1 ? (
          <>
        <div
          id="step1-journey-details"
          ref={step1JourneyRef}
          className="scroll-mt-44 space-y-3 sm:space-y-4 md:scroll-mt-28"
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
              onPickupPlaceSelect={handlePickupPlacesSuggestionSelect}
              onDropoffPlaceSelect={handleDropoffPlacesSuggestionSelect}
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
                if (returnOfferToken) {
                  return;
                }
                markQuoteFunnelStarted();
                setJourneyMode(value);
                if (value === "one-way") setReturnDateError("");
              }}
              lockReturnOfferJourney={Boolean(returnOfferToken)}
              passengers={passengers}
              onPassengersChange={(value) => {
                markQuoteFunnelStarted();
                setPassengers(value);
                setPassengersError("");
              }}
              exactPassengers={exactPassengers}
              onExactPassengersChange={setExactPassengers}
              suitcases={suitcases}
              onSuitcasesChange={(value) => {
                markQuoteFunnelStarted();
                setSuitcases(value);
                setSuitcasesError("");
              }}
              passengersError={passengersError}
              suitcasesError={suitcasesError}
              isGroupQuote={false}
              showRouteFields={Boolean(journeyIntent)}
              showJourneyModeFields={
                returnOfferToken
                  ? false
                  : journeyIntent === "address-to-address"
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
                isIncompletePickupAddress || isOutOfAreaPickupJourney || isRoiJourney
                  ? "grid-rows-[1fr]"
                  : "grid-rows-[0fr]"
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                {isIncompletePickupAddress ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
                  >
                    <p className="font-semibold text-red-100">{INCOMPLETE_PICKUP_ADDRESS_MESSAGE}</p>
                  </div>
                ) : isOutOfAreaPickupJourney ? (
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
                ref={routeSummaryRef}
                id={
                  quoteChoicesReady && hasQuoteRoute && quoteStep === 1
                    ? "quote-results-summary"
                    : undefined
                }
                className={
                  quoteChoicesReady && hasQuoteRoute && quoteStep === 1
                    ? "scroll-mt-44 space-y-3 outline-none md:scroll-mt-28"
                    : undefined
                }
                style={
                  quoteChoicesReady && hasQuoteRoute && quoteStep === 1
                    ? { overflowAnchor: "none" }
                    : undefined
                }
              >
                {/*
                  Show YOUR ROUTE as soon as bags/capacity are complete so Stage 6
                  can scroll here immediately (do not wait for metrics). Prefetch
                  stays sr-only while the customer is still on passengers/bags.
                */}
                <div
                  className={
                    quoteChoicesReady && hasQuoteRoute && quoteStep === 1
                      ? undefined
                      : "sr-only"
                  }
                  aria-hidden={
                    !(quoteChoicesReady && hasQuoteRoute && quoteStep === 1)
                  }
                >
                  <TripMap
                    id={
                      quoteChoicesReady && hasQuoteRoute && quoteStep === 1
                        ? "quote-route-summary"
                        : undefined
                    }
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
                    {renderBookingErrorHelp("results")}
                    {renderStartNewQuoteControls("results")}
                    {!exceedsOnlineCapacity && (
                      <div className="rounded-xl border border-white/12 bg-white/[0.03] px-3 py-3 sm:px-4 sm:py-3.5">
                        <p className="form-label mb-0">
                          Vehicle for this journey
                        </p>
                        <p className="mt-1.5 font-display text-xl font-semibold tracking-tight text-white sm:text-[1.35rem]">
                          {vehicleShortLabel(quoteVehicle)}
                        </p>
                        <p className="quote-secondary mt-1.5 text-xs leading-relaxed">
                          Selected automatically from your passengers and luggage.
                        </p>
                      </div>
                    )}

                    <div
                      id="quote-price-summary"
                      className="quote-price-panel"
                    >
                      {renderQuotePriceSummaryBody()}
                    </div>

                    {/* Non-sticky scroll target — sticky Book Now wrappers defeat iOS scroll rect math. */}
                    <div
                      id="quote-book-now-anchor"
                      className="h-px w-full scroll-mt-44 md:scroll-mt-28"
                      aria-hidden="true"
                    />
                    <div
                      id="quote-step1-next"
                      className="sticky z-20 -mx-1 space-y-2 border-t border-white/10 bg-navy/95 px-1 py-3 backdrop-blur-md supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:z-auto sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
                      style={{ bottom: "var(--matni-cookie-banner-offset, 0px)" }}
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
        {hasQuoteRoute && !returnOfferToken ? (
        <div id="journey-type-selector">
          <p className="form-label mb-2">
            Journey
            {journeyMode == null ? (
              <span className="ml-1 font-normal normal-case tracking-normal text-emerald/80">
                (required)
              </span>
            ) : null}
          </p>
          <div
            role="group"
            aria-label="One way or return"
            className={`grid grid-cols-2 overflow-hidden rounded-xl border bg-white/[0.06] ${
              journeyMode == null
                ? "border-emerald/50 ring-1 ring-emerald/25"
                : "border-white/15"
            }`}
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
            <p className="form-label mb-2">
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
                onClick={() => applyJourneyIntent("to-airport")}
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
                onClick={() => applyJourneyIntent("from-airport")}
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
              className="form-label"
            >
              {isFromAirport ? "Pickup Airport" : "Destination Airport"}
            </label>
            {isLdyTrip && (
              <p className="quote-secondary mb-2 text-xs">
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
                onSelectPlace={handleDropoffPlacesSuggestionSelect}
                requireSuggestion
                confirmedPlace={isQuoteReadyPlace(dropoffPlace) ? dropoffPlace : null}
                needsCompletion={quoteStep === 1 && !isPlaceSelected(dropoffPlace)}
                selectionError={dropoffPlaceError}
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
                onSelectPlace={handlePickupPlacesSuggestionSelect}
                requireSuggestion
                confirmedPlace={isQuoteReadyPlace(pickupPlace) ? pickupPlace : null}
                needsCompletion={quoteStep === 1 && !isPlaceSelected(pickupPlace)}
                selectionError={pickupPlaceError}
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
              onSelectPlace={handlePickupPlacesSuggestionSelect}
              requireSuggestion
              confirmedPlace={isQuoteReadyPlace(pickupPlace) ? pickupPlace : null}
              needsCompletion={quoteStep === 1 && !isPlaceSelected(pickupPlace)}
              selectionError={pickupPlaceError}
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
              onSelectPlace={handleDropoffPlacesSuggestionSelect}
              requireSuggestion
              confirmedPlace={isQuoteReadyPlace(dropoffPlace) ? dropoffPlace : null}
              needsCompletion={quoteStep === 1 && !isPlaceSelected(dropoffPlace)}
              selectionError={dropoffPlaceError}
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
              onChange={(value) => {
                setPassengers(value);
                setPassengersError("");
              }}
              formatOption={formatPassengerChoice}
              needsCompletion={quoteStep === 1 && passengers == null}
            />
            <TapChoiceRow
              label="Large suitcases (23kg)"
              options={[0, 1, 2, 3, 4].filter((count) => count <= SELECTOR_MAX_SUITCASES)}
              value={suitcases == null ? null : Math.min(suitcases, SELECTOR_MAX_SUITCASES)}
              onChange={(value) => {
                setSuitcases(value);
                setSuitcasesError("");
              }}
              formatOption={formatSuitcaseChoice}
              needsCompletion={quoteStep === 1 && suitcases == null}
            />
          </div>
          {passengersError || suitcasesError ? (
            <p id="quote-party-error" role="alert" data-field-error className="text-xs text-red-300">
              {passengersError || suitcasesError}
            </p>
          ) : !partySelectionReady ? (
            <p
              id="quote-party-prompt"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/80"
              role="status"
            >
              Select your passenger and suitcase numbers to see your fixed price.
            </p>
          ) : null}
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
          <p className="quote-secondary text-xs leading-relaxed">
            Up to 4 passengers. Saloon or Estate is chosen automatically from your party size and
            luggage — private airport transfer for 1–4 passengers.
          </p>
        </div>
        )}

        {!isA2AFlow && quoteResultsReady && quoteStep === 1 && (
          <div
            id="quote-results-summary"
            className="scroll-mt-44 space-y-3 outline-none md:scroll-mt-28"
            style={{ overflowAnchor: "none" }}
          >
            {renderBookingErrorHelp("results")}
            {renderStartNewQuoteControls("results")}
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
                {quoteVehicle === ESTATE ? (
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
              className="quote-price-panel"
            >
              {renderQuotePriceSummaryBody()}
            </div>
            <div
              id="quote-book-now-anchor"
              className="h-px w-full scroll-mt-44 md:scroll-mt-28"
              aria-hidden="true"
            />
            <div
              id="quote-step1-next"
              className="sticky z-20 -mx-1 space-y-2 border-t border-white/10 bg-navy/95 px-1 py-3 backdrop-blur-md supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:z-auto sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
              style={{ bottom: "var(--matni-cookie-banner-offset, 0px)" }}
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
        <div className="grid w-full min-w-0 max-w-full gap-4 sm:grid-cols-2 lg:gap-3.5">
          <div className="min-w-0 max-w-full">
            <label
              htmlFor="date"
              className="form-label"
            >
              {returnJourney ? "Outbound Date" : "Date"}{" "}
              <span className="font-normal normal-case tracking-normal text-ink-secondary/80">
                (needed to book)
              </span>
            </label>
            <div
              className={quoteDateTimeFieldShellClass(
                fieldState({
                  hasError: Boolean(tripDateError),
                  complete: Boolean(tripDate.trim()),
                  activeStep: quoteStep === 2,
                }),
              )}
            >
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
                  const value = e.target.value;
                  setTripDate(value);
                  if (value && tripTime) {
                    setTripDateError("");
                  }
                  setReturnDateError("");
                }}
                onInput={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  setTripDate(value);
                  if (value && tripTime) {
                    setTripDateError("");
                  }
                  setReturnDateError("");
                }}
                className={quoteDateTimeInputClass()}
              />
            </div>
          </div>
          <div className="min-w-0 max-w-full">
            <label
              htmlFor="time"
              className="form-label"
            >
              {returnJourney ? "Outbound pick up time" : "Pick up time"}{" "}
              <span className="font-normal normal-case tracking-normal text-ink-secondary/80">
                (needed to book)
              </span>
            </label>
            <div
              className={quoteDateTimeFieldShellClass(
                fieldState({
                  hasError: Boolean(tripDateError),
                  complete: Boolean(tripTime.trim()),
                  activeStep: quoteStep === 2,
                }),
              )}
            >
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
                  const value = e.target.value;
                  setTripTime(value);
                  if (tripDate && value) {
                    setTripDateError("");
                  }
                  setReturnDateError("");
                }}
                onInput={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  setTripTime(value);
                  if (tripDate && value) {
                    setTripDateError("");
                  }
                  setReturnDateError("");
                }}
                onBlur={() => {
                  // iPhone Done / tick dismisses the picker → blur. Scroll only then.
                  requestJourneySummaryScrollAfterTimeConfirm();
                }}
                className={quoteDateTimeInputClass()}
              />
            </div>
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
            <div className="grid w-full min-w-0 max-w-full gap-4 sm:grid-cols-2">
              <div className="min-w-0 max-w-full">
                <label
                  htmlFor="returnDate"
                  className="form-label"
                >
                  Return Date{" "}
                  <span className="font-normal normal-case tracking-normal text-ink-secondary/80">
                    (needed to book)
                  </span>
                </label>
                <div
                  className={quoteDateTimeFieldShellClass(
                    fieldState({
                      hasError: Boolean(returnDateError),
                      complete: Boolean(returnDate.trim()),
                      activeStep: quoteStep === 2 && returnJourney,
                    }),
                  )}
                >
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
                    className={quoteDateTimeInputClass()}
                  />
                </div>
              </div>
              <div className="min-w-0 max-w-full">
                <label
                  htmlFor="returnTime"
                  className="form-label"
                >
                  Return pick up time{" "}
                  <span className="font-normal normal-case tracking-normal text-ink-secondary/80">
                    (needed to book)
                  </span>
                </label>
                <div
                  className={quoteDateTimeFieldShellClass(
                    fieldState({
                      hasError: Boolean(returnDateError),
                      complete: Boolean(returnTime.trim()),
                      activeStep: quoteStep === 2 && returnJourney,
                    }),
                  )}
                >
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
                    onBlur={() => {
                      requestJourneySummaryScrollAfterTimeConfirm();
                    }}
                    className={quoteDateTimeInputClass()}
                  />
                </div>
              </div>
              <p className="sm:col-span-2 min-h-[1.1rem] text-xs text-red-400">
                {returnDateError || "\u00a0"}
              </p>
            </div>
          </div>
        </div>

        {renderFlightDetailsSection(2)}

        <div
          id="step2-journey-summary"
          ref={step2JourneySummaryRef}
          className="scroll-mt-44 rounded-xl border border-white/10 bg-white/5 px-4 py-3 md:scroll-mt-28"
        >
          <p
            data-booking-nav-heading
            tabIndex={-1}
            className="form-label mb-0 outline-none"
          >
            Your Journey
          </p>
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
          className="quote-price-panel scroll-mt-44 outline-none md:scroll-mt-28"
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
            {isManualQuoteJourney
              ? "Enter your details and submit your quote request. We’ll review it and send your personalised price — no payment is taken now."
              : canPayNowOnline
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
                  className={bookingTextFieldClass(
                    fieldState({
                      hasError: Boolean(customerNameError),
                      complete: Boolean(customerName.trim()),
                      activeStep: quoteStep === 3,
                    }),
                  )}
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
                    const value = e.target.value;
                    setCustomerMobile(value);
                    if (!mobileNumberError) return;
                    if (value.trim() && isValidMobileNumber(value)) {
                      setMobileNumberError("");
                    } else if (value.trim() && mobileNumberError === QUOTE_REQUIRED_FIELD_MESSAGES.mobile) {
                      setMobileNumberError("");
                    }
                  }}
                  placeholder="07xxx xxxxxx"
                  className={bookingTextFieldClass(
                    fieldState({
                      hasError: Boolean(mobileNumberError),
                      complete: isValidMobileNumber(customerMobile),
                      activeStep: quoteStep === 3,
                    }),
                  )}
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
                  const value = e.target.value;
                  setCustomerEmail(value);
                  if (!emailAddressError) return;
                  if (value.trim() && isValidEmailAddress(value)) {
                    setEmailAddressError("");
                  } else if (value.trim() && emailAddressError === QUOTE_REQUIRED_FIELD_MESSAGES.email) {
                    setEmailAddressError("");
                  }
                }}
                placeholder="you@example.com"
                className={bookingTextFieldClass(
                  fieldState({
                    hasError: Boolean(emailAddressError),
                    complete: isValidEmailAddress(customerEmail),
                    activeStep: quoteStep === 3,
                  }),
                )}
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
          </div>
        </div>

        {paymentError && !(canPayNowOnline && liveQuote) ? (
          <div className="space-y-3">
            <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {paymentError}
            </p>
            {renderBookingErrorHelp("payment-early")}
          </div>
        ) : null}

                  <div id="step3-booking-review" className={`${BOOKING_PANEL_CLASS} scroll-mt-44 md:scroll-mt-28`}>
            <div className="mb-4">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                {isManualQuoteJourney || showsRequestQuoteFlow
                  ? "Journey summary"
                  : isEnquiryOnly
                    ? "Enquiry summary"
                    : "Journey summary"}
              </p>
              <p className="mt-1 text-sm text-white/75">
                Check your journey details before continuing.
              </p>
            </div>
            <dl>
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
              <PreviewRow label="Destination" value={dropoffLabel} />
              {journeyDurationLabel && (
                <PreviewRow
                  label="Estimated journey time"
                  value={journeyDurationLabel}
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
              {needsOutboundFlightNumber && (
                <PreviewRow
                  label="Flight for going"
                  value={
                    verifiedGoingFlight
                      ? formatVerifiedFlightSummary(verifiedGoingFlight)
                      : goingFlightNumber.trim().toUpperCase()
                  }
                />
              )}
              {needsReturnCollectionFlightNumber && (
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
                label="Luggage"
                value={suitcases == null ? "—" : String(suitcases)}
              />
              {quoteVehicle ? (
                <PreviewRow label="Vehicle" value={vehicleShortLabel(quoteVehicle)} />
              ) : null}
              {pricingConfirmationRequired ? (
                <PreviewRow label="Pricing" value={priceConfirmationLabel} />
              ) : isManualQuoteJourney ? (
                <PreviewRow
                  label="Pricing"
                  value="Personalised quote — we’ll confirm your price"
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
                    testChargeAmount ??
                      pricedFare?.totalGbp ??
                      appliedPersonalQuote?.agreedAmount ??
                      liveQuote.amount,
                  )}
                />
              ) : null}
              {appliedPersonalQuote && liveQuote && testChargeAmount === null ? (
                <PreviewRow
                  label="Standard website fare"
                  value={formatQuote(liveQuote.amount)}
                />
              ) : null}
            </dl>
            <button
              type="button"
              onClick={handleEditBooking}
              className="btn-secondary mt-4 w-full"
            >
              Edit journey
            </button>
          </div>

        {submitError && (
          <div className="space-y-3">
            <p
              id="quote-submit-error"
              role="alert"
              className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
            >
              {submitError}
            </p>
            {renderBookingErrorHelp("submit")}
          </div>
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
              mode={
                isManualQuoteJourney
                  ? "quote-request"
                  : canPayNowOnline
                    ? "card-payment"
                    : "booking-request"
              }
              paymentAmountLabel={
                isEnquiryOnly || isManualQuoteJourney
                  ? undefined
                  : testChargeAmount !== null
                    ? "£1.00"
                    : appliedPersonalQuote
                      ? formatQuote(appliedPersonalQuote.agreedAmount)
                      : liveQuote
                        ? formatQuote(
                            pricedFare?.totalGbp ?? liveQuote.amount,
                          )
                        : undefined
              }
            />

            <MarketingOptIn checked={marketingOptIn} onCheckedChange={setMarketingOptIn} />

            {canPayNowOnline &&
            liveQuote &&
            testChargeAmount === null &&
            !appliedPersonalQuote &&
            openWebsiteFareBreakdown ? (
              <FinalPayableBreakdown
                breakdown={openWebsiteFareBreakdown}
                service={expressSelection.service ?? "drop-off"}
                freeAirportAccessSelected={
                  expressSelection.eligible && expressSelection.feeGbp === 0
                }
              />
            ) : null}

            {canPayNowOnline && liveQuote && testChargeAmount === null ? (
              <BookWithConfidence />
            ) : null}

            <div
              id="step3-payment-actions"
              ref={step3PaymentActionsRef}
              className="scroll-mt-44 space-y-3 md:scroll-mt-28"
            >
            {smartAvailabilityBlocked || isCustomerSmartAvailabilityBlockMessage(paymentError) ? (
              <div id="customer-smart-availability-blocked-step3">
                <CustomerSmartAvailabilityBlocked
                  message={
                    isCustomerSmartAvailabilityBlockMessage(paymentError)
                      ? paymentError
                      : CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE
                  }
                  alternativeTimes={availabilityAlternatives}
                  onSelectAlternative={(option) => void handleSelectAvailabilityAlternative(option)}
                  onChooseAnotherTime={handleChooseAnotherTime}
                  onChooseAnotherDate={handleChooseAnotherDate}
                  selectingTime={selectingAlternativeTime}
                />
              </div>
            ) : canPayNowOnline && liveQuote && (
              <div className="space-y-3">
                {paymentError ? (
                  <div className="space-y-3">
                    <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                      {paymentError}
                    </p>
                    {renderBookingErrorHelp("payment-actions")}
                  </div>
                ) : null}
                {paymentPopupBlocked && !paymentError ? (
                  <div className="space-y-3">
                    <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                      Payment could not open automatically. Tap “Continue to SumUp” below, or message
                      us on WhatsApp if you still need help.
                    </p>
                    {renderBookingErrorHelp("payment-actions")}
                  </div>
                ) : null}
                {isCustomerSmartAvailabilityBlockMessage(paymentError) ? (
                  <p className="quote-secondary text-xs leading-relaxed">
                    You can still message us on WhatsApp or send an enquiry. Online payment is
                    paused for this pickup time only.
                  </p>
                ) : openCheckout ? (
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
                        className="btn-secondary w-full"
                      >
                        Return to / Edit booking
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenPaymentAgain}
                        disabled={paymentLoading}
                        className="btn-pay w-full disabled:cursor-not-allowed disabled:opacity-70"
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
                    <p className="quote-secondary text-xs leading-relaxed">
                      You’ll be securely redirected to SumUp to complete your payment. Your booking
                      details stay saved if you return to this page.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handlePayNow()}
                      disabled={paymentLoading || submitted}
                      className="btn-pay w-full disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {paymentLoading
                        ? "Opening secure payment…"
                        : testChargeAmount !== null
                          ? "Pay £1.00 test charge with SumUp"
                          : `Pay ${formatQuote(appliedPersonalQuote?.agreedAmount ?? pricedFare?.totalGbp ?? liveQuote.amount)} now with SumUp`}
                    </button>
                    <p className="quote-secondary text-center text-xs">
                      Card payments are processed securely by SumUp. You&apos;ll receive a branded
                      invoice by email after payment.
                    </p>
                  </>
                )}
              </div>
            )}
            {smartAvailabilityBlocked || isCustomerSmartAvailabilityBlockMessage(paymentError) ? null : canPayNowOnline ? (
              <button
                type="button"
                onClick={handleEditBooking}
                className="btn-secondary w-full"
              >
                Back to travel details
              </button>
            ) : isManualQuoteJourney ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleEditBooking}
                  className="btn-secondary w-full"
                >
                  Back to travel details
                </button>
                <button
                  type="submit"
                  disabled={submitted}
                  className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitted ? submitInProgressLabel : confirmButtonLabel}
                </button>
              </div>
            ) : usesWhatsApp ? (
              <>
                <p className="quote-secondary text-xs">
                  {isEnquiryOnly
                    ? "Choose how to send your enquiry:"
                    : "Choose how to send your booking:"}
                </p>
                <button
                  type="button"
                  onClick={handleEditBooking}
                  className="btn-secondary w-full"
                >
                  Back to travel details
                </button>
                <button
                  type="button"
                  disabled={submitted}
                  onClick={() => void confirmBooking("whatsapp")}
                  className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitted ? submitInProgressLabel : whatsAppConfirmLabel}
                </button>
                <button
                  type="button"
                  disabled={submitted}
                  onClick={() => void confirmBooking("email")}
                  className="btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitted
                    ? submitInProgressLabel
                    : isEnquiryOnly
                      ? "Send enquiry via email"
                      : "Send booking via email"}
                </button>
                <p className="quote-secondary text-xs leading-relaxed">
                  No WhatsApp? Email works too — we&apos;ll confirm at {customerEmail.trim()}.
                </p>
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleEditBooking}
                  className="btn-secondary w-full"
                >
                  Back to travel details
                </button>
                <button
                  type="submit"
                  disabled={submitted}
                  className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitted ? submitInProgressLabel : confirmButtonLabel}
                </button>
              </div>
            )}
            {renderBookingErrorHelp("step3")}
            {renderStartNewQuoteControls("step3")}
            </div>
          </div>
          </>
        ) : quoteStep === 2 ? (
          <div id="quote-step2-next" className="scroll-mt-44 space-y-3 md:scroll-mt-28">
            {smartAvailabilityBlocked || isCustomerSmartAvailabilityBlockMessage(paymentError) ? (
              <div id="customer-smart-availability-blocked">
                <CustomerSmartAvailabilityBlocked
                  message={
                    isCustomerSmartAvailabilityBlockMessage(paymentError)
                      ? paymentError
                      : CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE
                  }
                  alternativeTimes={availabilityAlternatives}
                  onSelectAlternative={(option) => void handleSelectAvailabilityAlternative(option)}
                  onChooseAnotherTime={handleChooseAnotherTime}
                  onChooseAnotherDate={handleChooseAnotherDate}
                  selectingTime={selectingAlternativeTime}
                />
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  navigateQuoteStep(1);
                  clearFlightFieldErrors();
                  setReturnDateError("");
                }}
                className="btn-secondary w-full"
              >
                Back
              </button>
              {smartAvailabilityBlocked ? null : (
                <button
                  type="button"
                  disabled={submitted || continueToDetailsBusy}
                  onClick={handleContinueTravelDetails}
                  className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Continue to your details
                </button>
              )}
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
            {renderBookingErrorHelp("step2")}
            {renderStartNewQuoteControls("step2")}
            {saveQuotePrompt ? (
              <p className="text-center text-xs text-emerald/90" role="status">
                {saveQuotePrompt}
              </p>
            ) : null}
            {travelDetailsBlocker ? (
              <p className="quote-secondary text-center text-xs" role="status">
                {travelDetailsBlocker}
              </p>
            ) : (
              <p className="quote-secondary text-center text-xs">
                Next: your contact details to confirm the booking.
              </p>
            )}
          </div>
        ) : quoteResultsReady ? null : (
          <>
            <div
              id="quote-book-now-anchor"
              className="h-px w-full scroll-mt-44 md:scroll-mt-28"
              aria-hidden="true"
            />
            <div id="quote-step1-next" className="flex w-full scroll-mt-44 flex-col gap-2 md:scroll-mt-28">
              {renderStep1PrimaryActions()}
            </div>
          </>
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
