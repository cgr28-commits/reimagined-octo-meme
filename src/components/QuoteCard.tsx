Warning: truncated output (original token count: 83307)
Total output lines: 8756

"use client";

import { FormEvent, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import AddressInput from "@/components/AddressInput";
import HomepageQuoteFields from "@/components/HomepageQuoteFields";
import QuoteProgressiveRoute from "@/components/QuoteProgressiveRoute";
import QuoteScheduleFields from "@/components/QuoteScheduleFields";
import {
  hasEnteredQuoteSchedule,
  QUOTE_INCLUDES_NIGHT_WEEKEND_SURCHARGE,
  QUOTE_PRICE_WAIT_FOR_DETAILS,
  QUOTE_PRICE_WAIT_FOR_SCHEDULE,
} from "../../shared/quote-display-gate";
import BookingTermsConsent from "@/components/BookingTermsConsent";
import MarketingOptIn from "@/components/MarketingOptIn";
import {
  BookingErrorHelpCluster,
  StartNewQuoteControls,
} from "@/components/QuoteBookingHelpControls";
import TripMap from "@/components/TripMap";
import QuoteHelpContact from "@/components/QuoteHelpContact";
import QuoteActionDialog from "@/components/QuoteActionDialog";
import DesktopQuoteEnquiry from "@/components/DesktopQuoteEnquiry";
import {
  QUOTE_RESULT_ACTION_CLASS,
  QuoteResultActionIcon,
} from "@/components/quote-result-action";
import QuoteJourneyMap, { type QuoteMapPoint } from "@/components/QuoteJourneyMap";
import { buildBookingMessage, buildEnquiryBookingMessage, isValidEmailAddress, isValidMobileNumber, normalizeChildSeats, type BookingDetails } from "@/lib/booking-message";
import { buildMarketingOptInFields, recordMarketingOptIn } from "@/lib/marketing-api";
import { TERMS_LAST_UPDATED } from "@/lib/terms";
import { CANCELLATION_POLICY_VERSION } from "../../shared/refund-ops";
import { detectMobileDevice, useIsMobileDevice } from "@/lib/device";
import { cancelCompetingScrollJobs } from "@/lib/scroll-jobs";
import {
  focusFirstInvalidField,
  quoteStepTargetId,
  scheduleScrollToBookNowAfterExpressAck,
  scheduleBookTransferGlide,
  scheduleQuoteRevealScroll,
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
  choiceGroupNeedsClass,
  QUOTE_CHOICE_OFF,
  QUOTE_CHOICE_ON,
  type QuoteFieldHighlightState,
} from "@/lib/quote-ui-highlight";
import {
  AIRPORTS,
  isInstantPayVehicle,
  isVehicleEnquiryOnly,
  isVehicleRequestQuote,
  MAX_ONLINE_PASSENGERS,
  MINIBUS_VEHICLE_TYPE,
  isFivePlusLuggage,
  SERVICE_FLAGS,
  showsOnlineGuidePrice,
  SITE,
  VEHICLE_TYPES,
} from "@/lib/data";
import {
  ESTATE_VEHICLE,
  EXECUTIVE_VEHICLE,
  formatPassengerChoice,
  formatSuitcaseChoice,
  canonicalVehicleType,
  enabledVehicleTypesForQuote,
  keepOrSmallestSuitableVehicle,
  MAX_PUBLIC_SUITCASES,
  requiresMinibus,
  selectVehicleForParty,
  suitableVehicleTypesForParty,
  vehicleFitsParty,
  vehicleShortLabel,
} from "@/lib/vehicle-selection";
import {
  publicPassengerLimitMessage,
  publicPassengerOptions,
  publicSuitcaseLimitMessage,
  publicSuitcaseOptions,
} from "../../shared/passenger-limits";
import {
  PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE,
  publicVehicleRequiresPersonalQuote,
  publicMaxPassengers,
  publicMaxSuitcases,
  type PublicOwnerPricingConfig,
} from "../../shared/owner-pricing-config";
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from "../../shared/owner-pricing-config";
import { fetchPublicPricingConfig } from "@/lib/owner-pricing-api";
import { isBrowserPricingPreview, previewMinibusQueryEnabled } from "@/lib/pricing-preview-store";
import { postcodeFareHasPence } from "../../shared/postcode-pricing";
import { readPreviewCustomerQuoteSeed } from "@/lib/preview-customer-quote";
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
  formatRouteCardJourneyTime,
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
  isPaymentVehicleUnavailableError,
  isPaymentOwnerNoAvailabilityError,
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
import {
  formatCustomerClock,
  type CustomerPublicAlternativeTime,
} from "../../shared/customer-smart-availability";
import { QUOTE_REQUIRED_FIELD_MESSAGES } from "../../shared/quote-required-field-messages";
import { planJourneyDirectionDependentReset } from "../../shared/quote-journey-direction";
import { CustomerSmartAvailabilityBlocked } from "@/components/CustomerSmartAvailabilityBlocked";
import { OwnerNoAvailabilityBlocked } from "@/components/OwnerNoAvailabilityBlocked";
import {
  ROUTE_RECONFIRMATION_MESSAGE,
  ROUTE_SERVICE_UNAVAILABLE_MESSAGE,
  addressTextMatchesPlace,
  restoredPlacesReadyForPayment,
} from "../../shared/route-reconfirmation";
import { calculateServerQuote } from "@/lib/quick-quote-api";
import {
  PAYMENT_METHOD_DEPOSIT_CASH,
  PAYMENT_METHOD_FULL_ONLINE,
  CASH_AGREEMENT_REQUIRED_MESSAGE,
  CASH_SELECTED_CARD_UNAVAILABLE,
  DEPOSIT_CASH_BADGE,
  DEPOSIT_CASH_CHOOSE_HEADING,
  DEPOSIT_CASH_OPTION_LABEL,
  DEPOSIT_CASH_SELECTED_HEADING,
  DEPOSIT_CASH_SUMMARY_HEADING,
  FULL_ONLINE_OPTION_LABEL,
  FULL_ONLINE_SUPPORTING,
  SECURE_SUMUP_LINE,
  cashAgreementLabel,
  cashSelectedRemainingSentence,
  depositPayButtonLabel,
  formatDepositCashGbp,
  fullPayButtonLabel,
  nothingToPayOnTheDayLabel,
  paymentSummaryCashDueLabel,
  paymentSummaryPayTodayDepositLabel,
  paymentSummaryTotalFareLabel,
  publicDepositCashOffer,
  todayPayLabel,
  type DepositCashSettings,
  type PaymentMethod,
} from "../../shared/deposit-cash";
import {
  serverFareAppliesToParty,
  type ServerFarePartyParts,
} from "@/lib/quote-display-fare";
import {
  AUTHORITATIVE_QUOTE_UNAVAILABLE_MESSAGE,
  mayPaintAuthoritativeFare,
} from "@/lib/authoritative-quote-fare";
import {
  UNPAID_REQUEST_RECEIVED_BODY,
  UNPAID_REQUEST_RECEIVED_HEADING,
} from "@/lib/unpaid-request-copy";
import {
  QUOTE_FARE_START_DELAY_MS,
  quoteFareRequestKey,
  quoteFareVehiclesToRequest,
} from "@/lib/quote-fare-request";
import {
  validatePersonalQuoteCode,
  type PersonalQuotePublicSummary,
} from "@/lib/personal-quote-api";
import SaveQuoteModal from "@/components/SaveQuoteModal";
import ExpressDropOffChoice from "@/components/ExpressDropOffChoice";
import QuoteAirportBenefits from "@/components/QuoteAirportBenefits";
import QuoteResultShowcase, {
  preloadQuoteResultVehicleImages,
} from "@/components/QuoteResultShowcase";
import QuoteVehicleCategories from "@/components/QuoteVehicleCategories";
import QuoteCheckoutSummary from "@/components/QuoteCheckoutSummary";
import {
  BookWithConfidence,
  FixedPriceAssurance,
  PromotionalPriceBreakdown,
  buildOpenWebsiteFareBreakdown,
} from "@/components/QuoteFareTrust";
import ShortNoticeRequestReceived from "@/components/ShortNoticeRequestReceived";
import ShortNoticeCheckoutNotice, {
  MinibusNoticeCheckoutNotice,
  ShortNoticePaymentFollowUp,
  TooSoonCheckoutNotice,
} from "@/components/ShortNoticeCheckoutNotice";
import {
  MINIBUS_NOTICE_CTA,
  MINIBUS_RESOURCE_UNAVAILABLE_MESSAGE,
} from "../../shared/availability-resource";
import { isPublicMinibusVehicle } from "../../shared/owner-pricing-config";
import {
  classifyPickupLeadWindow,
  isOwnerNoAvailabilityMessage,
  isWithinMinimumBookingNotice,
  OWNER_NO_AVAILABILITY_MESSAGE,
  tooSoonRequestBody,
} from "../../shared/booking-notice";
import { useMinimumBookingNoticeHours } from "@/lib/use-minimum-booking-notice-hours";
import {
  canProceedWithoutExpressDropOffLegs,
  composeFareWithExpressDropOff,
  expressCheckoutChangeLabel,
  expressQuoteSelectionConfirmation,
  resolveExpressDropOff,
} from "../../shared/express-drop-off";
import {
  listAirportPickupLegs,
  quoteAirportAccessCharges,
  type AirportAccessChoice,
  type AirportPickupLegRef,
} from "../../shared/meet-greet";
import {
  AIRPORT_ACCESS_INCLUDED_BODY,
  AIRPORT_ACCESS_INCLUDED_HEADING,
  isExecutiveVehicle,
} from "../../shared/executive-vehicle";
import { DEFAULT_BUSINESS_CLASS_MINIMUM_FARE_GBP } from "../../shared/business-class-minimum";
import {
  RETURN_OFFER_CONFIG,
  isReturnOfferAirportJourney,
} from "../../shared/return-offer";
import {
  requiredAirportAccessNotice,
  resolveJourneyAirportFees,
} from "../../shared/airport-fixed-costs";
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
  type BookingFormDraft,
  type OpenCheckoutSession,
} from "@/lib/booking-draft-storage";
import { clearAbandonedQuotePersistence } from "@/lib/reset-quote-journey";
import {
  clearStoredQuoteAddresses,
  decideQuoteAddressReset,
  decideQuoteAddressResetFromPageShow,
} from "@/lib/fresh-visit-address-reset";
import {
  createPaymentReturnToken,
  savePendingPayment,
} from "@/lib/pending-payment";
import {
  clearConfirmedDropoffPlace,
  clearConfirmedPickupPlace,
  clearDropoffAddressStorage,
  clearPickupAddressStorage,
  saveConfirmedDropoffPlace,
  saveConfirmedPickupPlace,
  saveDropoffAddressLabel,
  savePickupAddressLabel,
} from "@/lib/address-place-storage";
import { scheduleQuoteContactAlert, scheduleQuoteLeadAlert } from "@/lib/submit-quote-lead";
import { destinationEligibleForStandardAirportPickup } from "../../shared/airport-pickup-service-area";
import { getPaymentBookingBlockers } from "../../shared/paid-booking-gate";
import {
  applyCancelPaymentReturnToQuote,
  openDesktopSumUpCheckout,
} from "@/lib/sumup-desktop-handoff";
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
  isGreaterBelfastIrelandInstantJourney,
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

/** Homepage only: journey direction comes from the two verified places. */
function classifyVerifiedJourney(
  pickup: SelectedPlace,
  dropoff: SelectedPlace,
): {
  intent: QuoteJourneyIntent;
  airport: CustomerAirportCode | "";
  direction: TripDirection;
} | null {
  if (!isPlaceSelected(pickup) || !isPlaceSelected(dropoff)) return null;
  const kind = detectJourneyKind(pickup, dropoff);
  if (!kind) return null;
  const pickupCode = detectAirportCodeFromPlace(pickup);
  const dropoffCode = detectAirportCodeFromPlace(dropoff);
  if (kind === "address-to-airport" && dropoffCode && isCustomerAirportCode(dropoffCode)) {
    return { intent: "to-airport", airport: dropoffCode, direction: "to-airport" };
  }
  if (
    (kind === "airport-to-address" || kind === "airport-to-airport") &&
    pickupCode &&
    isCustomerAirportCode(pickupCode)
  ) {
    return { intent: "from-airport", airport: pickupCode, direction: "from-airport" };
  }
  return { intent: "address-to-address", airport: "", direction: "to-airport" };
}

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

const BUSINESS_CLASS_PICKUP_INCLUSIONS = [
  "Meet & Greet inside arrivals",
  "Personalised name board",
  "Luggage assistance",
  "Complimentary bottled water",
  "Phone charging",
  "Airport terminal access included",
] as const;

const BUSINESS_CLASS_DROPOFF_INCLUSIONS = [
  "Luggage assistance",
  "Complimentary bottled water",
  "Phone charging",
  "Airport terminal access included",
] as const;

const SELECTOR_MAX_SUITCASES = MAX_PUBLIC_SUITCASES;

type VehicleType = (typeof VEHICLE_TYPES)[number];

function exceedsOnlineVehicleOptions(
  passengers: number,
  suitcases: number,
  maxPassengers = MAX_ONLINE_PASSENGERS,
  maxSuitcases = SELECTOR_MAX_SUITCASES,
): boolean {
  return passengers > maxPassengers || suitcases > maxSuitcases;
}

function isPartySelectionComplete(
  passengers: number | null,
  suitcases: number | null,
  maxPassengers = MAX_ONLINE_PASSENGERS,
  maxSuitcases = SELECTOR_MAX_SUITCASES,
): boolean {
  if (passengers == null || suitcases == null) return false;
  return (
    Number.isInteger(passengers) &&
    passengers >= 1 &&
    passengers <= maxPassengers &&
    Number.isInteger(suitcases) &&
    suitcases >= 0 &&
    suitcases <= maxSuitcases
  );
}

function effectivePartyPassengers(
  passengers: number | null,
  maxPassengers = MAX_ONLINE_PASSENGERS,
): number | null {
  if (passengers == null) return null;
  if (
    !Number.isInteger(passengers) ||
    passengers < 1 ||
    passengers > maxPassengers
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

function readStoredPassengerCount(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 7) return null;
  return n;
}

function readStoredSuitcaseCount(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 7) return null;
  return n;
}

function getAutoVehicle(passengers: number, suitcases: number, _a2aPrimary = false): VehicleType {
  void _a2aPrimary;
  return selectVehicleForParty(passengers, suitcases);
}

function TapChoiceRow({
  label,
  hint,
  options,
  value,
  onChange,
  formatOption,
  needsCompletion = false,
}: {
  label: string;
  hint?: string;
  options: number[];
  value: number | null;
  onChange: (value: number) => void;
  formatOption?: (value: number) => string;
  needsCompletion?: boolean;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/14 bg-white/[0.03] p-2">
      <div className="mb-2">
        <p className="form-label mb-0 lg:min-h-9">
          {label}
          {needsCompletion && value == null ? (
            <span className="ml-1.5 font-normal normal-case tracking-normal text-emerald/80">
              (required)
            </span>
          ) : null}
        </p>
        <p
          className={
            hint
              ? "mt-1 text-[11px] font-medium leading-snug text-white/70 lg:min-h-8"
              : "mt-1 hidden text-[11px] font-medium leading-snug text-white/70 lg:block lg:min-h-8 lg:invisible"
          }
        >
          {hint || "Include all children in the passenger total."}
        </p>
      </div>
      <div
        className="grid grid-cols-4 gap-2"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
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
                selected ? QUOTE_CHOICE_ON : QUOTE_CHOICE_OFF
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
    <div className="mt-3 text-xs leading-relaxed quote-secondary">
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
  bookingIntroduction?: string;
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
  /**
   * Homepage-only presentation for the approved mobile quote UI.
   * Landing pages omit this so their existing compact cards stay intact.
   */
  presentation?: "default" | "homepage";
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
  /**
   * Landing pages for the 7-seater can prefer that existing vehicle once the
   * party fits and the option is offered. Customers can still choose another
   * suitable vehicle. This does not change the fare calculation.
   */
  preferMinibus?: boolean;
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

function isClosedAvailabilityError(message?: string | null): boolean {
  return (
    isOwnerNoAvailabilityMessage(message) ||
    String(message || "").trim() === MINIBUS_RESOURCE_UNAVAILABLE_MESSAGE
  );
}

/** Owner lead copy for a public quote. Access is included; there is no free alternative. */
function websiteAirportAccessLeadLabel(selection: {
  eligible: boolean;
  legs: readonly unknown[];
  service?: string | null;
}): string | undefined {
  if (!selection.eligible) return undefined;
  if (selection.legs.length > 1) {
    return "Express Pickup Included · Express Drop-Off Included";
  }
  return selection.service === "pick-up" ? "Express Pickup Included" : "Express Drop-Off Included";
}

function QuoteCard({
  initialAirportCode = "",
  initialDirection = "to-airport",
  initialAddressHint = "",
  initialDropoffHint = "",
  initialJourneyIntent,
  presentation = "default",
  bookingIntroduction = "Pre-book your airport transfer in just a few clicks.",
  pageType = "main",
  maxPassengers = MAX_ONLINE_PASSENGERS,
  returnOfferToken = "",
  initialPickupPlace = null,
  initialDropoffPlace = null,
  preferMinibus = false,
}: QuoteCardProps) {
  preloadQuoteResultVehicleImages();
  const cardRef = useRef<HTMLDivElement>(null);
  /** Fare shown before date and time, so checkout can confirm a later change. */
  const provisionalQuotedAmountRef = useRef<number | null>(null);
  const step1JourneyRef = useRef<HTMLDivElement>(null);
  /** Stage 6: YOUR ROUTE / results stack after bags complete. */
  const routeSummaryRef = useRef<HTMLDivElement>(null);
  /** First pixel of the results the customer should land on. Not the price or a vehicle card. */
  const quoteResultsStartRef = useRef<HTMLDivElement>(null);
  /** Top edge of the white selected-vehicle quote card. Mobile results scroll lands here. */
  const quoteSelectedVehicleCardRef = useRef<HTMLDivElement>(null);
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
  /** Book This Transfer only. Other step changes keep the existing scroll. */
  const bookTransferGlideRef = useRef(false);
  /** Ignore a second tap while availability + step-3 commit are in flight. */
  const continueToDetailsInFlightRef = useRef(false);
  const [continueToDetailsBusy, setContinueToDetailsBusy] = useState(false);
  /** Stable id for once-per-attempt Step 1 funnel diagnostics (not PII). */
  const quoteFunnelAttemptIdRef = useRef(
    `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
  );
  const [publicPricing, setPublicPricing] = useState<PublicOwnerPricingConfig>(() =>
    toPublicOwnerPricingConfig(defaultOwnerPricingSettings()),
  );
  const [publicPricingLoaded, setPublicPricingLoaded] = useState(false);
  const publicMinibusEnabled = publicPricing.minibus.publicEnabled === true;
  const publicExecutiveEnabled = publicPricing.executive?.publicEnabled !== false;
  const passengerLimit = publicMinibusEnabled
    ? publicMaxPassengers(true)
    : Math.min(Math.max(1, maxPassengers), publicMaxPassengers(false));
  const suitcaseLimit = publicMaxSuitcases(publicMinibusEnabled);

  const previewQuoteAppliedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void fetchPublicPricingConfig().then((config) => {
      if (!cancelled) {
        setPublicPricing(config);
        setPublicPricingLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
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
      ? placeDisplayText(confirmedInitialPickup)
      : initialDirection === "from-airport" && initialAirportPlace
        ? placeDisplayText(initialAirportPlace)
        : initialDirection === "to-airport"
          ? initialAddressHint
          : "",
  );
  const [dropoffAddress, setDropoffAddress] = useState(
    confirmedInitialDropoff
      ? placeDisplayText(confirmedInitialDropoff)
      : initialDropoffHint ||
        (initialDirection === "to-airport" && initialAirportPlace
          ? placeDisplayText(initialAirportPlace)
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
  const [ownerNoAvailabilityBlocked, setOwnerNoAvailabilityBlocked] = useState(false);
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
    returnOfferToken || presentation === "homepage" ? "one-way" : null,
  );
  /** Homepage shows vehicle prices only after Get My Fixed Price. */
  const [homepagePriceRequested, setHomepagePriceRequested] = useState(false);
  const [homepageFareChangeAck, setHomepageFareChangeAck] = useState(false);
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
  const [chooseMinibus, setChooseMinibus] = useState(false);
  const [chooseExecutive, setChooseExecutive] = useState(false);
  const [chooseEstate, setChooseEstate] = useState(false);
  /** Explicit tap. Cleared only when passengers or suitcases change. */
  const [manualVehicle, setManualVehicle] = useState<VehicleType | null>(null);
  const [trackedPartyKey, setTrackedPartyKey] = useState("");
  const [passengers, setPassengers] = useState<number | null>(null);
  const [suitcases, setSuitcases] = useState<number | null>(null);
  const [homepageCapacityConfirmed, setHomepageCapacityConfirmed] = useState(false);
  const [exactPassengers, setExactPassengers] = useState<number | null>(null);
  const [childSeats, setChildSeats] = useState(0);
  const [childSeatNotes, setChildSeatNotes] = useState("");
  const [childSeatNotesError, setChildSeatNotesError] = useState("");
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
  const [quoteActionOpen, setQuoteActionOpen] = useState<"route" | "restart" | "whatsapp" | null>(null);
  const routeMetricsRef = useRef(routeMetrics);
  routeMetricsRef.current = routeMetrics;
  const authoritativeFareCacheRef = useRef(new Map<string, ServerFarePartyParts>());
  const quoteFareInflightRef = useRef(
    new Map<
      string,
      {
        promise: Promise<Awaited<ReturnType<typeof calculateServerQuote>>>;
        signal?: AbortSignal;
      }
    >(),
  );
  const quoteFareTimingRef = useRef({ inputsAt: 0, requestAt: 0 });
  /** Worker-authoritative journey/fixed split (same engine as SumUp). Prefer over browser metrics. */
  const [serverFareParts, setServerFareParts] = useState<ServerFarePartyParts | null>(null);
  /** Worker quote finished without a fare — only then may the loaded client engine paint. */
  const [serverQuoteUnavailable, setServerQuoteUnavailable] = useState(false);
  const serverQuoteGenRef = useRef(0);
  const quoteVehicleRef = useRef("");
  const customerPickedVehicleRef = useRef(false);
  const preferMinibusPartyKeyRef = useRef("");
  const quoteFareAbortRef = useRef<AbortController | null>(null);
  /** Stops a vehicle_unavailable response from retrying the same unsuitable choice. */
  const unsuitableFareRecoveryRef = useRef("");
  /** Vehicles the server has already rejected for the current party. */
  const rejectedVehicleKeysRef = useRef(new Set<string>());
  /** Route identity that already has a displayed fare. Vehicle switches reuse it. */
  const displayedRouteKeyRef = useRef<string | null>(null);
  const [vehicleFareUpdating, setVehicleFareUpdating] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [openCheckout, setOpenCheckout] = useState<OpenCheckoutSession | null>(null);
  const [paymentPopupBlocked, setPaymentPopupBlocked] = useState(false);
  const [
    minimumBookingNoticeHours,
    setMinimumBookingNoticeHours,
    minimumShortNoticeLeadHours,
    shortNoticeConfirmationWindowHours,
    minibusMinimumBookingNoticeHours,
  ] = useMinimumBookingNoticeHours();
  const [shortNoticeResult, setShortNoticeResult] = useState<{
    reference: string;
    whatsappUrl: string;
    amountLabel?: string;
    underMinimumNotice?: boolean;
    noticeHours?: number;
    luggageCapacity?: boolean;
    minibusNotice?: boolean;
  } | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [depositCashSettings, setDepositCashSettings] = useState<DepositCashSettings | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PAYMENT_METHOD_DEPOSIT_CASH);
  const [cashAgreementAccepted, setCashAgreementAccepted] = useState(false);
  const [outboundAccessChoice, setOutboundAccessChoice] = useState<AirportAccessChoice>("express");
  const [returnAccessChoice, setReturnAccessChoice] = useState<AirportAccessChoice>("express");
  const expressDropOffSelected = outboundAccessChoice === "express";
  const returnExpressDropOffSelected = returnAccessChoice === "express";
  const [expressRemovalAck, setExpressRemovalAck] = useState(false);
  const [returnExpressRemovalAck, setReturnExpressRemovalAck] = useState(false);
  const [expressAckRequired, setExpressAckRequired] = useState(false);
  const [expressEditingLeg, setExpressEditingLeg] = useState<"outbound" | "return" | null>(
    null,
  );
  /** A2A-only: fee line ids the customer independently removed. */
  const [removedAirportFeeIds, setRemovedAirportFeeIds] = useState<string[]>([]);
  const expressRemovalAckWasCheckedRef = useRef(false);
  const [termsError, setTermsError] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [testChargeAmount, setTestChargeAmount] = useState<number | null>(null);
  const [testBookingLabel, setTestBookingLabel] = useState<string | null>(null);
  const [appliedPersonalQuote, setAppliedPersonalQuote] =
    useState<PersonalQuotePublicSummary | null>(null);
  const handleRouteMetrics = useCallback((metrics: TripRouteMetrics | null) => {
    setRouteMetrics((current) => {
      if (metrics == null) return current == null ? current : null;
      if (
        current &&
        current.distanceKm === metrics.distanceKm &&
        current.durationMinutes === metrics.durationMinutes
      ) {
        return current;
      }
      return metrics;
    });
  }, []);

  const partySelectionKey =
    passengers == null || suitcases == null ? "" : `${passengers}:${suitcases}`;
  if (trackedPartyKey !== partySelectionKey) {
    unsuitableFareRecoveryRef.current = "";
    rejectedVehicleKeysRef.current.clear();
    setTrackedPartyKey(partySelectionKey);
    setManualVehicle(null);
  }

  const quoteVehicle = useMemo(() => {
    const pax =
      effectivePartyPassengers(passengers, passengerLimit) ??
      (passengers != null && passengers >= 1 ? passengers : null);
    if (pax == null || suitcases == null) return vehicle;
    const enabled = enabledVehicleTypesForQuote({
      publicMinibusEnabled,
      publicExecutiveEnabled,
    });
    if (
      manualVehicle &&
      enabled.includes(manualVehicle) &&
      vehicleFitsParty(manualVehicle, pax, suitcases)
    ) {
      return manualVehicle;
    }
    return keepOrSmallestSuitableVehicle({
      current: vehicle,
      passengers: pax,
      suitcases,
      publicMinibusEnabled,
      publicExecutiveEnabled,
    });
  }, [
    manualVehicle,
    passengerLimit,
    passengers,
    publicExecutiveEnabled,
    publicMinibusEnabled,
    suitcases,
    vehicle,
  ]);
  quoteVehicleRef.current = quoteVehicle;
  const isEnquiryOnly = isVehicleEnquiryOnly(quoteVehicle);
  const isRequestQuote = isVehicleRequestQuote(quoteVehicle);
  const showGuidePrice = showsOnlineGuidePrice(quoteVehicle);
  const [confirmStartNewQuote, setConfirmStartNewQuote] = useState(false);
  /** Bumped on Start a New Quote so address inputs remount with clean internal state. */
  const [formResetKey, setFormResetKey] = useState(0);

  useEffect(() => {
    const pax =
      effectivePartyPassengers(passengers, passengerLimit) ??
      (passengers != null && passengers >= 1 ? passengers : null);
    if (pax == null || suitcases == null) return;
    const manualStillSuitable =
      manualVehicle != null &&
      enabledVehicleTypesForQuote({
        publicMinibusEnabled,
        publicExecutiveEnabled,
      }).includes(manualVehicle) &&
      vehicleFitsParty(manualVehicle, pax, suitcases);
    if (manualStillSuitable) return;
    const next = keepOrSmallestSuitableVehicle({
      current: vehicle,
      passengers: pax,
      suitcases,
      publicMinibusEnabled,
      publicExecutiveEnabled,
    });
    setChooseExecutive(next === EXECUTIVE_VEHICLE);
    setChooseMinibus(next === MINIBUS_VEHICLE_TYPE);
    setChooseEstate(next === ESTATE_VEHICLE);
    if (next === vehicle) return;
    setVehicle(next);
  }, [
    manualVehicle,
    passengerLimit,
    passengers,
    publicExecutiveEnabled,
    publicMinibusEnabled,
    suitcases,
    vehicle,
  ]);

  useEffect(() => {
    if (!preferMinibus || !publicMinibusEnabled || customerPickedVehicleRef.current) return;
    const pax =
      effectivePartyPassengers(passengers, passengerLimit) ??
      (passengers != null && passengers >= 1 ? passengers : null);
    if (pax == null || suitcases == null) return;
    const partyKey = `${pax}:${suitcases}`;
    if (preferMinibusPartyKeyRef.current === partyKey) return;
    if (
      !enabledVehicleTypesForQuote({
        publicMinibusEnabled,
        publicExecutiveEnabled,
      }).includes(MINIBUS_VEHICLE_TYPE) ||
      !vehicleFitsParty(MINIBUS_VEHICLE_TYPE, pax, suitcases)
    ) {
      return;
    }
    preferMinibusPartyKeyRef.current = partyKey;
    setManualVehicle(MINIBUS_VEHICLE_TYPE);
    setChooseMinibus(true);
    setChooseExecutive(false);
    setChooseEstate(false);
    setVehicle(MINIBUS_VEHICLE_TYPE);
  }, [
    passengerLimit,
    passengers,
    preferMinibus,
    publicExecutiveEnabled,
    publicMinibusEnabled,
    suitcases,
  ]);
  const isA2AFlow = IS_A2A_PRIMARY;
  const isAirportTrip = !isA2AFlow && tripMode === "airport";
  const journeyKind: JourneyKind | null = useMemo(() => {
    if (!isA2AFlow) {
      return null;
    }
    return detectJourneyKind(pickupPlace, dropoffPlace);
  }, [isA2AFlow, pickupPlace, dropoffPlace]);

  useEffect(() => {
    if (presentation !== "homepage" || !isA2AFlow) return;
    const classified = classifyVerifiedJourney(pickupPlace, dropoffPlace);
    if (!classified) return;
    setJourneyIntent(classified.intent);
    setTripDirection(classified.direction);
    setIntentAirportCode(classified.airport);
    setAirportCode(classified.airport);
    setTripMode("address");
  }, [presentation, isA2AFlow, pickupPlace, dropoffPlace]);

  const pickupAirportCode = isA2AFlow ? detectAirportCodeFromPlace(pickupPlace) : null;
  const dropoffAirportCode = isA2AFlow ? detectAirportCodeFromPlace(dropoffPlace) : null;
  const isRoiJourney =
    isA2AFlow &&
    isPlaceSelected(pickupPlace) &&
    isPlaceSelected(dropoffPlace) &&
    isRepublicOfIrelandJourney(pickupPlace, dropoffPlace) &&
    !isDublinCityCorridorJourney(pickupPlace, dropoffPlace) &&
    !isBelfastAirportRoiInstantJourney(pickupPlace, dropoffPlace) &&
    !isGreaterBelfastIrelandInstantJourney(pickupPlace, dropoffPlace);
  const isDublinCityCorridor =
    isA2AFlow &&
    isPlaceSelected(pickupPlace) &&
    isPlaceSelected(dropoffPlace) &&
    isDublinCityCorridorJourney(pickupPlace, dropoffPlace);
  const isVehiclePersonalQuote =
    publicVehicleRequiresPersonalQuote(quoteVehicle, publicPricing) && !appliedPersonalQuote;
  const isManualQuoteJourney =
    isVehiclePersonalQuote ||
    (isA2AFlow &&
      isPlaceSelected(pickupPlace) &&
      isPlaceSelected(dropoffPlace) &&
      needsManualQuoteApproval(pickupPlace, dropoffPlace)) ||
    (isAirportTrip &&
      tripDirection === "from-airport" &&
      dropoffAddress.trim().length > 0 &&
      !destinationEligibleForStandardAirportPickup({
        airportCode,
        addressText: dropoffAddress,
      }));
  /** Owner gate in pricing-config.json — no live £ until rules are approved. */
  const pricingConfirmationRequired = !arePublicLivePricesEnabled();
  const priceConfirmationLabel = getPublicUnapprovedPriceLabel();
  /** Amber banner only when an out-of-area pickup still needs manual approval. */
  const isOutOfAreaPickupJourney =
    !isVehiclePersonalQuote && isManualQuoteJourney && isOutOfAreaPickup(pickupPlace);
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
   * Manual vehicle quote requests defer flight details until their approved booking.
   */
  const needsOutboundFlightNumber =
    !isVehiclePersonalQuote && ((isAirportTrip && isFromAirport) ||
    (isA2AFlow && Boolean(pickupAirportCode)) ||
    journeyKind === "airport-to-address" ||
    journeyKind === "airport-to-airport");
  /**
   * Return/collection flight: only when returning from an airport drop-off
   * (customer is collected at the airport on the return leg).
   */
  const needsReturnCollectionFlightNumber =
    !isVehiclePersonalQuote &&
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
  // Public quote is A2A-priced, but Places ranking follows the journey:
  // To/From BFS/BHD → Belfast bias, NI preferred, ROI still allowed.
  // DUB / Address-to-address → island-wide bias. England/Scotland/Wales stay blocked.
  const addressLookupCode =
    isA2AFlow && journeyIntent !== "address-to-address" && intentAirportCode
      ? intentAirportCode
      : isA2AFlow
        ? PLACES_LOOKUP_A2A
        : isAirportTrip
          ? airportCode
          : "BFS";

  useEffect(() => {
    if (exactPassengers != null) {
      setExactPassengers(null);
    }
  }, [exactPassengers]);

  useEffect(() => {
    if (passengers == null) return;
    if (passengers > passengerLimit || passengers < 1) {
      setPassengersError(PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE);
    } else {
      setPassengersError((current) =>
        current === PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE ? "" : current,
      );
    }
  }, [passengerLimit, passengers]);

  useEffect(() => {
    if (suitcases == null) return;
    if (suitcases > suitcaseLimit || suitcases < 0) {
      setSuitcasesError(PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE);
    } else {
      setSuitcasesError((current) =>
        current === PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE ? "" : current,
      );
    }
  }, [suitcaseLimit, suitcases]);

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

  const didApplyFreshVisitAddressPolicyRef = useRef(false);

  useEffect(() => {
    function applyNonAddressDraftFields(draft: BookingFormDraft) {
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
        const storedPassengers = readStoredPassengerCount(draft.passengers);
        if (storedPassengers != null) setPassengers(storedPassengers);
      }
      if (typeof draft.suitcases === "number" && draft.suitcases >= 0) {
        const storedSuitcases = readStoredSuitcaseCount(draft.suitcases);
        if (storedSuitcases != null) setSuitcases(storedSuitcases);
      }
      setChildSeats(normalizeChildSeats(draft.childSeats));
      setChildSeatNotes(draft.childSeatNotes?.trim() || "");
      setChildSeatNotesError("");
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
      if (
        draft.outboundAirportAccessChoice === "express" ||
        draft.outboundAirportAccessChoice === "free" ||
        draft.outboundAirportAccessChoice === "meet-greet" ||
        typeof draft.expressDropOffSelected === "boolean"
      ) {
        setOutboundAccessChoice("express");
      }
      if (
        draft.returnAirportAccessChoice === "express" ||
        draft.returnAirportAccessChoice === "free" ||
        draft.returnAirportAccessChoice === "meet-greet" ||
        typeof draft.returnExpressDropOffSelected === "boolean"
      ) {
        setReturnAccessChoice("express");
      }
      if (draft.personalQuoteCode?.trim()) {
        const code = draft.personalQuoteCode.trim().toUpperCase();
        // Re-validate from server — never trust a cached agreed amount from sessionStorage.
        void validatePersonalQuoteCode(code)
          .then((quote) => {
            setAppliedPersonalQuote(quote);
          })
          .catch(() => {
            setAppliedPersonalQuote(null);
          });
      }
    }

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
      setPassengers(readStoredPassengerCount(testBooking.passengers) ?? testBooking.passengers);
      setSuitcases(readStoredSuitcaseCount(testBooking.suitcases) ?? testBooking.suitcases);
      setExactPassengers(null);
      setVehicle(testBooking.vehicle);
      setGoingFlightNumber(testBooking.flightNumber);
      return;
    }

    if (didApplyFreshVisitAddressPolicyRef.current) {
      return;
    }
    didApplyFreshVisitAddressPolicyRef.current = true;

    const visitDecision = decideQuoteAddressReset({
      trigger: "fresh-load",
      pathname: window.location.pathname,
      search: window.location.search,
      returnOfferToken,
    });

    const draft = readBookingFormDraft();

    if (visitDecision.clearStoredAddresses) {
      // Never rehydrate pickup/destination from localStorage or an old session draft.
      clearStoredQuoteAddresses();
    }

    if (draft) {
      applyNonAddressDraftFields(draft);
    }

    const existingCheckout = readOpenCheckoutSession();
    if (existingCheckout) {
      setOpenCheckout(existingCheckout);
    }
  }, [returnOfferToken]);

  useEffect(() => {
    function blankQuoteAddressesAfterBrowserRestore() {
      setPickupAddress("");
      setDropoffAddress("");
      setPickupPlace(emptySelectedPlace());
      setDropoffPlace(emptySelectedPlace());
      setPickupRestoredHint(false);
      setDropoffRestoredHint(false);
      setPickupPlaceError("");
      setDropoffPlaceError("");
      setRouteMetrics(null);
      setServerFareParts(null);
      setRouteReconfirmationRequired(false);
      setPaymentError("");
      setQuoteStep(1);
      setFormResetKey((key) => key + 1);
    }

    function onPageShow(event: PageTransitionEvent) {
      if (readTestBookingPrefill()) {
        return;
      }
      const decision = decideQuoteAddressResetFromPageShow({
        persisted: event.persisted,
        pathname: window.location.pathname,
        search: window.location.search,
        returnOfferToken,
      });
      if (decision.clearStoredAddresses) {
        clearStoredQuoteAddresses();
      }
      if (decision.blankVisibleAddressFields) {
        blankQuoteAddressesAfterBrowserRestore();
      }
    }

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [returnOfferToken]);

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
        const storedPassengers = readStoredPassengerCount(draft.passengers);
        if (storedPassengers != null) setPassengers(storedPassengers);
      }
      if (typeof draft.suitcases === "number" && draft.suitcases >= 0) {
        const storedSuitcases = readStoredSuitcaseCount(draft.suitcases);
        if (storedSuitcases != null) setSuitcases(storedSuitcases);
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

    if (!retu…53307 tokens truncated…ber}
        suitcases={suitcases as number}
        priceLabel={effectiveAirportCode ? "Your fixed airport transfer price" : "Your fixed transfer price"}
        formattedPrice={authoritativeQuoteFailed ? "Calculating…" : amountLabel}
        priceUpdating={priceUpdating}
        businessClassInclusions={renderBusinessClassInclusions()}
        priceUnavailable={authoritativeQuoteFailed}
        onRetryPrice={() => {
          void refreshAuthoritativeServerQuote(true);
        }}
        airportAccess={layoutAirportAccess}
        layoutBusinessClassInclusions={layoutBusinessClassInclusions}
        bookButton={renderStep1BookButton({ instantTransferLabel: true })}
      />
    );
  }

  function quoteJourneyEndpoints(): { origin: QuoteMapPoint; destination: QuoteMapPoint } | null {
    const placePoint = (place: { lat: number | null; lng: number | null }, label: string) => {
      if (typeof place.lat !== "number" || typeof place.lng !== "number") return null;
      return { lat: place.lat, lng: place.lng, label };
    };
    const airport = AIRPORTS.find((item) => item.code === airportCode) ?? null;
    if (!isA2AFlow && isAirportTrip && airport) {
      const airportPoint = {
        lat: airport.mapLocation.lat,
        lng: airport.mapLocation.lng,
        label: airport.name,
      };
      if (isFromAirport) {
        const destination = placePoint(dropoffPlace, dropoffAddress.trim() || "Drop-off");
        return destination ? { origin: airportPoint, destination } : null;
      }
      const origin = placePoint(pickupPlace, pickupAddress.trim() || "Pickup");
      return origin ? { origin, destination: airportPoint } : null;
    }
    const origin = placePoint(pickupPlace, pickupAddress.trim() || "Pickup");
    const destination = placePoint(dropoffPlace, dropoffAddress.trim() || "Drop-off");
    return origin && destination ? { origin, destination } : null;
  }

  function quoteDirectionsHref(): string | null {
    const airportLabel = AIRPORTS.find((item) => item.code === airportCode)?.mapLabel ?? "";
    let origin = pickupAddress.trim();
    let destination = dropoffAddress.trim();
    if (!isA2AFlow && isAirportTrip) {
      if (isFromAirport) {
        origin = airportLabel;
        destination = dropoffAddress.trim();
      } else {
        origin = pickupAddress.trim();
        destination = airportLabel;
      }
    }
    if (origin.length < 8 || destination.length < 8) return null;
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  }

  function renderQuoteActionPopup() {
    if (!quoteActionOpen) return null;
    const journey = quoteJourneyEndpoints();
    const restarting = quoteActionOpen === "restart";
    return (
      <QuoteActionDialog
        title={quoteActionOpen === "route" ? "View route" : restarting ? "Need a quote for a different journey?" : "WhatsApp"}
        role={restarting ? "alertdialog" : "dialog"}
        wide={quoteActionOpen === "route"}
        onClose={() => setQuoteActionOpen(null)}>
        {quoteActionOpen === "route" ? (
          <QuoteJourneyMap origin={journey?.origin ?? null} destination={journey?.destination ?? null}
            durationLabel={routeMetrics ? formatRouteCardJourneyTime(routeMetrics.durationMinutes) : ""}
            fallbackHref={quoteDirectionsHref()} />
        ) : restarting ? (
          <div data-start-new-quote-confirm>
            <p className="quote-secondary text-sm leading-relaxed">This will clear your current journey details and start a new quote. Continue?</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button type="button" onClick={() => setQuoteActionOpen(null)} className="rounded-xl border border-white/25 px-4 py-3 text-sm font-semibold text-white">Keep Current Quote</button>
              <button type="button" onClick={performStartNewQuote} className="rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy">Start New Quote</button>
            </div>
          </div>
        ) : <QuoteHelpContact variant="card" />}
      </QuoteActionDialog>
    );
  }

  function renderQuoteResultFollowOn(routeMap: ReactNode) {
    const mapsHref = quoteDirectionsHref();
    return (
      <>
        {routeMap}
        <div
          id="quote-book-now-anchor"
          className="h-px w-full scroll-mt-44 md:scroll-mt-28"
          aria-hidden="true"
        />
        <div
          id="quote-step1-next"
          className="scroll-mt-24 space-y-1.5 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
          data-quote-result-actions
        >
          <div className="grid grid-cols-4 gap-1.5 max-[340px]:grid-cols-2">
            {mapsHref ? (
              <button
                type="button"
                data-quote-view-route
                aria-haspopup="dialog"
                onClick={() => setQuoteActionOpen("route")}
                className={QUOTE_RESULT_ACTION_CLASS}
              >
                <QuoteResultActionIcon name="route" />
                <span>View route</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleSaveQuoteClick}
              data-quote-save
              aria-haspopup="dialog"
              disabled={isVehiclePersonalQuote}
              title={isVehiclePersonalQuote ? "Available once your personalised price is confirmed." : undefined}
              className={`${QUOTE_RESULT_ACTION_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <QuoteResultActionIcon name="save" />
              <span>Save Quote</span>
            </button>
            {startNewQuotePlacement === "results" ? (
              <button type="button" onClick={() => setQuoteActionOpen("restart")}
                aria-haspopup="dialog" className={QUOTE_RESULT_ACTION_CLASS}>
                <QuoteResultActionIcon name="restart" /><span>Start over</span>
              </button>
            ) : null}
            <button type="button" onClick={() => setQuoteActionOpen("whatsapp")}
              aria-haspopup="dialog" aria-label="Need help? WhatsApp us"
              className={`${QUOTE_RESULT_ACTION_CLASS} desktop-result-whatsapp`}>
              <QuoteResultActionIcon name="whatsapp" className="h-[1.15rem] w-[1.15rem] text-[#25D366]" />
              <span>WhatsApp</span>
            </button>
            <DesktopQuoteEnquiry className={QUOTE_RESULT_ACTION_CLASS} journey={[
              `Journey: ${pickupAddress.trim()} → ${dropoffAddress.trim()}`,
              `Vehicle: ${vehicleShortLabel(quoteVehicle)}`,
              `Party: ${effectivePassengers ?? "Not selected"} passengers · ${suitcases ?? "Not selected"} suitcases`,
              `Journey type: ${returnJourney ? "Return (5% journey-fare discount where applicable)" : "One way"}`,
              `Quoted fare: ${isVehiclePersonalQuote ? "On request" : authoritativeFareReady && pricedFare ? formatQuote(pricedFare.totalGbp) : "Awaiting confirmed quote"}`,
              tripDate || tripTime ? `Pickup date/time: ${tripDate || "Not set"} ${tripTime || "Not set"}` : "Pickup date/time: added at booking stage; not yet booked.",
              ...(returnJourney ? [`Return date/time: ${returnDate || "Not set"} ${returnTime || "Not set"}`] : []),
            ].join("\n")} />
          </div>
          {renderBookingErrorHelp("step1-actions")}
          {saveQuotePrompt ? (
            <p className="text-center text-xs text-emerald/90" role="status">
              {saveQuotePrompt}
            </p>
          ) : null}
        </div>
        {presentation === "homepage" && returnJourney && openWebsiteFareBreakdown && !isVehiclePersonalQuote ? (
          <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 md:hidden" data-homepage-return-breakdown>
            <PromotionalPriceBreakdown alwaysShow breakdown={openWebsiteFareBreakdown}
              service={expressSelection.service ?? "drop-off"}
              freeAirportAccessSelected={expressSelection.eligible && expressSelection.feeGbp === 0} />
          </div>
        ) : null}
        {isVehiclePersonalQuote ? null : renderPriceBreakdownCollapsible()}
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
        data-quote-presentation={presentation}
        className="quote-flow glass-card min-w-0 scroll-mt-44 rounded-2xl p-6 sm:p-8"
      >
        <ShortNoticeRequestReceived
          reference={shortNoticeResult.reference}
          amountLabel={shortNoticeResult.amountLabel}
          whatsappUrl={shortNoticeResult.whatsappUrl}
          underMinimumNotice={shortNoticeResult.underMinimumNotice !== false}
          noticeHours={
            shortNoticeResult.minibusNotice
              ? shortNoticeResult.noticeHours ?? minibusMinimumBookingNoticeHours
              : shortNoticeResult.noticeHours ?? minimumBookingNoticeHours
          }
          luggageCapacity={shortNoticeResult.luggageCapacity === true}
          minibusNotice={shortNoticeResult.minibusNotice === true}
        />
        <button
          type="button"
          onClick={() => {
            performStartNewQuote();
          }}
          className="mt-4 block w-full text-sm quote-secondary underline-offset-2 hover:underline sm:mx-auto sm:w-auto"
        >
          Start a New Quote
        </button>
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
        data-quote-presentation={presentation}
        className="quote-flow glass-card min-w-0 scroll-mt-44 rounded-2xl p-6 sm:p-8 md:scroll-mt-28"
      >
        <div className="rounded-xl quote-panel px-5 py-8 text-center sm:px-8 sm:py-10">
          <p
            data-booking-nav-heading
            tabIndex={-1}
            className="text-xs font-medium uppercase tracking-wider text-emerald outline-none"
          >
            {UNPAID_REQUEST_RECEIVED_HEADING}
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
            {UNPAID_REQUEST_RECEIVED_BODY}
          </p>
          {bookingReference ? (
            <p className="mt-4 text-sm quote-secondary">
              Request reference: {bookingReference}
            </p>
          ) : null}
          {bookingDelivery === "whatsapp" && (
            <p className="mx-auto mt-4 max-w-md text-sm quote-secondary">
              Your request message should open in WhatsApp. If it didn&apos;t, open WhatsApp and
              message @{SITE.whatsappUsername}.
            </p>
          )}
          {bookingDelivery === "email" && (
            <p className="mx-auto mt-4 max-w-md text-sm quote-secondary">
              We&apos;ve emailed your request. We&apos;ll reply at {customerEmail.trim()}.
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
    <div
      ref={cardRef}
      data-quote-presentation={presentation}
      data-quote-results={quoteResultsReady && quoteStep === 1 ? "ready" : undefined}
      className={
        presentation === "homepage"
          ? "quote-flow glass-card min-w-0 rounded-[1.1rem] px-3 py-2.5 sm:rounded-[1.35rem] sm:p-7 lg:p-6 xl:p-7"
          : "quote-flow glass-card min-w-0 rounded-[1.05rem] p-4 sm:p-7 lg:p-6 xl:p-7"
      }
    >
      <div
        className={
          quoteStep >= 2
            ? "mb-2"
            : presentation === "homepage"
              ? "mb-1 sm:mb-5 lg:mb-5"
              : "mb-4 sm:mb-5 lg:mb-5"
        }
      >
        <h2
          data-site-nav-heading="quote"
          tabIndex={-1}
          className={`${
            quoteStep >= 2
              ? "text-[1.05rem] font-semibold uppercase tracking-[0.14em] text-white outline-none sm:text-lg"
              : presentation === "homepage"
                ? "font-display text-[1.2rem] font-semibold leading-tight tracking-tight text-white outline-none sm:text-[1.85rem] lg:text-[1.75rem]"
              : "font-display text-[1.35rem] font-semibold leading-tight tracking-tight text-white outline-none sm:text-[1.85rem] lg:text-[1.75rem]"
          }`}
        >
          {quoteStep >= 2
            ? "COMPLETE YOUR BOOKING"
            : presentation === "homepage"
              ? "Get Your Fixed Quote"
              : "Get Your Fixed Quote"}
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
        <div
          className={
            quoteStep >= 2
              ? "mt-1 text-sm leading-snug quote-secondary"
              : `${presentation === "homepage" ? "mt-0.5" : "mt-1"} text-sm leading-snug quote-secondary sm:mt-2.5 sm:leading-relaxed lg:text-[0.9rem] lg:leading-relaxed`
          }
        >
          {quoteStep >= 2 ? (
            <p>Add your pickup details to confirm your transfer.</p>
          ) : presentation === "homepage" ? (
            <p>{bookingIntroduction}</p>
          ) : (
            <>
          {/* Mobile: compact — frees space for journey choices above the fold */}
          <p className="md:hidden text-[0.875rem] text-white/68">
            Get your fixed price in three quick steps.
          </p>
          {/* Desktop: fuller explanation */}
          <p className="hidden md:block">
            {pricingConfirmationRequired
              ? "Three quick steps — Journey details, Your quote, then Complete your booking. We’ll confirm your fare before any payment."
              : "Three quick steps — Journey details, Your quote, then Complete your booking. Instant fares can be paid online by card to confirm; otherwise Request to book and we’ll email a SumUp link after we confirm."}
          </p>
            </>
          )}
        </div>
        {quoteStep < 2 ? (
        <ol
          className={`${presentation === "homepage" && quoteStep === 1 ? "hidden" : ""} ${presentation === "homepage" ? "mt-2" : "mt-3"} grid grid-cols-3 gap-1.5 sm:mt-4 sm:gap-2`}
          aria-label="Booking steps"
        >
          {(
            [
              { step: 1 as const, label: "Journey details" },
              { step: 2 as const, label: "Your quote" },
              { step: 3 as const, label: "Complete your booking" },
            ]
          ).map((item) => {
            const active = quoteProgressStep === item.step;
            const done = quoteProgressStep > item.step;
            return (
              <li
                key={item.step}
                aria-current={active ? "step" : undefined}
                className={`quote-step ${
                  active ? "quote-step-active" : done ? "quote-step-done" : ""
                }`}
              >
                <span className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] sm:tracking-wider">
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
        ) : null}
        {quoteStep >= 2 ? renderBackToQuoteButton("top") : null}
      </div>

      <form
        id="quoteForm"
        onSubmit={handleSubmit}
        className={
          quoteStep >= 2
            ? "relative space-y-3 overflow-x-clip overflow-y-visible"
            : presentation === "homepage"
              ? "relative space-y-2.5 overflow-visible sm:space-y-4 lg:space-y-3.5"
              : "relative space-y-3 overflow-x-clip overflow-y-visible sm:space-y-4 lg:space-y-3.5"
        }
      >
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
          className={
            presentation === "homepage"
              ? "scroll-mt-44 space-y-0 sm:space-y-4 md:scroll-mt-28"
              : "scroll-mt-44 space-y-3 sm:space-y-4 md:scroll-mt-28"
          }
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
            {presentation === "homepage" ? (
              <HomepageQuoteFields
                formResetKey={formResetKey}
                journeyMode={journeyMode === "return" ? "return" : "one-way"}
                onJourneyModeChange={(value) => {
                  if (returnOfferToken) return;
                  markQuoteFunnelStarted();
                  setJourneyMode(value);
                  if (value === "one-way") setReturnDateError("");
                  setHomepagePriceRequested(false);
                }}
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
                onClearPickup={() => {
                  handlePickupChange("");
                }}
                onClearDropoff={() => {
                  handleDropoffChange("");
                }}
                addressLookupCode={addressLookupCode}
                onSwap={swapHomepageLocations}
                passengers={passengers}
                suitcases={suitcases}
                onPassengersChange={(value) => {
                  markQuoteFunnelStarted();
                  setPassengers(value);
                  setHomepageCapacityConfirmed(false);
                  setPassengersError("");
                  setHomepagePriceRequested(false);
                }}
                onSuitcasesChange={(value) => {
                  markQuoteFunnelStarted();
                  setSuitcases(value);
                  setHomepageCapacityConfirmed(false);
                  setSuitcasesError("");
                  setHomepagePriceRequested(false);
                }}
                passengersError={passengersError}
                suitcasesError={suitcasesError}
                publicMinibusEnabled={publicMinibusEnabled}
                onRequestPrice={requestHomepagePrice}
                quoteReady={homepageQuoteReady}
                scheduleFields={renderQuoteScheduleFields("quote")}
                scheduleComplete={isScheduleComplete}
                scheduleDate={formatUkDate(tripDate)}
                scheduleTime={formatUkTime(tripTime)}
                onConfirmSchedule={confirmHomepageSchedule}
                capacityConfirmed={homepageCapacityConfirmed}
                onCapacityConfirmedChange={setHomepageCapacityConfirmed}
                quoteFormActive={!homepagePriceRequested}
              />
            ) : (
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
              publicMinibusEnabled={publicMinibusEnabled}
              publicExecutiveEnabled={publicExecutiveEnabled}
              showVehicleCategories={!(quoteResultsReady && quoteStep === 1)}
              selectedVehicle={quoteVehicle}
              onSelectVehicle={handleQuoteVehicleChoice}
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
              showScheduleFields={
                journeyMode != null &&
                (journeyIntent === "address-to-address"
                  ? isPlaceSelected(pickupPlace) && isPlaceSelected(dropoffPlace)
                  : journeyIntent === "to-airport"
                    ? Boolean(intentAirportCode) && isPlaceSelected(pickupPlace)
                    : journeyIntent === "from-airport"
                      ? Boolean(intentAirportCode) && isPlaceSelected(dropoffPlace)
                      : false)
              }
              scheduleFields={renderQuoteScheduleFields("quote")}
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
              presentation={presentation}
            />
            )}
            {presentation !== "homepage" && journeyMode != null && quoteStep === 1 && !quoteResultsReady ? (
              <p
                id="quote-price-wait"
                className="rounded-xl quote-panel px-4 py-3 text-sm text-white"
                role="status"
                data-quote-price-wait
              >
                {!scheduleEntered
                  ? QUOTE_PRICE_WAIT_FOR_SCHEDULE
                  : authoritativeQuoteFailed
                    ? AUTHORITATIVE_QUOTE_UNAVAILABLE_MESSAGE
                    : canShowPrice && instantPriceExpected && !mayPaintNumericFare
                    ? "Calculating your transfer price…"
                    : canShowPrice && !liveQuote
                      ? "Calculating your fixed price…"
                      : QUOTE_PRICE_WAIT_FOR_DETAILS}
              </p>
            ) : null}

            {presentation === "homepage" &&
            !(isIncompletePickupAddress || isOutOfAreaPickupJourney || isRoiJourney) ? null : (
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
                  <div className="rounded-xl quote-panel px-4 py-3 text-sm text-white">
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
            )}

            {presentation === "homepage" && !(isLdyTrip && ldyServiceAreaInvalid) ? null : (
            <p className="min-h-[1.1rem] text-xs text-red-300">
              {isLdyTrip && ldyServiceAreaInvalid
                ? "City of Derry Airport transfers are between LDY and the greater Belfast area only."
                : "\u00a0"}
            </p>
            )}

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
                    ? "scroll-mt-44 space-y-1.5 outline-none md:scroll-mt-28"
                    : undefined
                }
                style={
                  quoteChoicesReady && hasQuoteRoute && quoteStep === 1
                    ? { overflowAnchor: "none" }
                    : undefined
                }
              >
                {quoteResultsReady && quoteStep === 1 && (
                  <>
                    <h2 className="sr-only">Step 2 — Your quote</h2>
                    <div
                      ref={quoteResultsStartRef}
                      id="quote-results-start"
                      data-quote-results-start
                      className="h-px w-full"
                      aria-hidden="true"
                    />
                    {presentation === "homepage" ? (
                      <div
                        className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
                        data-homepage-journey-summary
                      >
                        <p className="font-semibold leading-snug">
                          {pickupLabel || "Pickup"} → {dropoffLabel || "Drop-off"}
                        </p>
                        {returnJourney ? (
                          <p className="mt-1 text-xs font-medium text-emerald">
                            Return journey reverses this route. The 5% return booking discount is included.
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-white/70">
                            {journeyKind ? journeyKindLabel(journeyKind) : "One way"}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-white/75">
                          {effectivePassengers ?? passengers} passenger
                          {(effectivePassengers ?? passengers) === 1 ? "" : "s"}
                          {" · "}
                          {suitcases != null && suitcases >= 5
                            ? "5+ suitcases"
                            : `${suitcases ?? 0} suitcase${suitcases === 1 ? "" : "s"}`}
                        </p>
                      </div>
                    ) : null}
                    {renderQuoteVehicleChoice()}
                    {presentation === "homepage" && returnJourney && openWebsiteFareBreakdown ? (
                      <div className="hidden rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 md:block" data-homepage-return-breakdown-desktop>
                        <PromotionalPriceBreakdown
                          alwaysShow
                          breakdown={openWebsiteFareBreakdown}
                          service={expressSelection.service ?? "drop-off"}
                          freeAirportAccessSelected={
                            expressSelection.eligible && expressSelection.feeGbp === 0
                          }
                        />
                      </div>
                    ) : null}
                    {renderBookingErrorHelp("results")}
                    {showInstantQuoteResultCard || isVehiclePersonalQuote ? (
                      <>
                        {renderInstantQuoteResultCard()}
                        {isVehiclePersonalQuote ? (
                          <div className="hidden md:block">{renderStartNewQuoteControls("results")}</div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {!exceedsOnlineCapacity && (
                          <div className="rounded-xl quote-panel px-3 py-3 sm:px-4 sm:py-3.5">
                            <p className="form-label mb-0">
                              Choose your vehicle
                            </p>
                            <p className="mt-1.5 font-display text-xl font-semibold tracking-tight text-white sm:text-[1.35rem]">
                              {vehicleShortLabel(quoteVehicle)}
                            </p>
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
                      </>
                    )}
                  </>
                )}
                {/*
                  One map instance for this address pair. It stays mounted when
                  the result card appears so the route is not requested again.
                */}
                <div
                  key="quote-route-map"
                  className={
                    (quoteResultsReady && quoteStep === 1) ||
                    (presentation !== "homepage" &&
                      quoteChoicesReady &&
                      hasQuoteRoute &&
                      quoteStep === 1)
                      ? undefined
                      : "sr-only"
                  }
                  aria-hidden={
                    !(
                      (quoteResultsReady && quoteStep === 1) ||
                      (presentation !== "homepage" &&
                        quoteChoicesReady &&
                        hasQuoteRoute &&
                        quoteStep === 1)
                    )
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
                    variant={showInstantQuoteResultCard || isVehiclePersonalQuote ? "metrics" : "summary"}
                  />
                </div>
                {quoteResultsReady && quoteStep === 1 ? (
                  showInstantQuoteResultCard ? renderQuoteResultFollowOn(null) :
                  isVehiclePersonalQuote ? <div className="space-y-1.5 md:hidden">{renderQuoteResultFollowOn(null)}</div> : null
                ) : null}
              </div>
            )}
            <div hidden>
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
            </div>
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
            className={`grid grid-cols-2 gap-2 ${choiceGroupNeedsClass(journeyMode == null)}`}
          >
            <button
              type="button"
              aria-pressed={journeyMode === "one-way"}
              onClick={() => {
                setJourneyMode("one-way");
                setReturnDateError("");
              }}
              className={`min-h-[52px] w-full rounded-xl px-3 py-3 text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald ${
                journeyMode === "one-way" ? QUOTE_CHOICE_ON : QUOTE_CHOICE_OFF
              }`}
            >
              One way
            </button>
            <button
              type="button"
              aria-pressed={journeyMode === "return"}
              onClick={() => setJourneyMode("return")}
              className={`min-h-[52px] w-full rounded-xl px-3 py-3 text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald ${
                journeyMode === "return" ? QUOTE_CHOICE_ON : QUOTE_CHOICE_OFF
              }`}
            >
              Return · 5% off
            </button>
          </div>
          {journeyMode == null && (
            <p
              id="quote-journey-mode-prompt"
              className="mt-3 rounded-xl quote-panel px-4 py-3 text-sm text-white"
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
                <div className="mb-2 rounded-xl quote-panel px-4 py-3 text-sm text-white">
                  Transfers between City of Derry Airport and the greater Belfast area only.
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-xl quote-panel p-1">
                  <button
                    type="button"
                    aria-pressed={tripDirection === "to-airport"}
                    onClick={() => setTripDirection("to-airport")}
                    className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                      tripDirection === "to-airport" ? QUOTE_CHOICE_ON : QUOTE_CHOICE_OFF
                    }`}
                  >
                    To Derry Airport
                  </button>
                  <button
                    type="button"
                    aria-pressed={tripDirection === "from-airport"}
                    onClick={() => setTripDirection("from-airport")}
                    className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                      tripDirection === "from-airport" ? QUOTE_CHOICE_ON : QUOTE_CHOICE_OFF
                    }`}
                  >
                    From Derry Airport
                  </button>
                </div>
              </>
            ) : (
            <div className="grid grid-cols-2 gap-2 rounded-xl quote-panel p-1">
              <button
                type="button"
                aria-pressed={tripDirection === "to-airport"}
                onClick={() => applyJourneyIntent("to-airport")}
                className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                  tripDirection === "to-airport" ? QUOTE_CHOICE_ON : QUOTE_CHOICE_OFF
                }`}
              >
                To airport
              </button>
              <button
                type="button"
                aria-pressed={tripDirection === "from-airport"}
                onClick={() => applyJourneyIntent("from-airport")}
                className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                  tripDirection === "from-airport" ? QUOTE_CHOICE_ON : QUOTE_CHOICE_OFF
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
              className="quote-text-input box-border h-12 w-full min-w-0 rounded-xl border border-white/30 bg-navy-light px-4 text-base text-white outline-none transition-colors focus:border-emerald/70 focus:ring-1 focus:ring-emerald/35"
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
          className="space-y-4 rounded-xl quote-panel px-4 py-4 lg:space-y-3.5 lg:px-4 lg:py-3.5"
        >
          <div className="grid items-stretch gap-4 lg:grid-cols-2 lg:items-stretch lg:gap-3.5">
            <TapChoiceRow
              label="Passengers"
              hint="Include all children in the passenger total."
              options={publicPassengerOptions(publicMinibusEnabled)}
              value={
                passengers != null && passengers <= passengerLimit && passengers >= 1
                  ? passengers
                  : null
              }
              onChange={(value) => {
                setPassengers(value);
                setPassengersError("");
              }}
              formatOption={formatPassengerChoice}
              needsCompletion={quoteStep === 1 && passengers == null}
            />
            <TapChoiceRow
              label="Suitcases"
              options={publicSuitcaseOptions(publicMinibusEnabled)}
              value={
                suitcases != null && suitcases <= suitcaseLimit && suitcases >= 0
                  ? suitcases
                  : null
              }
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
              className="rounded-xl quote-panel px-4 py-3 text-sm text-white"
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
          {publicMinibusEnabled && partySelectionReady && !(quoteResultsReady && quoteStep === 1) ? (
            renderQuoteVehicleChoice()
          ) : publicMinibusEnabled && partySelectionReady ? null : (
            <p className="quote-secondary text-xs leading-relaxed">
              Up to 4 passengers. Saloon or Estate is chosen automatically from your party size and
              luggage — cars for up to 4 passengers or a 7 Seater Minibus when available.
            </p>
          )}
        </div>
        )}

        {!isA2AFlow && quoteResultsReady && quoteStep === 1 && (
          <div
            id="quote-results-summary"
            className="scroll-mt-44 space-y-1.5 outline-none md:scroll-mt-28"
            style={{ overflowAnchor: "none" }}
          >
            <h2 className="sr-only">Step 2 — Your quote</h2>
            <div
              ref={quoteResultsStartRef}
              id="quote-results-start"
              data-quote-results-start
              className="h-px w-full"
              aria-hidden="true"
            />
            {renderQuoteVehicleChoice()}
            {renderBookingErrorHelp("results")}
            {showInstantQuoteResultCard ? (
              <>
                {renderInstantQuoteResultCard()}
                {renderQuoteResultFollowOn(
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
                    variant="metrics"
                  />,
                )}
              </>
            ) : (
              <>
                {!exceedsOnlineCapacity && (
                  <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-3 py-2.5 sm:px-4 sm:py-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                      Vehicle for this journey
                    </p>
                    <p className="mt-1 text-lg font-semibold tracking-tight text-white sm:text-xl">
                      {vehicleShortLabel(quoteVehicle)}
                    </p>
                  </div>
                )}
                <div
                  id="quote-price-summary"
                  className="quote-price-panel"
                >
                  {renderQuotePriceSummaryBody()}
                </div>
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
        </div>
          </>
        ) : null}

        {quoteStep >= 2 ? renderCheckoutPage() : null}
      </form>
      {renderQuoteActionPopup()}
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
