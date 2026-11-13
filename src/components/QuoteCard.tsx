"use client";

import { overnightTooSoonBody } from "../../shared/owner-quiet-hours";
import CallUsButton from "@/components/CallUsButton";
import PaymentMethodLogos from "@/components/PaymentMethodLogos";
import { isOnSitePaymentUrl } from "@/lib/stripe-pay";
import { emailTypoSuggestion } from "../../shared/email-typo";
import { hasUncertainPayment, PAYMENT_UNCERTAIN_MESSAGE, PaymentOutcomeUncertainError } from "@/lib/payment-attempt-guard";
import { saveQuote, type SaveQuoteResult } from "@/lib/saved-quote-api";

import { formatMeetGreetGbp, meetGreetFeeGbp, normaliseMeetGreetAirport } from "../../shared/meet-greet";
import { airportVisitKey, listTerminalAccessVisits, type TerminalAccessChoices } from "../../shared/meet-greet";
import TerminalAccessOptions from "@/components/TerminalAccessOptions";


import { FormEvent, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type FocusEvent as ReactFocusEvent } from "react";
import { flushSync } from "react-dom";
import AddressInput from "@/components/AddressInput";
import HomepageQuoteFields from "@/components/HomepageQuoteFields";
import QuoteProgressiveRoute from "@/components/QuoteProgressiveRoute";
import QuoteScheduleFields from "@/components/QuoteScheduleFields";
import {
  hasEnteredQuoteSchedule,
  QUOTE_PRICE_WAIT_FOR_DETAILS,
  QUOTE_PRICE_WAIT_FOR_SCHEDULE,
} from "../../shared/quote-display-gate";
import BookingTermsConsent from "@/components/BookingTermsConsent";
import MarketingOptIn from "@/components/MarketingOptIn";
import { HEARD_ABOUT_OPTIONS } from "../../shared/heard-about";
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
  nightWeekendSurchargeLabel,
  nightWeekendSurchargeExplanation,
  publicVehicleRequiresPersonalQuote,
  publicMaxPassengers,
  publicMaxSuitcases,
  type PublicOwnerPricingConfig,
} from "../../shared/owner-pricing-config";
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from "../../shared/owner-pricing-config";
import { fetchPublicPricingConfig } from "@/lib/owner-pricing-api";
import { isBrowserPricingPreview, previewMinibusQueryEnabled, previewMinibusRequestQuoteEnabled } from "@/lib/pricing-preview-store";
import { postcodeFareHasPence } from "../../shared/postcode-pricing";
import { readPreviewCustomerQuoteSeed } from "@/lib/preview-customer-quote";
import { parseLondonLocalDateTime } from "@/lib/london-time";
import { formatBookingDate, formatUkDate, formatUkTime, todayLondonDate, nowLondonTime } from "@/lib/format-datetime";
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
  type RebookPlace,
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
  DEPOSIT_CASH_BADGE,
  DEPOSIT_CASH_CHOOSE_HEADING,
  DEPOSIT_CASH_OPTION_LABEL,
  FULL_ONLINE_OPTION_LABEL,
  cashAgreementLabel,
  depositPayButtonLabel,
  formatDepositCashGbp,
  fullPayButtonLabel,
  nothingToPayOnTheDayLabel,
  todayPayLabel,
  publicDepositCashOffer,
  type DepositCashSettings,
  type PaymentMethod,
} from "../../shared/deposit-cash";
import {
  CARD_BALANCE_AGREEMENT_REQUIRED_MESSAGE,
  CARD_BALANCE_BADGE,
  CARD_BALANCE_OPTION_LABEL,
  PAYMENT_METHOD_DEPOSIT_CARD_BALANCE,
  calculateCardBalanceQuote,
  cardBalanceShortNote,
  cardBalanceDueDateLabel,
  cardBalanceOptionSubline,
  cardBalancePayButtonLabel,
  cardBalanceQuoteScreenNote,
  isCardBalanceDateEligible,
} from "../../shared/deposit-card-balance";
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
import { DEFAULT_SAVE_QUOTE_SETTINGS, normalizeSaveQuoteSettings } from "../../shared/save-quote-settings";
import type { SavedQuotePublicSummary } from "../../shared/saved-quote";
import { resolveWorkerBaseUrl as savedQuoteWorkerBaseUrl } from "@/lib/worker-api";
import SaveQuoteModal from "@/components/SaveQuoteModal";

import QuoteAirportBenefits from "@/components/QuoteAirportBenefits";
import GoogleReviewsBadge from "@/components/GoogleReviewsBadge";
import QuoteResultShowcase, {
  preloadQuoteResultVehicleImages,
} from "@/components/QuoteResultShowcase";
import QuoteVehicleCategories from "@/components/QuoteVehicleCategories";
import { useMobileDesign2 } from "@/lib/use-mobile-design2";
import { useMobileDesign3 } from "@/lib/use-mobile-design3";
import QuoteCheckoutSummary from "@/components/QuoteCheckoutSummary";
import {
  BookWithConfidence,
  FixedPriceAssurance,
  PromotionalPriceBreakdown,
  buildOpenWebsiteFareBreakdown,
} from "@/components/QuoteFareTrust";
import ShortNoticeRequestReceived from "@/components/ShortNoticeRequestReceived";
import { customerFacingFareBreakdown } from "../../shared/website-fare-breakdown";
import { PREVIEW_PAYMENTS_DISABLED_MESSAGE, previewPaymentsDisabled } from "@/lib/preview-payments";
import { PREVIEW_NOTIFICATIONS_DISABLED_MESSAGE, previewNotificationsDisabled } from "@/lib/preview-notifications";
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
  isBelowMinimumShortNoticeLead,
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
import { universalDrivingMilesFromKm } from "../../shared/universal-distance-pricing";
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
  readReplacedCheckoutId,
  readBookingFormDraft,
  readOpenCheckoutSession,
  saveBookingFormDraft,
  saveOpenCheckoutSession,
  type BookingFormDraft,
  type OpenCheckoutSession,
  buildOpenCheckoutJourneyKey,
  openCheckoutForJourney,
  markPaymentHandoff,
  consumePaymentHandoff,
  hasPaymentHandoff,
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
import { recordBookingStage, scheduleQuoteContactAlert, scheduleQuoteLeadAlert } from "@/lib/submit-quote-lead";
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
  INCOMPLETE_DROPOFF_ADDRESS_MESSAGE,
  INCOMPLETE_PICKUP_ADDRESS_MESSAGE,
  TOWN_GUIDE_PICKUP_MESSAGE,
  isTownGuidePlace,
  townGuidePlace,
  type TownGuidePickup,
  isPlaceSelected,
  isBelfastAirportRoiInstantJourney,
  isRepublicOfIrelandJourney,
  isGreaterBelfastIrelandInstantJourney,
  journeyKindLabel,
  needsManualQuoteApproval,
  PLACES_LOOKUP_A2A,
  quickSelectToPlace,
  selectedPlaceFromParts,
  type JourneyKind,
  type QuickSelectAirportCode,
  type SelectedPlace,
} from "@/lib/selected-place";
import { fetchSelectedPlaceDetails } from "@/lib/google-maps";
import { readCachedCustomerProfile } from "@/lib/customer-account-api";
import { setWhatsAppJourney, whatsAppSendQuoteHref } from "@/lib/whatsapp-journey-context";

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
  "Bottled water",
  "Phone charging",
  "Terminal access included",
] as const;

const BUSINESS_CLASS_DROPOFF_INCLUSIONS = [
  "Luggage assistance",
  "Bottled water",
  "Phone charging",
  "Terminal access included",
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

function formatD3ChipDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
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
  restoredQuote?: SavedQuotePublicSummary;
  homepagePolish?: boolean;
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
   * Town pages only: town-centre pickup that is pre-confirmed so a guide price
   * shows without the customer re-selecting the town. It can never be booked —
   * the customer must replace it with their full address first.
   */
  initialGuidePickup?: TownGuidePickup | null;
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
  /**
   * Offer Business Class whatever the route (golf transfers). Otherwise it is only
   * offered on journeys to or from Dublin Airport.
   */
  businessClassAnyRoute?: boolean;
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

/** Initial quote records the free default; optional services are chosen in booking details. */
function websiteAirportAccessLeadLabel(selection: { eligible: boolean; legs: readonly unknown[]; service?: string | null }): string | undefined {
  return selection.eligible ? "Free Airport Access — Long Stay; optional terminal services selected in booking details" : undefined;
}

/** Journey summary date, e.g. "Mon, 9 Nov 2026"; keeps the chosen calendar day in every time zone. */
function journeySummaryDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "—";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
}

function JourneySummaryIcon({ name }: { name: "calendar" | "clock" | "return" }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" data-journey-icon>
      {name === "calendar" ? (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></>) : null}
      {name === "clock" ? (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>) : null}
      {name === "return" ? (<><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>) : null}
    </svg>
  );
}

function QuoteCard({
  restoredQuote,
  homepagePolish = false,
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
  initialGuidePickup = null,
  initialDropoffPlace = null,
  preferMinibus = false,
  businessClassAnyRoute = false,
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
  const [publicPricingFailed, setPublicPricingFailed] = useState(false);
  const [publicPricingAttempt, setPublicPricingAttempt] = useState(0);
  const publicMinibusEnabled = publicPricing.minibus.publicEnabled === true;
  const publicExecutiveSettingEnabled = publicPricing.executive?.publicEnabled !== false;
  const passengerLimit = publicMinibusEnabled
    ? publicMaxPassengers(true)
    : Math.min(Math.max(1, maxPassengers), publicMaxPassengers(false));
  const suitcaseLimit = publicMaxSuitcases(publicMinibusEnabled);

  const previewQuoteAppliedRef = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetchPublicPricingConfig({ strict: true, signal: controller.signal }).then((config) => {
      if (!controller.signal.aborted) {
        setPublicPricing(
          previewMinibusRequestQuoteEnabled()
            ? { ...config, minibus: { ...config.minibus, requestQuote: true } }
            : config,
        );
        setPublicPricingLoaded(true);
        setPublicPricingFailed(false);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setPublicPricingFailed(true);
    });
    return () => controller.abort();
  }, [publicPricingAttempt]);
  const isMobileDevice = useIsMobileDevice();
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [bookingSent, setBookingSent] = useState(false);
  const [bookingReference, setBookingReference] = useState("");
  const [quoteTransactionId, setQuoteTransactionId] = useState("");
  const quoteCalculationFingerprintRef = useRef("");
  const [bookingDelivery, setBookingDelivery] = useState<BookingDelivery | null>(null);
  const [quoteStep, setQuoteStep] = useState<1 | 2 | 3>(1);
  useEffect(() => {
    if (quoteStep !== 2) return;
    let cancelled = false;
    // Re-entering contact details loads the current configured service prices.
    void fetchPublicPricingConfig().then((config) => {
      if (!cancelled) setPublicPricing((current) => ({ ...current, meetGreet: config.meetGreet }));
    });
    return () => { cancelled = true; };
  }, [quoteStep]);
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
    : initialGuidePickup && initialDirection === "to-airport"
      ? townGuidePlace(initialGuidePickup)
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
  // Design 2 (approved mobile reference): homepage asks for route and party first,
  // then journey type, date and time on the Vehicle step before any price is shown.
  const mobileDesign2 = useMobileDesign2();
  const mobileDesign3 = useMobileDesign3();
  const design2Home = mobileDesign2 && presentation === "homepage";
  const [homepageFareChangeAck, setHomepageFareChangeAck] = useState(false);
  const returnJourney = journeyMode === "return";
  const [tripDateError, setTripDateError] = useState("");
  const [returnDateError, setReturnDateError] = useState("");
  const [customerNameError, setCustomerNameError] = useState("");
  // Signed in to My bookings: fill in the details they last booked with (never overwrite typing).
  useEffect(() => {
    const profile = readCachedCustomerProfile();
    if (!profile) return;
    if (profile.name) setCustomerName((prev) => prev || profile.name);
    if (profile.email) setCustomerEmail((prev) => prev || profile.email);
    if (profile.mobile) setCustomerMobile((prev) => prev || profile.mobile);
  }, []);
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
  // Design 3 mobile form: party starts at 1 passenger (minimum 1) and 0 suitcases, so the
  // customer only changes them when needed (also after Start over). Saved values are kept.
  useEffect(() => {
    if (!(mobileDesign3 && design2Home)) return;
    if (passengers == null) setPassengers(1);
    if (suitcases == null) setSuitcases(0);
  }, [mobileDesign3, design2Home, passengers, suitcases]);
  // Design 2 uses +/- steppers that start at 1 passenger and no suitcases. Design 3 starts at
  // 0 passengers: the count stays unset (shown as 0) until the customer taps +, so a quote
  // can't be requested without a real passenger choice.
  useEffect(() => {
    if (!design2Home) return;
    const design3 = typeof document !== "undefined" && document.documentElement.hasAttribute("data-mobile-d3");
    if (!design3) setPassengers((value) => (value == null ? 1 : value));
    setSuitcases((value) => (value == null ? 0 : value));
  }, [design2Home]);

  // Let WhatsApp links (floating QR, header icon, Need help?) pre-fill this journey.
  useEffect(() => {
    setWhatsAppJourney({
      pickup: pickupAddress,
      dropoff: dropoffAddress,
      tripDate,
      tripTime,
      returnJourney: journeyMode == null ? null : journeyMode === "return",
      returnDate,
      returnTime,
      passengers,
      suitcases,
    });
  }, [pickupAddress, dropoffAddress, tripDate, tripTime, journeyMode, returnDate, returnTime, passengers, suitcases]);
  useEffect(() => () => setWhatsAppJourney(null), []);
  const [homepageCapacityConfirmed, setHomepageCapacityConfirmed] = useState(false);
  const [exactPassengers, setExactPassengers] = useState<number | null>(null);
  const [childSeats, setChildSeats] = useState(0);
  const [childSeatNotes, setChildSeatNotes] = useState("");
  /** Desktop (1200px+) only: the child seat row starts collapsed. Below 1200px the options always show. */
  const [childSeatsPanelOpen, setChildSeatsPanelOpen] = useState(false);
  const [childSeatNotesError, setChildSeatNotesError] = useState("");
  const [saveQuoteSettings, setSaveQuoteSettings] = useState({ ...DEFAULT_SAVE_QUOTE_SETTINGS, enabled: false });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${savedQuoteWorkerBaseUrl()}/saved-quotes/settings`, { signal: controller.signal, cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error("Settings unavailable"); return r.json(); })
      .then(v => setSaveQuoteSettings(normalizeSaveQuoteSettings(v))).catch(() => {});
    return () => controller.abort();
  }, []);
  const [saveQuoteOpen, setSaveQuoteOpen] = useState(false);
  const [initialWhatsAppRequest, setInitialWhatsAppRequest] = useState<Promise<SaveQuoteResult> | null>(null);
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
  /** Business Class: Dublin Airport journeys, any journey over 40 miles, and golf transfers. */
  const isDublinAirportJourney = IS_A2A_PRIMARY
    ? detectAirportCodeFromPlace(pickupPlace) === "DUB" || detectAirportCodeFromPlace(dropoffPlace) === "DUB"
    : airportCode === "DUB" || intentAirportCode === "DUB";
  const [routeMetrics, setRouteMetrics] = useState<TripRouteMetrics | null>(null);
  const isLongJourneyForBusinessClass =
    routeMetrics != null && universalDrivingMilesFromKm(routeMetrics.distanceKm) > 40; // miles
  const publicExecutiveEnabled =
    publicExecutiveSettingEnabled &&
    (businessClassAnyRoute || isDublinAirportJourney || isLongJourneyForBusinessClass);
  const [quoteActionOpen, setQuoteActionOpen] = useState<"route" | "restart" | "whatsapp" | "help" | null>(null);
  const routeMetricsRef = useRef(routeMetrics);
  routeMetricsRef.current = routeMetrics;
  const authoritativeFareCacheRef = useRef(new Map<string, ServerFarePartyParts>());
  /** Desktop vehicle list only: re-render when another vehicle's fare arrives in the cache above. */
  const [, setFareCacheVersion] = useState(0);
  /** Desktop (1200px+) quote results: the journey form is folded away until "Edit journey". */
  const [desktopJourneyEditing, setDesktopJourneyEditing] = useState(false);
  const logoHomeRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onLogoHome = () => logoHomeRef.current();
    window.addEventListener("matni-logo-home", onLogoHome);
    return () => window.removeEventListener("matni-logo-home", onLogoHome);
  }, []);
  /** Desktop (1200px+) vehicle step: price breakdown in the navy summary, collapsed by default. */
  const [desktopBreakdownOpen, setDesktopBreakdownOpen] = useState(false);
  const [priceSheetOpen, setPriceSheetOpen] = useState(false);
  /** Vercel preview sites: the final Pay / request action is switched off (set after mount). */
  const [previewPaymentsOff, setPreviewPaymentsOff] = useState(false);
  useEffect(() => {
    setPreviewPaymentsOff(previewPaymentsDisabled());
  }, []);
  /** Desktop checkout fare breakdown: null follows the default (open when anything is added or discounted). */
  const [checkoutBreakdownOpen, setCheckoutBreakdownOpen] = useState<boolean | null>(null);
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
  /** Fare key already given one automatic silent retry (a dropped or raced request must not leave "Price unavailable"). */
  const quoteAutoRetryKeyRef = useRef<string | null>(null);
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
  const [paymentUncertain, setPaymentUncertain] = useState(false);
  useEffect(() => {
    if (hasUncertainPayment()) {
      setPaymentUncertain(true);
      setPaymentError(PAYMENT_UNCERTAIN_MESSAGE);
    }
  }, []);
  const paymentSubmitLock = useRef(false);
  const paymentNavigating = useRef(false);
  const [paymentSlow, setPaymentSlow] = useState(false);
  useEffect(() => {
    setPaymentSlow(false);
    if (!paymentLoading) return;
    const timer = window.setTimeout(() => setPaymentSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [paymentLoading]);
  const [paymentErrorValue, setPaymentError] = useState("");
  const paymentError = paymentUncertain ? PAYMENT_UNCERTAIN_MESSAGE : paymentErrorValue;
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
  const [bookingMeetGreetSelected, setBookingMeetGreetSelected] = useState(false);
  const [terminalAccessChoices, setTerminalAccessChoices] = useState<TerminalAccessChoices>({});
  const [outboundAccessChoice, setOutboundAccessChoice] = useState<AirportAccessChoice>("free");
  const [returnAccessChoice, setReturnAccessChoice] = useState<AirportAccessChoice>("free");
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
  const [heardAbout, setHeardAbout] = useState("");
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
  /** Business Class journeys do not offer child seats: none are shown, validated or sent. */
  const childSeatsOffered = !isExecutiveVehicle(quoteVehicle);
  const bookingChildSeats = childSeatsOffered ? childSeats : 0;
  useEffect(() => {
    if (childSeatsOffered) return;
    setChildSeats(0);
    setChildSeatNotes("");
    setChildSeatNotesError("");
    setChildSeatsPanelOpen(false);
  }, [childSeatsOffered]);
  const isVehiclePersonalQuote =
    publicVehicleRequiresPersonalQuote(quoteVehicle, publicPricing) && !appliedPersonalQuote;
  /**
   * Drop-off picked as a whole street / area (no house number or building name).
   * Ask for the number instead of falling back to a personalised quote, so the
   * customer can still get an instant price once the address is complete.
   */
  const isIncompleteDropoffAddress =
    isA2AFlow &&
    isPlaceSelected(dropoffPlace) &&
    isIncompleteAddressPlace(dropoffPlace) &&
    !detectAirportCodeFromPlace(dropoffPlace);
  const isManualQuoteJourney =
    isVehiclePersonalQuote ||
    (isA2AFlow &&
      isPlaceSelected(pickupPlace) &&
      isPlaceSelected(dropoffPlace) &&
      !isIncompleteDropoffAddress &&
      needsManualQuoteApproval(pickupPlace, dropoffPlace, {
        irelandPickupsIntoBelfastInstant: publicPricing.irelandPickupsIntoBelfastInstant === true,
      })) ||
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
  /** Town page guide pickup (town centre): shows a guide price but cannot be booked. */
  const isTownGuidePickup = isTownGuidePlace(pickupPlace);
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
  /**
   * Desktop only: once the customer has filled the last box on Complete your booking
   * (email, or the flight number when one is needed) and moves on, glide down to the
   * journey summary and the Pay button. Happens once per visit to the booking step.
   */
  const checkoutBoxesComplete =
    quoteStep >= 2 &&
    Boolean(customerName.trim()) &&
    isValidMobileNumber(customerMobile) &&
    isValidEmailAddress(customerEmail);
  const lastCheckoutBoxId = needsReturnCollectionFlightNumber
    ? "collectionFlightNumber"
    : needsOutboundFlightNumber
      ? "goingFlightNumber"
      : "email";
  const checkoutAutoScrolledRef = useRef(false);
  useEffect(() => {
    if (quoteStep < 2) checkoutAutoScrolledRef.current = false;
  }, [quoteStep]);
  function scrollDesktopCheckoutToSummary() {
    if (checkoutAutoScrolledRef.current || typeof window === "undefined") return;
    if (!window.matchMedia("(min-width: 1200px)").matches) return;
    const target = step2JourneySummaryRef.current;
    if (!target) return;
    checkoutAutoScrolledRef.current = true;
    const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
    const startY = window.scrollY;
    const endY = Math.max(0, target.getBoundingClientRect().top + startY - Math.max(0, headerBottom) - 12);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo(0, endY);
      return;
    }
    // A slow, gentle glide (about 2.2s) rather than the browser's quick jump.
    const durationMs = 2200;
    const startTime = performance.now();
    // The site uses smooth scrolling for links; switch it off while we drive the glide
    // frame by frame, or each step starts its own animation and the page lurches.
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    let cancelled = false;
    const finish = () => {
      root.style.scrollBehavior = previousScrollBehavior;
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
    };
    const cancel = () => {
      cancelled = true;
      finish();
    };
    window.addEventListener("wheel", cancel, { passive: true, once: true });
    window.addEventListener("touchstart", cancel, { passive: true, once: true });
    const step = (now: number) => {
      if (cancelled) return;
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      window.scrollTo(0, startY + (endY - startY) * eased);
      if (t < 1) {
        window.requestAnimationFrame(step);
      } else {
        finish();
      }
    };
    window.requestAnimationFrame(step);
  }
  const lastFlightLookupStatus =
    lastCheckoutBoxId === "collectionFlightNumber"
      ? collectionFlightLookupStatus
      : lastCheckoutBoxId === "goingFlightNumber"
        ? goingFlightLookupStatus
        : null;
  // Flight number boxes: move on once the flight has been confirmed (or, if the flight
  // checker is busy, once that message has shown, since the customer can still continue).
  useEffect(() => {
    if (!checkoutBoxesComplete) return;
    if (lastFlightLookupStatus !== "verified" && lastFlightLookupStatus !== "unavailable") return;
    const timer = window.setTimeout(
      scrollDesktopCheckoutToSummary,
      lastFlightLookupStatus === "verified" ? 1000 : 1800,
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutBoxesComplete, lastFlightLookupStatus]);
  function handleCheckoutBoxBlur(event: ReactFocusEvent<HTMLElement>) {
    if (!checkoutBoxesComplete) return;
    if ((event.target as HTMLElement | null)?.id !== lastCheckoutBoxId) return;
    // While a flight is still being checked, wait for the confirmation instead.
    if (lastFlightLookupStatus === "loading") return;
    window.setTimeout(scrollDesktopCheckoutToSummary, 300);
  }
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
      if (draft.terminalAccessChoices) setTerminalAccessChoices(draft.terminalAccessChoices);
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
        setOutboundAccessChoice(draft.outboundAirportAccessChoice ?? (draft.expressDropOffSelected ? "express" : "free"));
      }
      if (
        draft.returnAirportAccessChoice === "express" ||
        draft.returnAirportAccessChoice === "free" ||
        draft.returnAirportAccessChoice === "meet-greet" ||
        typeof draft.returnExpressDropOffSelected === "boolean"
      ) {
        setReturnAccessChoice(draft.returnAirportAccessChoice ?? (draft.returnExpressDropOffSelected ? "express" : "free"));
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
    // Back from our own payment page in this tab: restore the journey the customer was paying for.
    const returningFromPayment =
      !returnOfferToken &&
      !restoredQuote &&
      consumePaymentHandoff() &&
      Boolean(draft?.pickupAddress?.trim() && draft?.dropoffAddress?.trim() && draft?.pickupPlace && draft?.dropoffPlace);

    if (visitDecision.clearStoredAddresses && !returningFromPayment) {
      // Never rehydrate pickup/destination from localStorage or an old session draft.
      clearStoredQuoteAddresses();
    }

    if (draft && !restoredQuote) {
      applyNonAddressDraftFields(draft);
    }
    if (returningFromPayment && draft) {
      setPickupAddress(draft.pickupAddress ?? "");
      setDropoffAddress(draft.dropoffAddress ?? "");
      if (draft.pickupPlace) setPickupPlace(draft.pickupPlace);
      if (draft.dropoffPlace) setDropoffPlace(draft.dropoffPlace);
      if (presentation === "homepage") setHomepagePriceRequested(true);
    }

    const existingCheckout = readOpenCheckoutSession();
    if (existingCheckout) {
      setOpenCheckout(existingCheckout);
    }
  }, [returnOfferToken, restoredQuote]);

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
      // Browser Back from our payment page restores the page as it was: keep the journey.
      if (event.persisted && hasPaymentHandoff()) {
        consumePaymentHandoff();
        return;
      }
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

    async function resolveRebookPlace(place: RebookPlace): Promise<SelectedPlace | null> {
      const placeId = place.placeId?.trim();
      if (!placeId) return null;
      const fetched = await fetchSelectedPlaceDetails(placeId, "BFS", place.label).catch(() => null);
      if (fetched?.placeId) return fetched;
      if (typeof place.lat === "number" && typeof place.lng === "number") {
        return selectedPlaceFromParts({
          placeId,
          formattedAddress: place.label,
          displayAddress: place.label,
          lat: place.lat,
          lng: place.lng,
        });
      }
      return null;
    }

    async function applyRebookPrefill(draft: QuoteDraftPrefill) {
      const rebook = draft.rebook;
      if (!rebook) return;
      const [pickup, dropoff] = await Promise.all([
        resolveRebookPlace(rebook.pickup),
        resolveRebookPlace(rebook.dropoff),
      ]);
      if (pickup) handlePickupPlaceSelect(pickup);
      else if (rebook.pickup.label.trim()) setPickupAddress(rebook.pickup.label.trim());
      if (dropoff) handleDropoffPlaceSelect(dropoff);
      else if (rebook.dropoff.label.trim()) setDropoffAddress(rebook.dropoff.label.trim());
      setJourneyMode(draft.returnJourney ? "return" : "one-way");
      if (typeof draft.passengers === "number" && draft.passengers > 0) {
        const storedPassengers = readStoredPassengerCount(draft.passengers);
        if (storedPassengers != null) setPassengers(storedPassengers);
      }
      if (typeof draft.suitcases === "number" && draft.suitcases >= 0) {
        const storedSuitcases = readStoredSuitcaseCount(draft.suitcases);
        if (storedSuitcases != null) setSuitcases(storedSuitcases);
      }
      setExactPassengers(null);
      if (draft.vehicle && (VEHICLE_TYPES as readonly string[]).includes(draft.vehicle)) {
        setVehicle(draft.vehicle as VehicleType);
      }
      setBookingSent(false);
      setQuoteStep(1);
    }

    function applyDraftPrefill(draft: QuoteDraftPrefill) {
      if (draft.rebook && IS_A2A_PRIMARY) {
        void applyRebookPrefill(draft);
        return;
      }
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

  const restoredQuoteApplied = useRef(false);
  useEffect(() => {
    if (!restoredQuote || !publicPricingLoaded || restoredQuoteApplied.current) return;
    restoredQuoteApplied.current = true;
    const j = restoredQuote.journey;
    setJourneyMode(j.returnJourney ? "return" : "one-way");
    setTripDate(j.tripDate); setTripTime(j.tripTime);
    setReturnDate(j.returnDate || ""); setReturnTime(j.returnTime || "");
    setPassengers(j.passengers); setSuitcases(j.suitcases);
    setChildSeats(normalizeChildSeats(j.childSeats)); setChildSeatNotes(j.childSeatNotes || "");
    setGoingFlightNumber(j.flightNumber || ""); setCollectionFlightNumber(j.returnFlightNumber || "");
    setTerminalAccessChoices(j.terminalAccessChoices ?? {});
    setOutboundAccessChoice(j.optionalMeetGreetSelected && j.airportCode !== "DUB" ? "meet-greet" : j.outboundAirportAccessChoice || "express");
    setReturnAccessChoice(j.returnAirportAccessChoice || "express");
    if ((VEHICLE_TYPES as readonly string[]).includes(j.vehicle)) {
      setVehicle(j.vehicle as VehicleType); setChooseEstate(j.vehicle === ESTATE_VEHICLE);
      setChooseMinibus(j.vehicle === MINIBUS_VEHICLE_TYPE); setChooseExecutive(isExecutiveVehicle(j.vehicle));
      customerPickedVehicleRef.current = true;
    }
    setHomepagePriceRequested(true);
  }, [restoredQuote, publicPricingLoaded]);

  useEffect(() => {
    if (!publicPricingLoaded) {
      return;
    }
    const seed = readPreviewCustomerQuoteSeed();
    if (!seed) {
      return;
    }

    if (!previewQuoteAppliedRef.current) {
      previewQuoteAppliedRef.current = true;

      const pickupDisplay =
        seed.pickup.displayAddress || seed.pickup.formattedAddress || placeDisplayText(seed.pickup);
      const dropoffDisplay =
        seed.dropoff.displayAddress || seed.dropoff.formattedAddress || placeDisplayText(seed.dropoff);

      setJourneyIntent("to-airport");
      setTripDirection("to-airport");
      setTripMode("address");
      setIntentAirportCode("BFS");
      setAirportCode("BFS");
      setPickupPlace(seed.pickup);
      setPickupAddress(pickupDisplay);
      setPickupPlaceError("");
      setPickupRestoredHint(false);
      saveConfirmedPickupPlace(seed.pickup);
      setDropoffPlace(seed.dropoff);
      setDropoffAddress(dropoffDisplay);
      setDropoffPlaceError("");
      setDropoffRestoredHint(false);
      saveConfirmedDropoffPlace(seed.dropoff);
      setJourneyMode("one-way");
      setTripDate(seed.tripDate);
      setTripTime(seed.tripTime);
      setTripDateError("");
      setPassengersError("");
      setSuitcasesError("");
      setQuoteStep(1);
    }

    if (
      seed.passengers != null &&
      seed.passengers >= 1 &&
      seed.passengers <= passengerLimit
    ) {
      setPassengers(seed.passengers);
    }
    if (
      seed.suitcases != null &&
      seed.suitcases >= 0 &&
      seed.suitcases <= suitcaseLimit
    ) {
      setSuitcases(seed.suitcases);
    }
  }, [passengerLimit, publicPricingLoaded, suitcaseLimit]);

  const scheduleEntered = hasEnteredQuoteSchedule({
    outboundDate: tripDate,
    outboundTime: tripTime,
    returnJourney,
    returnDate,
    returnTime,
  });
  const isScheduleComplete =
    scheduleEntered &&
    isTripDateOnOrAfterToday(tripDate) &&
    isTripDateTimeNotInPast(tripDate, tripTime) &&
    (!returnJourney || isReturnAfterOutbound(tripDate, tripTime, returnDate, returnTime));
  const pickupLeadWindow =
    tripDate && tripTime
      ? classifyPickupLeadWindow(
          tripDate,
          tripTime,
          new Date(),
          minimumBookingNoticeHours,
          minimumShortNoticeLeadHours,
        )
      : "unknown";
  const isMinibusQuote = isPublicMinibusVehicle(quoteVehicle);
  const minibusInsideNotice =
    isMinibusQuote &&
    Boolean(tripDate && tripTime) &&
    isWithinMinimumBookingNotice(
      tripDate,
      tripTime,
      new Date(),
      minibusMinimumBookingNoticeHours,
    );
  const closedAvailabilityMessage = isClosedAvailabilityError(paymentError);
  const isTooSoonPickup =
    !isMinibusQuote &&
    pickupLeadWindow === "too_soon" &&
    !ownerNoAvailabilityBlocked &&
    !closedAvailabilityMessage;
  // Too soon only because we're closed overnight (22:00–07:00), not the normal lead time.
  const isOvernightTooSoon =
    isTooSoonPickup &&
    Boolean(tripDate && tripTime) &&
    !isBelowMinimumShortNoticeLead(tripDate, tripTime, new Date(), minimumShortNoticeLeadHours);
  const isMinimumNoticeRequest =
    !isMinibusQuote &&
    pickupLeadWindow === "short_notice" &&
    !ownerNoAvailabilityBlocked &&
    !closedAvailabilityMessage;
  const isMinibusNoticeRequest =
    minibusInsideNotice &&
    !ownerNoAvailabilityBlocked &&
    !closedAvailabilityMessage &&
    !smartAvailabilityBlocked &&
    !isCustomerSmartAvailabilityBlockMessage(paymentError);
  const isAvailabilityRequest = isMinimumNoticeRequest || isMinibusNoticeRequest;

  const partySelectionReady = isPartySelectionComplete(
    passengers,
    suitcases,
    passengerLimit,
    suitcaseLimit,
  );
  const effectivePassengers = effectivePartyPassengers(passengers, passengerLimit);
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

  // A final fixed price requires the booked pickup schedule on every presentation.
  // Public flow clamps to 1–4 / 0–4, so this stays false; kept as a hard guard.
  const exceedsOnlineCapacity =
    quoteChoicesReady &&
    effectivePassengers != null &&
    suitcases != null &&
    exceedsOnlineVehicleOptions(effectivePassengers, suitcases, passengerLimit, suitcaseLimit);
  const scheduleReadyForQuote = isScheduleComplete;
  const canShowPrice =
    hasQuoteRoute &&
    quoteChoicesReady &&
    scheduleReadyForQuote &&
    !exceedsOnlineCapacity &&
    !isIncompleteDropoffAddress;

  // Homepage action gate for route and party. Schedule validation is enforced
  // before the action can request or display a final fare.
  const homepageQuoteReady =
    hasQuoteRoute &&
    !isIncompleteDropoffAddress &&
    quoteChoicesReady &&
    !exceedsOnlineCapacity &&
    isQuoteReadyPlace(pickupPlace) &&
    isQuoteReadyPlace(dropoffPlace) &&
    addressTextMatchesPlace(pickupAddress, pickupPlace) &&
    addressTextMatchesPlace(dropoffAddress, dropoffPlace) &&
    !placesEqual(pickupPlace, dropoffPlace) &&
    (suitcases !== 5 || homepageCapacityConfirmed);

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

  /** The on-device fare estimate (shared pricing formulas, unchanged) for one vehicle. */
  function estimateFareFor(estimateVehicle: typeof quoteVehicle) {
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
          estimateVehicle,
          returnJourney,
          schedule,
          routeMetrics,
          false,
          publicPricing,
        );
      }
      if (journeyKind === "airport-to-address" && pickupAirportCode) {
        return calculateQuote(
          dropoffAddress,
          pickupAirportCode,
          estimateVehicle,
          returnJourney,
          schedule,
          routeMetrics,
          true,
          publicPricing,
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
          estimateVehicle,
          returnJourney,
          schedule,
          routeMetrics,
          publicPricing,
        );
      }
      // Eligible address journeys use actual road metrics; never invent a fare.
      if (!routeMetrics) {
        return null;
      }
      if (isDublinCityCorridor) {
        const niAddress = isDublinCityNotAirportPlace(dropoffPlace)
          ? pickupAddress
          : dropoffAddress;
        return calculateDublinCityBeyondAirportQuote(
          niAddress,
          estimateVehicle,
          routeMetrics,
          returnJourney,
          schedule,
          publicPricing,
        );
      }
      return calculatePointToPointQuote(
        pickupAddress,
        dropoffAddress,
        estimateVehicle,
        returnJourney,
        schedule,
        routeMetrics,
        null,
        undefined,
        publicPricing,
      );
    }

    if (isAirportTrip) {
      return calculateQuote(
        quoteAddress,
        airportCode,
        estimateVehicle,
        returnJourney,
        schedule,
        routeMetrics,
        isFromAirport,
        publicPricing,
      );
    }

    if (!routeMetrics) {
      return null;
    }

    return calculatePointToPointQuote(
      pickupAddress,
      dropoffAddress,
      estimateVehicle,
      returnJourney,
      schedule,
      routeMetrics,
      null,
      {
        pickup: pickupPlace ?? undefined,
        dropoff: dropoffPlace ?? undefined,
      },
      publicPricing,
    );
  }

  const liveQuote = useMemo(
    () => estimateFareFor(quoteVehicle),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [    airportCode,
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
    publicPricing,
  ]);

  // Prefer Worker-authoritative fare (same resolveWorkerTripRouteMetrics + engine as SumUp)
  // so the displayed/consent amount matches checkout. Browser metrics stay for map display.
  const refreshAuthoritativeServerQuote = useCallback(async (
    force = false,
    signal?: AbortSignal,
  ): Promise<boolean> => {
    // Default settings must not start instant requests before the owner's modes arrive.
    if (!publicPricingLoaded) return false;
    if (isBrowserPricingPreview() && previewMinibusQueryEnabled()) {
      setServerFareParts(null);
      setServerQuoteUnavailable(true);
      return false;
    }
    if (!canShowPrice || isManualQuoteJourney || pricingConfirmationRequired) {
      setServerFareParts(null);
      setServerQuoteUnavailable(false);
      return false;
    }
    if (isEnquiryOnly && !showGuidePrice) {
      setServerFareParts(null);
      setServerQuoteUnavailable(false);
      return false;
    }
    const pickup = pickupAddress.trim();
    const dropoff = dropoffAddress.trim();
    if (!pickup || !dropoff || passengers == null || suitcases == null || journeyMode == null) {
      setServerFareParts(null);
      setServerQuoteUnavailable(false);
      return false;
    }
    const requestedPassengers = effectivePassengers ?? passengers;
    const requestedSuitcases = suitcases;
    const requestedVehicle = quoteVehicle;
    const fareKeyFor = (vehicle: string) =>
      quoteFareRequestKey({
        pickup,
        dropoff,
        passengers: requestedPassengers,
        suitcases,
        vehicle,
        outboundDate: tripDate.trim(),
        outboundTime: tripTime.trim(),
        returnJourney,
        returnDate,
        returnTime,
      });
    const paxNow =
      effectivePartyPassengers(passengers, passengerLimit) ??
      (passengers >= 1 ? passengers : null);
    if (paxNow != null && !vehicleFitsParty(requestedVehicle, paxNow, suitcases)) {
      const suitable = keepOrSmallestSuitableVehicle({
        current: requestedVehicle,
        passengers: paxNow,
        suitcases,
        publicMinibusEnabled,
        publicExecutiveEnabled,
      });
      const recoveryKey = `${paxNow}:${suitcases}:${suitable}`;
      if (suitable !== requestedVehicle && unsuitableFareRecoveryRef.current !== recoveryKey) {
        unsuitableFareRecoveryRef.current = recoveryKey;
        setManualVehicle(null);
        setChooseExecutive(suitable === EXECUTIVE_VEHICLE);
        setChooseMinibus(suitable === MINIBUS_VEHICLE_TYPE);
        setChooseEstate(suitable === ESTATE_VEHICLE);
        setVehicle(suitable);
        setServerQuoteUnavailable(false);
        setVehicleFareUpdating(true);
        return false;
      }
      if (suitable !== requestedVehicle) {
        setVehicleFareUpdating(false);
        setServerQuoteUnavailable(true);
        return false;
      }
    }
    const rejectionKey = (vehicle: string) => `${paxNow}:${suitcases}:${vehicle}`;
    if (paxNow != null && rejectedVehicleKeysRef.current.has(rejectionKey(requestedVehicle))) {
      const next = suitableVehicleTypesForParty(paxNow, suitcases, {
        publicMinibusEnabled,
        publicExecutiveEnabled,
      }).find((candidate) => !rejectedVehicleKeysRef.current.has(rejectionKey(candidate)));
      if (next && next !== requestedVehicle) {
        setManualVehicle(null);
        setChooseExecutive(next === EXECUTIVE_VEHICLE);
        setChooseMinibus(next === MINIBUS_VEHICLE_TYPE);
        setChooseEstate(next === ESTATE_VEHICLE);
        setVehicle(next);
        setServerQuoteUnavailable(false);
        setVehicleFareUpdating(true);
        return false;
      }
      setVehicleFareUpdating(false);
      setServerQuoteUnavailable(true);
      return false;
    }
    const vehiclesToPrice = quoteFareVehiclesToRequest({
      selectedVehicle: requestedVehicle,
      automaticVehicle:
        paxNow == null ? requestedVehicle : getAutoVehicle(paxNow, suitcases, IS_A2A_PRIMARY),
      minibusVehicle: MINIBUS_VEHICLE_TYPE,
      publicMinibusEnabled,
      requiresMinibus: paxNow != null && requiresMinibus(paxNow, suitcases),
      suitableVehicles:
        paxNow == null
          ? [requestedVehicle]
          : suitableVehicleTypesForParty(paxNow, suitcases, {
              publicMinibusEnabled,
              publicExecutiveEnabled,
            }).filter((candidate) => !publicVehicleRequiresPersonalQuote(candidate, publicPricing)),
    });
    const rememberFare = (vehicle: string, parts: ServerFarePartyParts) => {
      authoritativeFareCacheRef.current.set(fareKeyFor(vehicle), parts);
      setFareCacheVersion((version) => version + 1);
    };
    const quoteBodyFor = (vehicle: string) => ({
      pickupAddress: pickup,
      dropoffAddress: dropoff,
      // Omit client airportCode — Worker derives from addresses (payment parity).
      returnJourney,
      outboundDate: tripDate.trim(),
      outboundTime: tripTime.trim(),
      returnDate: returnJourney ? returnDate.trim() : undefined,
      returnTime: returnJourney ? returnTime.trim() : undefined,
      passengers: requestedPassengers,
      suitcases,
      pickupLat: pickupPlace?.lat ?? undefined,
      pickupLng: pickupPlace?.lng ?? undefined,
      dropoffLat: dropoffPlace?.lat ?? undefined,
      dropoffLng: dropoffPlace?.lng ?? undefined,
      pickupPlaceId: pickupPlace?.placeId?.trim() || undefined,
      dropoffPlaceId: dropoffPlace?.placeId?.trim() || undefined,
      // Browser OSRM metrics, when TripMap already has them, so the worker
      // can price without a second route lookup.
      routeMetrics: routeMetricsRef.current ?? undefined,
      vehicleType: vehicle,
      vehicleChoice: vehicle.toLowerCase().includes("minibus")
        ? ("Minibus" as const)
        : ("Saloon" as const),
    });
    const loadAlternateFares = () => {
      for (const vehicle of vehiclesToPrice.slice(1)) {
        const key = fareKeyFor(vehicle);
        const existing = quoteFareInflightRef.current.get(key);
        if (
          authoritativeFareCacheRef.current.has(key) ||
          (existing != null && existing.signal?.aborted !== true)
        ) {
          continue;
        }
        const promise = calculateServerQuote(quoteBodyFor(vehicle)).then((alternate) => {
          if (quoteFareInflightRef.current.get(key)?.promise === promise) {
            quoteFareInflightRef.current.delete(key);
          }
          if (
            alternate.ok &&
            canonicalVehicleType(alternate.vehicleType) === vehicle &&
            Number.isFinite(alternate.amount) &&
            typeof alternate.journeyFareGbp === "number" &&
            Number.isFinite(alternate.journeyFareGbp)
          ) {
            rememberFare(vehicle, {
              preserveBfsMinimumPence: Boolean(alternate.preserveBfsMinimumPence),
              nightWeekendSurchargeLabel: alternate.nightWeekendSurchargeLabel,
              nightWeekendSurchargeExplanation: alternate.nightWeekendSurchargeExplanation,
              journeyFareGbp: Math.round(alternate.journeyFareGbp * 100) / 100,
              airportFixedCostsGbp:
                typeof alternate.airportFixedCostsGbp === "number"
                  ? Math.round(alternate.airportFixedCostsGbp * 100) / 100
                  : 0,
              nightWeekendSurchargeGbp:
                typeof alternate.nightWeekendSurchargeGbp === "number"
                  ? Math.round(alternate.nightWeekendSurchargeGbp * 100) / 100
                  : 0,
              ...(typeof alternate.outboundOneWayBeforeAccessGbp === "number"
                ? { outboundOneWayBeforeAccessGbp: alternate.outboundOneWayBeforeAccessGbp }
                : {}),
              ...(typeof alternate.returnOneWayBeforeAccessGbp === "number"
                ? { returnOneWayBeforeAccessGbp: alternate.returnOneWayBeforeAccessGbp }
                : {}),
              amountGbp: Math.round(alternate.amount * 100) / 100,
              vehicleType: vehicle,
              passengers: requestedPassengers,
              suitcases,
              ...(alternate.quoteReceipt ? { quoteReceipt: alternate.quoteReceipt } : {}),
              outboundDate: tripDate.trim(),
              outboundTime: tripTime.trim(),
              returnJourney,
              returnDate: returnJourney ? returnDate.trim() : "",
              returnTime: returnJourney ? returnTime.trim() : "",
            });
          }
          return alternate;
        }).catch(() => {
          if (quoteFareInflightRef.current.get(key)?.promise === promise) {
            quoteFareInflightRef.current.delete(key);
          }
          return { ok: false as const, message: "Could not calculate fare" };
        });
        quoteFareInflightRef.current.set(key, { promise });
      }
    };
    if (!force) {
      const cached = authoritativeFareCacheRef.current.get(fareKeyFor(requestedVehicle));
      if (cached && requestedVehicle === quoteVehicleRef.current) {
        setServerFareParts(cached);
        setServerQuoteUnavailable(false);
        setVehicleFareUpdating(false);
        displayedRouteKeyRef.current = [
          pickup,
          dropoff,
          String(requestedPassengers),
          String(requestedSuitcases),
          tripDate.trim(),
          tripTime.trim(),
          returnJourney ? "1" : "0",
          returnDate.trim(),
          returnTime.trim(),
        ].join("|");
        loadAlternateFares();
        return true;
      }
    }
    const requestGen = ++serverQuoteGenRef.current;
    const selectedKey = fareKeyFor(requestedVehicle);
    const retrySelectedFareOnce = async (): Promise<boolean> => {
      if (quoteAutoRetryKeyRef.current === selectedKey) return false;
      quoteAutoRetryKeyRef.current = selectedKey;
      quoteFareInflightRef.current.delete(selectedKey);
      setServerQuoteUnavailable(false);
      setVehicleFareUpdating(true);
      await new Promise((resolve) => window.setTimeout(resolve, 800));
      if (
        signal?.aborted ||
        requestGen !== serverQuoteGenRef.current ||
        requestedVehicle !== quoteVehicleRef.current
      ) {
        return true;
      }
      return refreshAuthoritativeServerQuoteRef.current(true, signal);
    };
    if (force) quoteFareInflightRef.current.delete(selectedKey);
    try {
      quoteFareTimingRef.current.requestAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      let inflight = quoteFareInflightRef.current.get(selectedKey);
      if (inflight?.signal?.aborted) {
        quoteFareInflightRef.current.delete(selectedKey);
        inflight = undefined;
      }
      if (!inflight) {
        const promise = calculateServerQuote(quoteBodyFor(requestedVehicle), undefined, signal);
        const tracked = promise.finally(() => {
          if (quoteFareInflightRef.current.get(selectedKey)?.promise === tracked) {
            quoteFareInflightRef.current.delete(selectedKey);
          }
        });
        inflight = { promise: tracked, signal };
        quoteFareInflightRef.current.set(selectedKey, inflight);
      }
      loadAlternateFares();
      setServerQuoteUnavailable(false);
      const result = await inflight.promise;
      if (
        result.ok &&
        canonicalVehicleType(result.vehicleType) === requestedVehicle &&
        Number.isFinite(result.amount) &&
        typeof result.journeyFareGbp === "number" &&
        Number.isFinite(result.journeyFareGbp)
      ) {
        const pricedParts: ServerFarePartyParts = {
          preserveBfsMinimumPence: Boolean(result.preserveBfsMinimumPence),
          nightWeekendSurchargeLabel: result.nightWeekendSurchargeLabel,
          nightWeekendSurchargeExplanation: result.nightWeekendSurchargeExplanation,
          journeyFareGbp: Math.round(result.journeyFareGbp * 100) / 100,
          airportFixedCostsGbp:
            typeof result.airportFixedCostsGbp === "number"
              ? Math.round(result.airportFixedCostsGbp * 100) / 100
              : 0,
          nightWeekendSurchargeGbp:
            typeof result.nightWeekendSurchargeGbp === "number"
              ? Math.round(result.nightWeekendSurchargeGbp * 100) / 100
              : 0,
          ...(typeof result.outboundOneWayBeforeAccessGbp === "number"
            ? { outboundOneWayBeforeAccessGbp: result.outboundOneWayBeforeAccessGbp }
            : {}),
          ...(typeof result.returnOneWayBeforeAccessGbp === "number"
            ? { returnOneWayBeforeAccessGbp: result.returnOneWayBeforeAccessGbp }
            : {}),
          amountGbp: Math.round(result.amount * 100) / 100,
          vehicleType: requestedVehicle,
          passengers: requestedPassengers,
          suitcases: requestedSuitcases,
          ...(result.quoteReceipt ? { quoteReceipt: result.quoteReceipt } : {}),
          ...(result.emptyRunSavingGbp
            ? { emptyRunSavingGbp: result.emptyRunSavingGbp, emptyRunNormalAmountGbp: result.emptyRunNormalAmountGbp }
            : {}),
          ...(result.emptyRunOffer ? { emptyRunOffer: result.emptyRunOffer } : {}),
          outboundDate: tripDate.trim(),
          outboundTime: tripTime.trim(),
          returnJourney,
          returnDate: returnJourney ? returnDate.trim() : "",
          returnTime: returnJourney ? returnTime.trim() : "",
        };
        rememberFare(requestedVehicle, pricedParts);
        if (
          signal?.aborted ||
          requestGen !== serverQuoteGenRef.current ||
          requestedVehicle !== quoteVehicleRef.current
        ) {
          return false;
        }
        if (process.env.NODE_ENV !== "production") {
          const now = typeof performance !== "undefined" ? performance.now() : Date.now();
          console.info("[quote-fare] F response", {
            ms: Math.round(now - quoteFareTimingRef.current.requestAt),
            msFromInputs: Math.round(now - quoteFareTimingRef.current.inputsAt),
          });
        }
        setServerFareParts(pricedParts);
        setVehicleFareUpdating(false);
        displayedRouteKeyRef.current = [
          pickup,
          dropoff,
          String(requestedPassengers),
          String(requestedSuitcases),
          tripDate.trim(),
          tripTime.trim(),
          returnJourney ? "1" : "0",
          returnDate.trim(),
          returnTime.trim(),
        ].join("|");
        if (
          Number.isFinite(result.distanceKm) &&
          Number.isFinite(result.durationMinutes) &&
          (result.distanceKm ?? 0) > 0 &&
          (result.durationMinutes ?? 0) > 0
        ) {
          setRouteMetrics((current) => {
            const distanceKm = result.distanceKm!;
            const durationMinutes = result.durationMinutes!;
            if (
              current &&
              current.distanceKm === distanceKm &&
              current.durationMinutes === durationMinutes
            ) {
              return current;
            }
            return { distanceKm, durationMinutes };
          });
        }
        setServerQuoteUnavailable(false);
        unsuitableFareRecoveryRef.current = "";
        quoteAutoRetryKeyRef.current = null;
        if (typeof result.minimumBookingNoticeHours === "number") {
          setMinimumBookingNoticeHours(result.minimumBookingNoticeHours);
        }
        if (result.depositCash && Number.isFinite(result.depositCash.percent)) {
          setDepositCashSettings({
            enabled: result.depositCash.enabled === true,
            percent: result.depositCash.percent,
            minimumGbp: result.depositCash.minimumGbp,
          });
        } else {
          setDepositCashSettings(null);
        }
        if (result.ownerAvailability?.blocked) {
          setOwnerNoAvailabilityBlocked(true);
          setSmartAvailabilityBlocked(false);
          setAvailabilityAlternatives([]);
          setPaymentError(OWNER_NO_AVAILABILITY_MESSAGE);
        } else {
          setOwnerNoAvailabilityBlocked(false);
          setPaymentError((prev) => (isClosedAvailabilityError(prev) ? "" : prev));
          if (result.smartAvailability?.enforced) {
            applyCustomerAvailabilityResult({
              blocked: Boolean(result.smartAvailability.blocked),
              available: result.smartAvailability.available !== false,
              customerMessage: result.smartAvailability.customerMessage,
              alternativeTimes: result.smartAvailability.alternativeTimes || [],
            });
          }
        }
        return true;
      }
      if (
        signal?.aborted ||
        requestGen !== serverQuoteGenRef.current ||
        requestedVehicle !== quoteVehicleRef.current
      ) {
        return false;
      }
      if (!result.ok && result.reason === "personal_quote_required") {
        // The server may have a newer mode than this tab. Follow its explicit
        // response instead of treating an intentional manual quote as an outage.
        const category = isExecutiveVehicle(requestedVehicle) ? "executive" :
          requestedVehicle === MINIBUS_VEHICLE_TYPE ? "minibus" : null;
        if (category) {
          setPublicPricing((current) => ({
            ...current,
            [category]: { ...current[category], requestQuote: true },
          }));
          setServerFareParts(null);
          setVehicleFareUpdating(false);
          setServerQuoteUnavailable(false);
          return false;
        }
      }
      if (!result.ok && result.reason === "vehicle_unavailable" && paxNow != null) {
        rejectedVehicleKeysRef.current.add(rejectionKey(requestedVehicle));
        const suitable = suitableVehicleTypesForParty(paxNow, suitcases, {
          publicMinibusEnabled,
          publicExecutiveEnabled,
        }).find((candidate) => !rejectedVehicleKeysRef.current.has(rejectionKey(candidate)));
        const recoveryKey = `${paxNow}:${suitcases}:${requestedVehicle}->${suitable ?? ""}`;
        if (suitable && suitable !== requestedVehicle && unsuitableFareRecoveryRef.current !== recoveryKey) {
          unsuitableFareRecoveryRef.current = recoveryKey;
          const cached = authoritativeFareCacheRef.current.get(fareKeyFor(suitable));
          setManualVehicle(null);
          setChooseExecutive(suitable === EXECUTIVE_VEHICLE);
          setChooseMinibus(suitable === MINIBUS_VEHICLE_TYPE);
          setChooseEstate(suitable === ESTATE_VEHICLE);
          setVehicle(suitable);
          setServerQuoteUnavailable(false);
          if (cached && cached.vehicleType === suitable) {
            setServerFareParts(cached);
            setVehicleFareUpdating(false);
          } else {
            setVehicleFareUpdating(true);
          }
          return false;
        }
      }
      if (await retrySelectedFareOnce()) return true;
      setServerFareParts(null);
      setVehicleFareUpdating(false);
      setServerQuoteUnavailable(true);
      return false;
    } catch (error) {
      const fetchAborted = error instanceof Error && error.name === "AbortError";
      if (
        signal?.aborted ||
        requestGen !== serverQuoteGenRef.current ||
        requestedVehicle !== quoteVehicleRef.current
      ) {
        return false;
      }
      // Still the current request, but the shared in-flight fetch it waited on was cancelled or
      // dropped (e.g. by an earlier, now-replaced quote): fetch again rather than leave the
      // customer on "Calculating…" or "Price unavailable".
      if (await retrySelectedFareOnce()) return true;
      if (fetchAborted) return false;
      setServerFareParts(null);
      setVehicleFareUpdating(false);
      setServerQuoteUnavailable(true);
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
    effectivePassengers,
    pickupAddress,
    pickupPlace?.lat,
    pickupPlace?.lng,
    pickupPlace?.placeId,
    dropoffPlace?.placeId,
    pricingConfirmationRequired,
    returnDate,
    returnJourney,
    returnTime,
    showGuidePrice,
    suitcases,
    setMinimumBookingNoticeHours,
    tripDate,
    tripTime,
    quoteVehicle,
    passengerLimit,
    publicExecutiveEnabled,
    publicMinibusEnabled,
    publicPricing,
    publicPricingLoaded,
  ]);
  const refreshAuthoritativeServerQuoteRef = useRef(refreshAuthoritativeServerQuote);
  refreshAuthoritativeServerQuoteRef.current = refreshAuthoritativeServerQuote;

  function retryAuthoritativeQuote() {
    if (!publicPricingLoaded) {
      setPublicPricingFailed(false);
      setPublicPricingAttempt((attempt) => attempt + 1);
      // Loading the current config triggers the quote effect with fresh settings.
      return;
    }
    void refreshAuthoritativeServerQuote(true);
  }

  useEffect(() => {
    quoteVehicleRef.current = quoteVehicle;
    const routeKey = [
      pickupAddress.trim(),
      dropoffAddress.trim(),
      String(effectivePassengers ?? passengers ?? ""),
      String(suitcases ?? ""),
      tripDate.trim(),
      tripTime.trim(),
      returnJourney ? "1" : "0",
      returnDate.trim(),
      returnTime.trim(),
    ].join("|");
    if (passengers == null || suitcases == null) {
      setServerFareParts(null);
      setServerQuoteUnavailable(false);
      setVehicleFareUpdating(false);
      displayedRouteKeyRef.current = null;
      return;
    }
    const cached = authoritativeFareCacheRef.current.get(
      quoteFareRequestKey({
        pickup: pickupAddress.trim(),
        dropoff: dropoffAddress.trim(),
        passengers: effectivePassengers ?? passengers,
        suitcases,
        vehicle: quoteVehicle,
        outboundDate: tripDate.trim(),
        outboundTime: tripTime.trim(),
        returnJourney,
        returnDate,
        returnTime,
      }),
    );
    if (cached) {
      setServerFareParts(cached);
      setServerQuoteUnavailable(false);
      setVehicleFareUpdating(false);
      displayedRouteKeyRef.current = routeKey;
      return;
    }
    if (displayedRouteKeyRef.current === routeKey) {
      setVehicleFareUpdating(true);
      setServerQuoteUnavailable(false);
      return;
    }
    const hadDisplayedFare = displayedRouteKeyRef.current != null;
    displayedRouteKeyRef.current = null;
    setVehicleFareUpdating(hadDisplayedFare || unsuitableFareRecoveryRef.current !== "");
    setServerFareParts(null);
    setServerQuoteUnavailable(false);
  }, [
    dropoffAddress,
    passengers,
    effectivePassengers,
    pickupAddress,
    quoteVehicle,
    returnDate,
    returnJourney,
    returnTime,
    suitcases,
    tripDate,
    tripTime,
  ]);

  const quoteRequestKey = [
    publicPricingLoaded ? "loaded" : "loading",
    canShowPrice ? "1" : "0",
    isManualQuoteJourney ? "1" : "0",
    pricingConfirmationRequired ? "1" : "0",
    isEnquiryOnly && !showGuidePrice ? "enquiry" : "price",
    pickupAddress.trim(),
    dropoffAddress.trim(),
    String(effectivePassengers ?? passengers ?? ""),
    String(suitcases ?? ""),
    quoteVehicle,
    tripDate.trim(),
    tripTime.trim(),
    returnJourney ? "1" : "0",
    returnDate.trim(),
    returnTime.trim(),
    journeyMode ?? "",
    String(passengerLimit),
    publicExecutiveEnabled ? "1" : "0",
    publicMinibusEnabled ? "1" : "0",
    pickupPlace?.placeId ?? "",
    dropoffPlace?.placeId ?? "",
  ].join("|");

  useEffect(() => {
    // Invalidate any in-flight response before this request starts, including
    // a cache hit that does not bump the generation itself.
    serverQuoteGenRef.current += 1;
    quoteFareAbortRef.current?.abort();
    const controller = new AbortController();
    quoteFareAbortRef.current = controller;
    let cancelled = false;
    quoteFareTimingRef.current.inputsAt =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    void (async () => {
      if (QUOTE_FARE_START_DELAY_MS > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, QUOTE_FARE_START_DELAY_MS));
      }
      if (cancelled || controller.signal.aborted) return;
      await refreshAuthoritativeServerQuoteRef.current(false, controller.signal);
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [quoteRequestKey]);

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
        selected: false,
        outboundSelected: outboundAccessChoice === "express",
        returnSelected: returnAccessChoice === "express",
      }),
    [effectiveAirportCode, isFromAirport, returnJourney, outboundAccessChoice, returnAccessChoice],
  );

  // Express is opt-in. Choosing an eligible airport must not add the fee.
  // Clear the free-area acknowledgement when the journey is no longer eligible.
  useEffect(() => {
    const nowEligible = resolveExpressDropOff({
      airportCode: effectiveAirportCode || null,
      fromAirport: isFromAirport,
      returnJourney,
      selected: false,
    }).eligible;

    if (!nowEligible) {
      setExpressRemovalAck(false);
      setReturnExpressRemovalAck(false);
      setExpressAckRequired(false);
      setExpressEditingLeg(null);
    }
  }, [effectiveAirportCode, isFromAirport, returnJourney]);

  // After the free Express acknowledgement is ticked, scroll Book Now into view on mobile.
  // Runs post-paint (not inside the checkbox event) so iOS cannot immediately undo the scroll.
  useEffect(() => {
    const eitherAck = expressRemovalAck || returnExpressRemovalAck;
    const justChecked = eitherAck && !expressRemovalAckWasCheckedRef.current;
    expressRemovalAckWasCheckedRef.current = eitherAck;
    if (!justChecked) return;

    const isMobile = isMobileDevice ?? detectMobileDevice();
    if (!isMobile) return;

    return scheduleScrollToBookNowAfterExpressAck();
  }, [expressRemovalAck, returnExpressRemovalAck, isMobileDevice]);

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

  const airportAccessQuote = useMemo(
    () =>
      quoteAirportAccessCharges({
        expressLegs: expressSelection.legs,
        airportCode: effectiveAirportCode || null,
        fromAirport: isFromAirport,
        returnJourney,
        isAirportToAirport: isAirportToAirportJourney,
        pickupAirportCode,
        dropoffAirportCode,
        outboundChoice: quoteStep === 1 ? "free" : outboundAccessChoice,
        returnChoice: quoteStep === 1 ? "free" : returnAccessChoice,
        fees: publicPricing.meetGreet,
        terminalAccessFees: publicPricing.terminalAccess,
        visitChoices: quoteStep === 1 ? {} : terminalAccessChoices,
        meetGreetIncluded: isExecutiveVehicle(quoteVehicle),
      }),
    [
      expressSelection.legs,
      effectiveAirportCode,
      isFromAirport,
      returnJourney,
      isAirportToAirportJourney,
      pickupAirportCode,
      dropoffAirportCode,
      outboundAccessChoice,
      returnAccessChoice,
      publicPricing.meetGreet,
      publicPricing.terminalAccess,
      terminalAccessChoices,
      quoteStep,
      quoteVehicle,
    ],
  );

  const bookingMeetGreetAirport = isFromAirport
    ? normaliseMeetGreetAirport(pickupAirportCode || effectiveAirportCode) : null;
  const bookingMeetGreetEligible = bookingMeetGreetAirport === "DUB" &&
    useOpenWebsitePromoPricing && !isExecutiveVehicle(quoteVehicle);
  const bookingMeetGreetPrice = meetGreetFeeGbp(bookingMeetGreetAirport, publicPricing.meetGreet);
  const bookingMeetGreetActive = bookingMeetGreetEligible && bookingMeetGreetSelected && quoteStep > 1;
  const bookingMeetGreetCharge = bookingMeetGreetActive ? bookingMeetGreetPrice : 0;
  useEffect(() => {
    setBookingMeetGreetSelected(Boolean(restoredQuote?.journey.optionalMeetGreetSelected &&
      pickupAddress === restoredQuote.journey.pickupLabel && dropoffAddress === restoredQuote.journey.dropoffLabel &&
      quoteVehicle === restoredQuote.journey.vehicle));
  }, [pickupAddress, dropoffAddress, quoteVehicle, restoredQuote]);

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

  const currentServerFareParts = serverFareAppliesToParty(serverFareParts, {
    passengers,
    suitcases,
    vehicleType: quoteVehicle,
    outboundDate: tripDate,
    outboundTime: tripTime,
    returnJourney,
    returnDate,
    returnTime,
  })
    ? serverFareParts
    : null;

  const previewSkipsServerQuote =
    isBrowserPricingPreview() && previewMinibusQueryEnabled();
  const mayPaintNumericFare = mayPaintAuthoritativeFare({
    serverFareReady: currentServerFareParts != null,
    publicPricingLoaded,
    serverQuoteUnavailable,
    previewSkipsServer: previewSkipsServerQuote,
  });
  /** Numeric £ only. Must not gate mounting the results UI. */
  const authoritativeFareReady = mayPaintNumericFare;
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !authoritativeFareReady) return;
    const started = quoteFareTimingRef.current.inputsAt;
    if (!started) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    console.info("[quote-fare] G rendered", { msFromInputs: Math.round(now - started) });
  }, [authoritativeFareReady]);

  const journeyFareParts = useMemo(() => {
    // Prefer Worker-authoritative split only when it belongs to this vehicle/party.
    // Stale Saloon/Estate splits must never paint on the newly selected vehicle.
    if (currentServerFareParts) {
      const fixedFromLines =
        airportFeeResolution.lines.length > 0
          ? airportFeeResolution.totalAppliedGbp
          : currentServerFareParts.airportFixedCostsGbp;
      return {
        journeyFareGbp: currentServerFareParts.journeyFareGbp,
        airportFixedCostsGbp: fixedFromLines,
        nightWeekendSurchargeGbp: currentServerFareParts.nightWeekendSurchargeGbp ?? 0,
      };
    }
    // Default pricing includes the 10% Night & Weekend surcharge before the
    // public config or worker quote has settled. Do not paint that interim total.
    if (!mayPaintNumericFare || !liveQuote || typeof liveQuote.amount !== "number") {
      return {
        journeyFareGbp: null as number | null,
        airportFixedCostsGbp: 0,
        nightWeekendSurchargeGbp: 0,
      };
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
    const surcharge =
      typeof liveQuote.nightWeekendSurchargeGbp === "number" &&
      Number.isFinite(liveQuote.nightWeekendSurchargeGbp)
        ? Math.max(0, Math.round(liveQuote.nightWeekendSurchargeGbp * 100) / 100)
        : 0;
    return {
      journeyFareGbp: journey,
      airportFixedCostsGbp: fixed,
      nightWeekendSurchargeGbp: surcharge,
    };
  }, [liveQuote, airportFeeResolution, currentServerFareParts, mayPaintNumericFare]);

  const configuredSurchargeLabel = currentServerFareParts?.nightWeekendSurchargeLabel ?? nightWeekendSurchargeLabel(publicPricing, [tripDate, journeyMode === "return" ? returnDate : undefined]);
  const configuredSurchargeExplanation = currentServerFareParts?.nightWeekendSurchargeExplanation ?? nightWeekendSurchargeExplanation(publicPricing);

  const openWebsiteFareBreakdown = useMemo(() => {
    if (!useOpenWebsitePromoPricing || journeyFareParts.journeyFareGbp == null) {
      return null;
    }
    const applyReturnOffer =
      Boolean(returnOfferToken) &&
      !returnJourney &&
      isReturnOfferAirportJourney(pickupAddress, dropoffAddress);
    const businessClass = isExecutiveVehicle(quoteVehicle);
    return buildOpenWebsiteFareBreakdown({
      preserveFixedFarePence: (currentServerFareParts?.preserveBfsMinimumPence ?? liveQuote?.preserveBfsMinimumPence ?? false) || postcodeFareHasPence({ enabled: publicPricing.postcodePricingEnabled, rules: publicPricing.postcodeRules, context: { address: isFromAirport ? dropoffAddress : pickupAddress, airportCode: effectiveAirportCode, fromAirport: isFromAirport }, vehicle: quoteVehicle, estateSupplement: publicPricing.estate.upliftGbp, returnJourney }),
      journeyFareBeforeAirportAccessGbp: journeyFareParts.journeyFareGbp,
      airportFixedCostsGbp: journeyFareParts.airportFixedCostsGbp,
      nightWeekendSurchargeGbp: journeyFareParts.nightWeekendSurchargeGbp ?? 0,
      nightWeekendSurchargeLabel: configuredSurchargeLabel,
      nightWeekendSurchargeExplanation: configuredSurchargeExplanation,
      airportAccessChargeGbp: airportAccessQuote.airportAccessChargeGbp,
      outboundAirportAccessChargeGbp: airportAccessQuote.outboundAirportAccessChargeGbp,
      returnAirportAccessChargeGbp: airportAccessQuote.returnAirportAccessChargeGbp,
      returnJourney,
      ...(applyReturnOffer
        ? { returnOfferDiscountRate: RETURN_OFFER_CONFIG.discountRate }
        : {}),
      ...(businessClass
        ? {
            businessClassMinimumFareGbp:
              publicPricing.executive?.minimumFareGbp ??
              DEFAULT_BUSINESS_CLASS_MINIMUM_FARE_GBP,
            outboundOneWayBeforeAccessGbp:
              currentServerFareParts?.outboundOneWayBeforeAccessGbp ??
              liveQuote?.outboundOneWayBeforeAccessGbp,
            returnOneWayBeforeAccessGbp:
              currentServerFareParts?.returnOneWayBeforeAccessGbp ??
              liveQuote?.returnOneWayBeforeAccessGbp,
            returnDiscountRate: publicPricing.returnDiscount?.rate,
          }
        : {}),
    });
  }, [
    useOpenWebsitePromoPricing,
    configuredSurchargeLabel,
    configuredSurchargeExplanation,
    journeyFareParts.journeyFareGbp,
    journeyFareParts.airportFixedCostsGbp,
    journeyFareParts.nightWeekendSurchargeGbp,
    airportAccessQuote.airportAccessChargeGbp,
    airportAccessQuote.outboundAirportAccessChargeGbp,
    airportAccessQuote.returnAirportAccessChargeGbp,
    returnJourney,
    returnOfferToken,
    pickupAddress,
    dropoffAddress,
    quoteVehicle,
    publicPricing.executive?.minimumFareGbp,
    publicPricing.returnDiscount?.rate,
    publicPricing.postcodeRules,
    publicPricing.postcodePricingEnabled,
    publicPricing.estate.upliftGbp,
    effectiveAirportCode,
    isFromAirport,
    currentServerFareParts?.preserveBfsMinimumPence,
    liveQuote?.preserveBfsMinimumPence,
    currentServerFareParts?.outboundOneWayBeforeAccessGbp,
    currentServerFareParts?.returnOneWayBeforeAccessGbp,
    liveQuote?.outboundOneWayBeforeAccessGbp,
    liveQuote?.returnOneWayBeforeAccessGbp,
  ]);

  const transferFareGbp = useMemo(() => {
    if (testChargeAmount != null) return testChargeAmount;
    if (appliedPersonalQuote && typeof appliedPersonalQuote.agreedAmount === "number") {
      return appliedPersonalQuote.agreedAmount;
    }
    if (openWebsiteFareBreakdown) {
      return openWebsiteFareBreakdown.transferFareAfterPromotionsGbp;
    }
    if (!mayPaintNumericFare) return null;
    return liveQuote?.amount ?? null;
  }, [
    testChargeAmount,
    appliedPersonalQuote,
    openWebsiteFareBreakdown,
    liveQuote?.amount,
    mayPaintNumericFare,
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
      expressDropOffFeeGbp: expressSelection.eligible
        ? expressSelection.feeIfSelectedGbp
        : 0,
    });
  }, [
    openWebsiteFareBreakdown,
    transferFareGbp,
    testChargeAmount,
    expressSelection.feeIfSelectedGbp,
    expressSelection.eligible,
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
    !ownerNoAvailabilityBlocked &&
    (!smartAvailabilityBlocked || isMinimumNoticeRequest);

  /**
   * Results mount as soon as the customer selections are complete.
   * The numeric fare stays behind authoritativeFareReady and shows Calculating…
   * until then. Distance and the worker fare must not hold this back.
   */
  const instantPriceExpected =
    canShowPrice &&
    !appliedPersonalQuote &&
    testChargeAmount == null &&
    !isManualQuoteJourney &&
    !pricingConfirmationRequired &&
    !(isEnquiryOnly && !showGuidePrice);
  const authoritativeQuoteFailed =
    instantPriceExpected &&
    (publicPricingFailed || serverQuoteUnavailable) &&
    !previewSkipsServerQuote &&
    currentServerFareParts == null;
  const resultsCanRender =
    quoteChoicesReady &&
    hasQuoteRoute &&
    scheduleReadyForQuote &&
    (presentation !== "homepage" || homepagePriceRequested) &&
    (instantPriceExpected ||
      Boolean(liveQuote) ||
      pricingConfirmationRequired ||
      isManualQuoteJourney ||
      exceedsOnlineCapacity ||
      isEnquiryOnly);
  const quoteResultsReady = resultsCanRender;
  useEffect(() => {
    if (!quoteResultsReady || quoteStep !== 1) setDesktopJourneyEditing(false);
  }, [quoteResultsReady, quoteStep]);
  /**
   * Desktop checkout (1200px+): the navy panel is sticky with no inner scrollbar. When it is
   * taller than the screen (e.g. a return with extra options), CSS uses this height to let it
   * scroll with the page until its foot (total, terms, Pay) is in view, then hold it there.
   * Sets one CSS variable on the panel; no layout or booking logic.
   */
  useEffect(() => {
    if (presentation !== "homepage" || quoteStep < 2 || typeof window === "undefined") return;
    if (typeof ResizeObserver === "undefined") return;
    const aside = document.querySelector<HTMLElement>(":is(.homepage-hero, [data-hub-quote]) [data-checkout-aside]");
    if (!aside) return;
    const update = () => aside.style.setProperty("--co-aside-h", `${Math.ceil(aside.offsetHeight)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(aside);
    return () => {
      observer.disconnect();
      aside.style.removeProperty("--co-aside-h");
    };
  }, [presentation, quoteStep]);

  // Desktop vehicle step: remember which Meet & Greet upgrades were offered under the vehicles,
  // so checkout does not offer the same upgrade a second time (hidden by desktop CSS only).
  const [vehicleStepMeetGreetKeys, setVehicleStepMeetGreetKeys] = useState("");
  useEffect(() => {
    if (presentation !== "homepage" || quoteStep !== 1 || !quoteResultsReady) return;
    const keys = desktopMeetGreetUpgrades().map((upgrade) => upgrade.key).join(",");
    setVehicleStepMeetGreetKeys((current) => (current === keys ? current : keys));
  });
  const offeredAtVehicleStep = (key: string) => vehicleStepMeetGreetKeys.split(",").includes(key);

  // Desktop vehicle step: publish the navy summary's height so its sticky offset can keep the
  // bottom (Continue to booking) reachable when it is taller than the window (CSS: --rc-h).
  useEffect(() => {
    if (presentation !== "homepage" || quoteStep !== 1 || !quoteResultsReady || typeof window === "undefined") return;
    if (typeof ResizeObserver === "undefined") return;
    const card = document.querySelector<HTMLElement>(":is(.homepage-hero, [data-hub-quote]) [data-quote-result-card]");
    if (!card) return;
    const update = () => card.style.setProperty("--rc-h", `${Math.ceil(card.offsetHeight)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(card);
    return () => {
      observer.disconnect();
      card.style.removeProperty("--rc-h");
    };
  }, [presentation, quoteStep, quoteResultsReady]);

  /** Customer-facing stages: 1 journey details, 2 your quote, 3 complete your booking. */
  const quoteProgressStep = quoteStep >= 2 ? 3 : quoteResultsReady ? 2 : 1;

  const addressesReadyForRoute = isA2AFlow
    ? isPlaceSelected(pickupPlace) && isPlaceSelected(dropoffPlace)
    : hasQuoteRoute;

  function clearDownstreamQuoteChoices() {
    if (presentation === "homepage") {
      setHomepagePriceRequested(false);
    } else {
      setJourneyMode(null);
      setPassengers(null);
      setSuitcases(null);
      setExactPassengers(null);
    }
    setChooseMinibus(false);
    setChooseExecutive(false);
    setChooseEstate(false);
    setManualVehicle(null);
    customerPickedVehicleRef.current = false;
    preferMinibusPartyKeyRef.current = "";
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
    // Only confirmed selections reach here; use the airport-aware display label.
    // Free typing returns above, preserving spaces after house numbers.
    const display = placeDisplayText(place);
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
    const display = placeDisplayText(place);
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

  function swapHomepageLocations() {
    const nextPickupPlace = dropoffPlace;
    const nextDropoffPlace = pickupPlace;
    const nextPickupAddress = dropoffAddress;
    const nextDropoffAddress = pickupAddress;
    setPickupPlace(nextPickupPlace);
    setDropoffPlace(nextDropoffPlace);
    setPickupAddress(nextPickupAddress);
    setDropoffAddress(nextDropoffAddress);
    setPickupPlaceError("");
    setDropoffPlaceError("");
    setPickupRestoredHint(false);
    setDropoffRestoredHint(false);
    if (isQuoteReadyPlace(nextPickupPlace)) {
      saveConfirmedPickupPlace(nextPickupPlace);
    } else {
      clearConfirmedPickupPlace();
    }
    if (isQuoteReadyPlace(nextDropoffPlace)) {
      saveConfirmedDropoffPlace(nextDropoffPlace);
    } else {
      clearConfirmedDropoffPlace();
    }
    setRouteMetrics(null);
    setServerFareParts(null);
  }

  function focusHomepageScheduleError() {
    window.setTimeout(() => {
      const target = !tripDate.trim()
        ? tripDateInputRef.current
        : !tripTime.trim()
          ? tripTimeInputRef.current
          : !isTripDateOnOrAfterToday(tripDate)
            ? tripDateInputRef.current
            : !isTripDateTimeNotInPast(tripDate, tripTime)
              ? tripTimeInputRef.current
              : returnJourney && !returnDate.trim()
                ? returnDateInputRef.current
                : returnJourney && !returnTime.trim()
                  ? returnTimeInputRef.current
                  : returnJourney && !isReturnAfterOutbound(tripDate, tripTime, returnDate, returnTime)
                    ? returnDateInputRef.current
                    : tripDateInputRef.current;
      target?.focus({ preventScroll: true });
    }, 0);
  }

  function requestHomepagePrice(): boolean {
    if (presentation !== "homepage" || !homepageQuoteReady) return false;
    if (journeyMode == null && design2Home) {
      setJourneyMode("one-way");
    } else if (journeyMode == null) {
      setSubmitError("Choose One Way or Return to continue.");
      return false;
    }
    if (!validateA2APlaces()) {
      window.setTimeout(() => {
        focusFirstInvalidField(cardRef.current ?? document);
      }, 0);
      return false;
    }
    if (!partySelectionReady) {
      if (passengers == null) setPassengersError(QUOTE_REQUIRED_FIELD_MESSAGES.passengers);
      if (suitcases == null) setSuitcasesError(QUOTE_REQUIRED_FIELD_MESSAGES.suitcases);
      return false;
    }
    if (!isScheduleComplete && (!design2Home || mobileDesign3)) {
      validateTripForBooking();
      focusHomepageScheduleError();
      return false;
    }
    const classified = classifyVerifiedJourney(pickupPlace, dropoffPlace);
    if (classified) {
      setJourneyIntent(classified.intent);
      setTripDirection(classified.direction);
      setIntentAirportCode(classified.airport);
      setAirportCode(classified.airport);
      setTripMode("address");
    }
    setSubmitError("");
    hadRouteSummaryScrollRef.current = false;
    setHomepagePriceRequested(true);
    return true;
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
          const display = placeDisplayText(place);
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
          const display = placeDisplayText(place);
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

  /** Booking gate: a town-centre guide pickup must be replaced by the full address. */
  function blockTownGuidePickupBooking(): boolean {
    if (!isTownGuidePickup) return false;
    // Back to the journey form with an empty pickup box, ready for the full address.
    if (quoteStep !== 1) navigateQuoteStep(1);
    if (presentation === "homepage") setHomepagePriceRequested(false);
    handlePickupChange("");
    setPickupPlaceError(TOWN_GUIDE_PICKUP_MESSAGE);
    window.setTimeout(() => {
      focusFirstInvalidField(cardRef.current ?? document);
    }, 60);
    return true;
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
        : placeDisplayText(pickupPlace) || pickupAddress.trim()
      : placeDisplayText(pickupPlace) || pickupAddress.trim();

  const dropoffLabel = isA2AFlow
    ? placeDisplayText(dropoffPlace) || dropoffAddress.trim()
    : isAirportTrip
      ? isFromAirport
        ? placeDisplayText(dropoffPlace) || dropoffAddress.trim()
        : airportName
      : placeDisplayText(dropoffPlace) || dropoffAddress.trim();

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

  function applyQuoteAvailabilityResult(result: CustomerSmartAvailabilityCheckResult): boolean {
    if (result.ownerAvailability?.blocked) {
      setOwnerNoAvailabilityBlocked(true);
      setSmartAvailabilityBlocked(false);
      setAvailabilityAlternatives([]);
      setPaymentError(result.ownerAvailability.customerMessage || OWNER_NO_AVAILABILITY_MESSAGE);
      return true;
    }
    setOwnerNoAvailabilityBlocked(false);
    setPaymentError((prev) => (isClosedAvailabilityError(prev) ? "" : prev));
    return applyCustomerAvailabilityResult(result);
  }

  function applyCustomerAvailabilityResult(result: CustomerSmartAvailabilityCheckResult): boolean {
    if (result.blocked && !isMinimumNoticeRequest) {
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
    return applyQuoteAvailabilityResult(result);
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
      applyQuoteAvailabilityResult(result);
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
        scrollQuoteStage(field);
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
        scrollQuoteStage(field);
      }
    }, 80);
  }

  useEffect(() => {
    if (!pickupLabel.trim() || !dropoffLabel.trim() || !tripDate.trim() || !tripTime.trim()) {
      if (smartAvailabilityBlocked || ownerNoAvailabilityBlocked) {
        setSmartAvailabilityBlocked(false);
        setOwnerNoAvailabilityBlocked(false);
        setAvailabilityAlternatives([]);
        setPaymentError((prev) =>
          isCustomerSmartAvailabilityBlockMessage(prev) || isClosedAvailabilityError(prev)
            ? ""
            : prev,
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
        applyQuoteAvailabilityResult(result);
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
    // One quoteTransactionId per customer quote session. Luggage / vehicle /
    // Express / return changes must upsert the same daily-report record.
    if (!quoteCalculationFingerprint) {
      quoteCalculationFingerprintRef.current = "";
      return;
    }
    quoteCalculationFingerprintRef.current = quoteCalculationFingerprint;
    if (quoteTransactionId) return;
    setQuoteTransactionId(
      createQuoteTransactionId(pageType === "emerge_belfast" ? "emerge" : "quote"),
    );
  }, [pageType, quoteCalculationFingerprint, quoteTransactionId]);

  useEffect(() => {
    if (!liveQuote || bookingSent) {
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
      estimatedPrice: formatQuote(pricedFare?.totalGbp ?? liveQuote.amount),
      journeyDistance: journeyDistanceLabel || undefined,
      journeyDuration: journeyDurationLabel || undefined,
      isAirportTrip,
      quoteTransactionId,
      airportCode: effectiveAirportCode || undefined,
      journeyFareGbp: journeyFareParts.journeyFareGbp ?? undefined,
      airportAccessOption: websiteAirportAccessLeadLabel(expressSelection),
      airportAccessFeeGbp: expressSelection.feeGbp,
      totalGbp: pricedFare?.totalGbp ?? liveQuote.amount,
      source: "website",
    });
  }, [
    bookingSent,
    dropoffLabel,
    effectiveAirportCode,
    effectivePassengers,
    expressSelection.eligible,
    expressSelection.feeGbp,
    expressSelection.legs.length,
    expressSelection.selected,
    expressSelection.service,
    isAirportTrip,
    isFromAirport,
    journeyDistanceLabel,
    journeyDurationLabel,
    journeyFareParts.journeyFareGbp,
    liveQuote,
    pickupLabel,
    pricedFare?.totalGbp,
    quoteVehicle,
    returnDate,
    returnJourney,
    returnTime,
    quoteTransactionId,
    suitcases,
    tripDate,
    tripTime,
  ]);

  /**
   * Airport-pickup flight numbers are required (format-valid) when completing a
   * booking, after any manual vehicle quote approval. Soft AeroDataBox failures do not block;
   * blank / malformed / hard lookup errors do.
   */
  function focusInvalidFlightNumber() {
    window.setTimeout(() => {
      const root = document.getElementById("step2-flight-details") ??
        document.getElementById("step3-flight-details");
      focusFirstInvalidField(root);
    }, 0);
  }

  function validateRequiredFlightNumbers(): boolean {
    let ok = true;

    if (needsOutboundFlightNumber) {
      const trimmed = goingFlightNumber.trim();
      // Optional at booking (owner, Nov 2026): customers can add it later in
      // Manage Booking. Only a typed, invalid number blocks.
      if (!trimmed) {
        setGoingFlightError("");
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
        setCollectionFlightError("");
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
      setEmailAddressError(emailTypoSuggestion(customerEmail) ? `Please check your email address — did you mean ${emailTypoSuggestion(customerEmail)}?` : QUOTE_REQUIRED_FIELD_MESSAGES.emailInvalid);
      ok = false;
    } else {
      setEmailAddressError("");
    }

    if (bookingChildSeats > 0 && !childSeatNotes.trim()) {
      setChildSeatNotesError(QUOTE_REQUIRED_FIELD_MESSAGES.childSeatNotes);
      ok = false;
    } else {
      setChildSeatNotesError("");
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
      suitcasesExact: isFivePlusLuggage(suitcases as number) ? false : true,
      childSeats: bookingChildSeats,
      childSeatNotes: bookingChildSeats > 0 ? childSeatNotes.trim() : undefined,
      vehicle: quoteVehicle,
      estimatedPrice: bookingMeetGreetActive && liveQuote ? formatQuote((pricedFare?.totalGbp ?? liveQuote.amount) + bookingMeetGreetCharge) : estimatedPrice,
      journeyDistance: journeyDistanceLabel || undefined,
      journeyDuration: journeyDurationLabel || undefined,
      isAirportTrip: isAirportTrip || Boolean(journeyKind && journeyKind !== "address-to-address"),
      airportCode: effectiveAirportCode || undefined,
      isFromAirport: isAirportTrip || isFromAirport ? isFromAirport : undefined,
      ...(journeyKind ? { journeyKind } : {}),
      ...(pickupAirportCode ? { pickupAirportCode } : {}),
      ...(dropoffAirportCode ? { dropoffAirportCode } : {}),
      ...(isAirportToAirportJourney ? { isAirportToAirport: true } : {}),
      quoteTransactionId: quoteTransactionId || undefined,
      pickupPlaceId: pickupPlace?.placeId?.trim() || undefined,
      dropoffPlaceId: dropoffPlace?.placeId?.trim() || undefined,
      expressDropOffSelected: airportAccessQuote.expressDropOffSelected,
      expressDropOffFee: airportAccessQuote.expressDropOffFee,
      expressDropOffAirport: airportAccessQuote.expressDropOffAirport,
      meetGreetFeeGbp: bookingMeetGreetActive ? bookingMeetGreetCharge : undefined,
      airportAccessOption: bookingMeetGreetActive ? "meet-greet" : airportAccessQuote.airportAccessOption ?? undefined,
      outboundExpressDropOffSelected: airportAccessQuote.outboundAirportAccessOption
        ? airportAccessQuote.outboundExpressDropOffSelected
        : undefined,
      returnExpressDropOffSelected: airportAccessQuote.returnAirportAccessOption
        ? airportAccessQuote.returnExpressDropOffSelected
        : undefined,
      terminalAccessChoices,
      terminalAccessVisits: airportAccessQuote.legs,
      outboundAirportAccessOption: airportAccessQuote.outboundAirportAccessOption ?? undefined,
      returnAirportAccessOption: airportAccessQuote.returnAirportAccessOption ?? undefined,
      outboundAirportAccessChargeGbp: airportAccessQuote.outboundAirportAccessChargeGbp,
      returnAirportAccessChargeGbp: airportAccessQuote.returnAirportAccessChargeGbp,
      ...(openWebsiteFareBreakdown
        ? { ...promoFieldsFromFareBreakdown(openWebsiteFareBreakdown), finalAmountPayableGbp: Math.round((openWebsiteFareBreakdown.finalAmountPayableGbp + bookingMeetGreetCharge) * 100) / 100 }
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
      ...(heardAbout ? { heardAbout } : {}),
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
            amount: (pricedFare?.totalGbp ?? liveQuote.amount) + (bookingMeetGreetActive ? bookingMeetGreetCharge : 0),
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
      outboundAirportAccessChoice: outboundAccessChoice,
      returnAirportAccessChoice: returnAccessChoice,
      pickupPlaceId: pickupPlace?.placeId || undefined,
      pickupPlaceName: pickupPlace?.placeName || undefined,
      pickupCountryCode: pickupPlace?.countryCode || undefined,
      pickupPostalCode: pickupPlace?.postalCode || undefined,
      pickupStreetNumber: pickupPlace?.streetNumber || undefined,
      dropoffPlaceName: dropoffPlace?.placeName || undefined,
      dropoffCountryCode: dropoffPlace?.countryCode || undefined,
      dropoffPostalCode: dropoffPlace?.postalCode || undefined,
      dropoffStreetNumber: dropoffPlace?.streetNumber || undefined,
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
      optionalMeetGreetSelected: bookingMeetGreetActive,
      terminalAccessChoices,
      tripDate: date,
      tripTime: time,
      returnJourney,
      returnDate: returnJourney ? retDate : undefined,
      returnTime: returnJourney ? retTime : undefined,
      passengers: details.passengers,
      suitcases: details.suitcases,
      childSeats: details.childSeats,
      childSeatNotes: details.childSeatNotes,
      vehicle: details.vehicle,
      flightNumber: details.flightNumber || undefined,
      returnFlightNumber: details.returnFlightNumber || undefined,
      tripLabel: details.tripLabel,
      journeyDistance: details.journeyDistance,
      journeyDuration: details.journeyDuration,
    });
  }

  /** Open Save Quote when a live payable fare exists — date/time are optional. */
  function handleSaveQuoteClick(channel?: "email" | "whatsapp") {
    if (!saveQuoteSettings.enabled || !(saveQuoteSettings.emailEnabled || saveQuoteSettings.whatsappEnabled)) return;
    setSaveQuotePrompt("");
    const schedule = syncScheduleFieldsFromInputs();
    const built = buildSaveQuotePayload(schedule);
    if (built.ok) {
      if (channel === "whatsapp" && saveQuoteSettings.whatsappEnabled) {
        const request = saveQuote({ ...built.payload, channel: "whatsapp", customerEmail: "" });
        void request.catch(() => {}); // The modal presents the error after it mounts.
        setInitialWhatsAppRequest(request);
      } else setInitialWhatsAppRequest(null);
      setSaveQuoteOpen(true);
      return;
    }
    if (built.reason === "missing_route") {
      setSaveQuotePrompt(built.message);
      return;
    }
    setSaveQuotePrompt(built.message);
  }

  function requireTermsAccepted(): boolean {
    if (!termsAccepted) {
      setTermsError(QUOTE_REQUIRED_FIELD_MESSAGES.terms);
      return false;
    }

    setTermsError("");
    return true;
  }

  function notifyOwnerQuoteContactIfReady(event?: import("../../shared/booking-funnel").BookingFunnelEvent) {
    if (!liveQuote || !quoteTransactionId) {
      return;
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
    const notify = event
      ? (details: Parameters<typeof scheduleQuoteContactAlert>[0]) => recordBookingStage(details, event)
      : (details: Parameters<typeof scheduleQuoteContactAlert>[0]) => {
          recordBookingStage(details, "details_submitted");
          scheduleQuoteContactAlert(details);
        };
    notify({
      tripLabel,
      pickupLabel,
      dropoffLabel,
      returnJourney,
      tripDate: tripDate || undefined,
      tripTime: tripTime || undefined,
      returnDate: returnJourney ? returnDate || undefined : undefined,
      returnTime: returnJourney ? returnTime || undefined : undefined,
      passengers: effectivePassengers as number,
      suitcases: (suitcases ?? 0) as number,
      vehicle: quoteVehicle,
      estimatedPrice: formatQuote(pricedFare?.totalGbp ?? liveQuote.amount),
      isAirportTrip,
      quoteTransactionId,
      airportCode: effectiveAirportCode || undefined,
      airportAccessOption: websiteAirportAccessLeadLabel(expressSelection),
      totalGbp: pricedFare?.totalGbp ?? liveQuote.amount,
      source: "website",
      customerName,
      customerEmail,
      mobileNumber: customerMobile,
    });
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
    const vehicleLabel = vehicleShortLabel(quoteVehicle);
    const tripSummary = isAirportTrip || pickupAirportCode || dropoffAirportCode
      ? `${isFromAirport ? "Pickup from" : "Transfer to"} ${airportName} (${effectiveAirportCode})`
      : "Address-to-address transfer";
    const customer = customerName.trim();
    // Privacy: never put email/mobile in the SumUp description — KV + owner email hold those.
    const namePart = customer ? ` — ${customer}` : "";
    const prefix = testChargeAmount ? "[TEST £1] " : "";
    return `${prefix}${tripSummary} — ${vehicleLabel}${namePart}`.slice(0, 140);
  }

  const transferPaymentAmount =
    testChargeAmount ??
    (pricedFare?.totalGbp != null
      ? pricedFare.totalGbp
      : mayPaintNumericFare
        ? (liveQuote?.amount ?? null)
        : null);
  const paymentAmount = transferPaymentAmount == null ? null : Math.round((transferPaymentAmount + bookingMeetGreetCharge) * 100) / 100;
  // A saved payment link is only offered for the same journey and price (see openCheckoutForJourney).
  const openCheckoutJourneyKey = buildOpenCheckoutJourneyKey({
    pickupAddress,
    dropoffAddress,
    tripDate,
    tripTime,
    journeyMode,
    returnDate,
    returnTime,
    vehicle: quoteVehicle == null ? null : String(quoteVehicle),
    amountLabel: formatQuote(paymentAmount ?? liveQuote?.amount ?? 0),
    bookingDetails: {
      passengers: effectivePassengers ?? passengers,
      exactPassengers,
      suitcases,
      childSeats,
      childSeatNotes: childSeatNotes.trim(),
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase(),
      customerMobile: customerMobile.trim(),
      goingFlightNumber: goingFlightNumber.trim().toUpperCase(),
      collectionFlightNumber: collectionFlightNumber.trim().toUpperCase(),
      meetGreet: bookingMeetGreetActive,
      outboundAccessChoice,
      returnAccessChoice,
      terminalAccessChoices,
    },
  });
  const activeOpenCheckout = openCheckoutForJourney(openCheckout, openCheckoutJourneyKey);
  /** Desktop (1200px+) checkout only: whether the fare breakdown lines are unfolded. */
  const checkoutBreakdownShown =
    checkoutBreakdownOpen ??
    (returnJourney ||
      bookingMeetGreetCharge > 0 ||
      airportAccessQuote.airportAccessChargeGbp > 0 ||
      (journeyFareParts.nightWeekendSurchargeGbp ?? 0) > 0 ||
      (journeyFareParts.airportFixedCostsGbp ?? 0) > 0);
  useEffect(() => {
    setHomepageFareChangeAck(false);
  }, [paymentAmount]);
  const homepageQuotedBaseline = provisionalQuotedAmountRef.current;
  const homepageFareChanged =
    presentation === "homepage" &&
    homepageQuotedBaseline != null &&
    paymentAmount != null &&
    Number.isFinite(paymentAmount) &&
    Math.abs((transferPaymentAmount ?? paymentAmount) - homepageQuotedBaseline) >= 0.01;
  /** Desktop pay button styling only (validation on Pay is unchanged): what is still missing. */
  const checkoutPayMissing = [
    customerName.trim() ? null : "your full name",
    isValidMobileNumber(customerMobile) ? null : "a valid mobile number",
    isValidEmailAddress(customerEmail) ? null : "a valid email address",
    homepageFareChanged && !homepageFareChangeAck ? "confirm the updated price" : null,
    termsAccepted ? null : "agree to the terms",
  ].filter((item): item is string => Boolean(item));
  const checkoutPayReady = quoteStep >= 2 && checkoutPayMissing.length === 0;
  const checkoutPayHint = checkoutPayMissing.length === 0
    ? ""
    : `To pay, please ${(() => {
        const add = checkoutPayMissing.filter((item) => item !== "agree to the terms" && item !== "confirm the updated price");
        const parts = [add.length ? `add ${add.length > 1 ? `${add.slice(0, -1).join(", ")} and ${add[add.length - 1]}` : add[0]}` : null,
          checkoutPayMissing.includes("confirm the updated price") ? "tick to confirm the updated price" : null,
          checkoutPayMissing.includes("agree to the terms") ? "tick to agree to the terms" : null].filter(Boolean);
        return parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}` : parts[0];
      })()}.`;
  const depositCashOffer =
    depositCashSettings?.enabled === true &&
    !appliedPersonalQuote &&
    testChargeAmount == null &&
    paymentAmount != null &&
    Number.isFinite(paymentAmount)
      ? publicDepositCashOffer(paymentAmount, depositCashSettings)
      : null;
  const showDepositCashChoice =
    depositCashOffer?.eligible === true &&
    !isAvailabilityRequest;
  const selectedDepositCash =
    showDepositCashChoice && paymentMethod === PAYMENT_METHOD_DEPOSIT_CASH;
  // Pay a deposit now, balance by card 7 days before (pickup 30+ days away).
  const cardBalanceOffer =
    !appliedPersonalQuote &&
    testChargeAmount == null &&
    !isAvailabilityRequest &&
    paymentAmount != null &&
    Number.isFinite(paymentAmount) &&
    isCardBalanceDateEligible(tripDate, tripTime)
      ? calculateCardBalanceQuote(paymentAmount)
      : null;
  const showCardBalanceChoice = cardBalanceOffer?.eligible === true;
  const selectedCardBalance =
    showCardBalanceChoice && paymentMethod === PAYMENT_METHOD_DEPOSIT_CARD_BALANCE;
  const showPaymentChoice = showDepositCashChoice || showCardBalanceChoice;
  const effectivePaymentMethod: PaymentMethod = selectedDepositCash
    ? PAYMENT_METHOD_DEPOSIT_CASH
    : selectedCardBalance
      ? PAYMENT_METHOD_DEPOSIT_CARD_BALANCE
      : PAYMENT_METHOD_FULL_ONLINE;

  async function handlePayNow() {
    if (previewPaymentsDisabled()) {
      setPaymentError(PREVIEW_PAYMENTS_DISABLED_MESSAGE);
      return;
    }
    if (paymentSubmitLock.current || paymentLoading || submitted || paymentUncertain) return;
    if (blockTownGuidePickupBooking()) return;
    if (!validateCheckoutRequiredFields()) return;
    paymentSubmitLock.current = true;
    paymentNavigating.current = false;
    setPaymentLoading(true);
    setPaymentError("");
    try {
      await preparePayment();
    } catch {
      setPaymentError("We couldn't check availability. Please try again or contact us for help.");
    } finally {
      if (!paymentNavigating.current) {
        paymentSubmitLock.current = false;
        setPaymentLoading(false);
      }
    }
  }

  async function preparePayment() {
    if (!validateRequiredFlightNumbers()) {
      setPaymentError("");
      setSubmitError("");
      focusInvalidFlightNumber();
      return;
    }
    if (homepageFareChanged && !homepageFareChangeAck) {
      setSubmitError("Please confirm the updated price before you pay.");
      document.querySelector<HTMLInputElement>("[data-homepage-fare-change] input")?.focus();
      return;
    }
    if (isTooSoonPickup) {
      setPaymentError(
        isOvernightTooSoon
          ? overnightTooSoonBody()
          : tooSoonRequestBody(minimumShortNoticeLeadHours),
      );
      handleChooseAnotherTime();
      return;
    }
    if (ownerNoAvailabilityBlocked || closedAvailabilityMessage) {
      setOwnerNoAvailabilityBlocked(true);
      setPaymentError(OWNER_NO_AVAILABILITY_MESSAGE);
      return;
    }
    if (isCustomerSmartAvailabilityBlockMessage(paymentError) && !isMinimumNoticeRequest) {
      return;
    }
    if (submitted) {
      return;
    }
    if (
      showDepositCashChoice &&
      paymentMethod === PAYMENT_METHOD_DEPOSIT_CASH &&
      !cashAgreementAccepted
    ) {
      setPaymentError(CASH_AGREEMENT_REQUIRED_MESSAGE);
      return;
    }
    notifyOwnerQuoteContactIfReady();

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
          "Online payment is available when an instant fare is shown. Request to book instead and we’ll email a secure payment link once confirmed.",
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
      setPaymentError("");
      focusInvalidFlightNumber();
      return;
    }

    const availabilityBlocked = await applyCustomerSmartAvailabilityCheck();
    if (availabilityBlocked) {
      return;
    }

    if (
      !canProceedWithoutExpressDropOffLegs(expressSelection, {
        outbound: expressRemovalAck,
        return: returnExpressRemovalAck,
      })
    ) {
      setExpressAckRequired(true);
      setPaymentError(
        expressSelection.legs.some((leg) => !leg.selected && leg.service === "pick-up")
          ? "Please confirm you understand the free pick-up area before continuing without Express Pick-Up."
          : "Please confirm you understand the free drop-off area before continuing without Express Drop-Off.",
      );
      return;
    }

    if (
      (passengers != null && (passengers > passengerLimit || passengers < 1)) ||
      (suitcases != null && (suitcases > suitcaseLimit || suitcases < 0))
    ) {
      setPaymentError(PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE);
      setPassengersError(PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE);
      if (suitcases != null && suitcases > suitcaseLimit) {
        setSuitcasesError(PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE);
      }
      return;
    }

    const bookingDetails = buildConfirmedBookingDetails();
    const blockers = getPaymentBookingBlockers(bookingDetails);
    if (blockers.length > 0) {
      setPaymentError(blockers[0]);
      return;
    }

    // Persist draft + pending payment, then open SumUp. Mobile stays same-tab;
    // desktop shows the payment-ready panel and opens SumUp from Continue.
    setPaymentLoading(true);
    setPaymentError("");
    setPaymentPopupBlocked(false);

    const amountLabel = formatQuote(paymentAmount ?? liveQuote.amount);

    // Persist before SumUp opens so closing the payment tab cannot wipe the form.
    markPaymentHandoff();
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
      childSeats,
      childSeatNotes: childSeats > 0 ? childSeatNotes.trim() : "",
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
      expressDropOffSelected: outboundAccessChoice === "express",
      returnExpressDropOffSelected: returnAccessChoice === "express",
      terminalAccessChoices,
      outboundAirportAccessChoice: outboundAccessChoice,
      returnAirportAccessChoice: returnAccessChoice,
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
        meetGreetSelected: bookingMeetGreetActive,
        description: buildPaymentDescription(),
        redirectUrl: buildPaymentRedirectUrl(returnToken),
        booking: bookingDetails,
        // A payment page this tab opened earlier for a booking that has since changed.
        supersedesCheckoutId: openCheckout?.checkoutId || readReplacedCheckoutId() || undefined,
        pickupPlaceId: pickupPlace?.placeId?.trim() || undefined,
        dropoffPlaceId: dropoffPlace?.placeId?.trim() || undefined,
        expressDropOffSelected: airportAccessQuote.outboundExpressDropOffSelected,
        outboundExpressDropOffSelected: airportAccessQuote.outboundExpressDropOffSelected,
        returnExpressDropOffSelected: airportAccessQuote.returnAirportAccessOption
          ? airportAccessQuote.returnExpressDropOffSelected
          : undefined,
        terminalAccessChoices,
        outboundAirportAccessOption: airportAccessQuote.outboundAirportAccessOption ?? undefined,
        returnAirportAccessOption: airportAccessQuote.returnAirportAccessOption ?? undefined,
        ...(useOpenWebsitePromoPricing && journeyFareParts.journeyFareGbp != null
          ? {
              journeyFareGbp: journeyFareParts.journeyFareGbp,
              airportFixedCostsGbp: journeyFareParts.airportFixedCostsGbp,
              removedAirportFeeIds: isAirportToAirportJourney
                ? removedAirportFeeIds
                : [],
              acceptedFinalAmountGbp: paymentAmount ?? undefined,
              ...(currentServerFareParts?.quoteReceipt
                ? { quoteReceipt: currentServerFareParts.quoteReceipt }
                : {}),
              ...(returnOfferToken &&
              !returnJourney &&
              isReturnOfferAirportJourney(pickupAddress, dropoffAddress)
                ? { returnOfferToken }
                : {}),
            }
          : {
              acceptedFinalAmountGbp: paymentAmount ?? undefined,
              ...(currentServerFareParts?.quoteReceipt
                ? { quoteReceipt: currentServerFareParts.quoteReceipt }
                : {}),
            }),
        ...(appliedPersonalQuote && testChargeAmount === null
          ? {
              personalQuoteCode: appliedPersonalQuote.code,
              standardWebsiteAmount: liveQuote.amount,
            }
          : {}),
        ...(showPaymentChoice
          ? {
              paymentMethod: effectivePaymentMethod,
              ...(selectedDepositCash && cashAgreementAccepted
                ? { cashAgreementAccepted: true }
                : {}),
              // Terms & Conditions tick plus the payment-terms line cover agreement.
              ...(selectedCardBalance
                ? { cardBalanceAgreementAccepted: true }
                : {}),
            }
          : {}),
      });

      if (checkout.shortNotice && checkout.reference && checkout.cardHoldUrl) {
        // Stripe: the customer authorises a card hold now; the owner's approval
        // charges it and confirms the booking.
        notifyOwnerQuoteContactIfReady("payment_opened");
        paymentNavigating.current = true;
        window.location.assign(checkout.cardHoldUrl);
        return;
      }

      if (checkout.shortNotice && checkout.reference && checkout.whatsappUrl) {
        pendingShortNoticeScrollRef.current = true;
        setShortNoticeResult({
          reference: checkout.reference,
          whatsappUrl: checkout.whatsappUrl,
          amountLabel: checkout.amountLabel ?? amountLabel,
          underMinimumNotice:
            checkout.underMinimumNotice === true || isAvailabilityRequest,
          noticeHours:
            checkout.minibusNotice || isMinibusNoticeRequest
              ? checkout.minimumBookingNoticeHours ??
                checkout.minimumNoticeHours ??
                minibusMinimumBookingNoticeHours
              : checkout.minimumBookingNoticeHours ??
                checkout.minimumNoticeHours ??
                minimumBookingNoticeHours,
          luggageCapacity: checkout.luggageCapacity === true,
          minibusNotice: checkout.minibusNotice === true || isMinibusNoticeRequest,
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
        journeyKey: openCheckoutJourneyKey,
      };
      saveOpenCheckoutSession(session);

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

      const isMobile = isMobileDevice ?? detectMobileDevice();
      // Our own Stripe payment page (on this site) always opens in the same tab.
      if (isOnSitePaymentUrl(checkout.paymentUrl)) {
        notifyOwnerQuoteContactIfReady("payment_opened");
        paymentNavigating.current = true;
        window.location.assign(checkout.paymentUrl);
        return;
      }
      // Same-tab redirect — reliable on iPhone Safari / Android (no popup).
      if (isMobile) {
        notifyOwnerQuoteContactIfReady("payment_opened");
        paymentNavigating.current = true;
        window.location.assign(checkout.paymentUrl);
        return;
      }
      // Start the existing desktop handoff as soon as checkout is ready.
      // If the browser blocks the new tab, the helper redirects this tab once.
      setOpenCheckout(session);
      paymentNavigating.current = true;
      openSumUpPayment(checkout.paymentUrl);
      return;
    } catch (error) {
      paymentNavigating.current = false;
      if (error instanceof PaymentOutcomeUncertainError) {
        setPaymentUncertain(true);
        setPaymentError(PAYMENT_UNCERTAIN_MESSAGE);
        setPaymentLoading(false);
        return;
      }
      if (isPaymentVehicleUnavailableError(error)) {
        setPaymentError(error.message || PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE);
        setPaymentLoading(false);
        return;
      }
      if (isPaymentFareMismatchError(error)) {
        // Never approximate journey/fixed by subtracting Express — re-quote from the engine.
        const refreshed = await refreshAuthoritativeServerQuote(true);
        setTermsAccepted(false);
        setTermsError("Please review the updated fare and accept the terms again.");
        setPaymentError(
          refreshed
            ? error.message
            : `${error.message} We could not refresh the fixed quote automatically — please check your journey details.`,
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
      if (isPaymentOwnerNoAvailabilityError(error)) {
        setOwnerNoAvailabilityBlocked(true);
        setSmartAvailabilityBlocked(false);
        setAvailabilityAlternatives([]);
        setPaymentError(error.message || OWNER_NO_AVAILABILITY_MESSAGE);
        setPaymentLoading(false);
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

  function openSumUpPayment(paymentUrl: string) {
    notifyOwnerQuoteContactIfReady("payment_opened");
    const isMobile = isMobileDevice ?? detectMobileDevice();
    if (isOnSitePaymentUrl(paymentUrl)) {
      window.location.assign(paymentUrl);
      return;
    }
    if (isMobile) {
      window.location.assign(paymentUrl);
      return;
    }
    const handoff = openDesktopSumUpCheckout(window, paymentUrl);
    if (handoff.openedNewTab) {
      paymentNavigating.current = false;
      setPaymentLoading(false);
      setPaymentPopupBlocked(false);
      return;
    }
    // Same-tab fallback already assigned the SumUp URL. Do not navigate again.
  }

  function handleOpenPaymentAgain() {
    if (!activeOpenCheckout?.paymentUrl) {
      void handlePayNow();
      return;
    }
    setPaymentPopupBlocked(false);
    setPaymentError("");
    setPaymentLoading(true);
    openSumUpPayment(activeOpenCheckout.paymentUrl);
  }

  function handleReturnToEditBooking() {
    const next = applyCancelPaymentReturnToQuote({
      quoteStep,
      openCheckout,
      paying: paymentLoading,
      childSeats,
      childSeatNotes,
    });
    clearOpenCheckoutSession();
    setOpenCheckout(next.openCheckout as OpenCheckoutSession | null);
    setPaymentLoading(next.paying);
    setPaymentError("");
    setPaymentPopupBlocked(false);
    setSubmitError("");
    setBookingSent(false);
    navigateQuoteStep(next.quoteStep as QuoteStepNavTarget);
    scrollQuoteStage(routeSummaryRef.current ?? "quote-route-summary");
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
    setQuoteActionOpen(null);
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
        ? placeDisplayText(confirmedInitialPickup)
        : nextDirection === "from-airport" && airportPlace
          ? placeDisplayText(airportPlace)
          : nextDirection === "to-airport"
            ? initialAddressHint
            : "",
    );
    setDropoffAddress(
      confirmedInitialDropoff
        ? placeDisplayText(confirmedInitialDropoff)
        : initialDropoffHint ||
          (nextDirection === "to-airport" && airportPlace
            ? placeDisplayText(airportPlace)
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
    setJourneyMode(returnOfferToken || presentation === "homepage" ? "one-way" : null);
    setHomepagePriceRequested(false);
    setHomepageFareChangeAck(false);
    provisionalQuotedAmountRef.current = null;
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
    setChooseMinibus(false);
    setChooseExecutive(false);
    setChooseEstate(false);
    setManualVehicle(null);
    customerPickedVehicleRef.current = false;
    preferMinibusPartyKeyRef.current = "";
    setTerminalAccessChoices({});
    setOutboundAccessChoice("free");
    setReturnAccessChoice("free");
    setExpressRemovalAck(false);
    setReturnExpressRemovalAck(false);
    setExpressAckRequired(false);
    setExpressEditingLeg(null);
    setPassengers(null);
    setSuitcases(null);
    setHomepageCapacityConfirmed(false);
    setExactPassengers(null);
    setChildSeats(0);
    setChildSeatNotes("");
    setChildSeatNotesError("");
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
    Boolean(collectionFlightError.trim());

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
    if (paymentError.trim() && canPayNowOnline && liveQuote && quoteStep >= 2) {
      return "payment-actions";
    }
    if (paymentError.trim() && !(canPayNowOnline && liveQuote)) {
      return "payment-early";
    }
    if (submitError.trim()) {
      return "submit";
    }
    if (paymentPopupBlocked && quoteStep >= 2) {
      return "payment-actions";
    }
    if (quoteStep === 3) {
      return "step3";
    }
    if (quoteStep === 2) {
      return "step3";
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
      return "step3";
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
        appearance={placement === "results" ? "card" : placement === "step3" ? "quiet" : "default"}
      />
    );
  }

  async function confirmBooking(delivery: BookingDelivery) {
    if (submitted || bookingSent) {
      return;
    }
    if (blockTownGuidePickupBooking()) {
      return;
    }
    if (!validateCheckoutRequiredFields()) {
      return;
    }
    if (previewNotificationsDisabled()) {
      setSubmitError(PREVIEW_NOTIFICATIONS_DISABLED_MESSAGE);
      return;
    }
    notifyOwnerQuoteContactIfReady();

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
          : isVehiclePersonalQuote
            ? `${vehicleShortLabel(quoteVehicle)} personal quote request — ${details.customerName}`
          : journeyKind === "address-to-address"
            ? `Address-to-Address quote request — ${details.customerName}`
          : isOutOfAreaPickupJourney
          ? `Out-of-area pickup quote request — ${details.customerName}`
          : isRoiJourney
            ? `ROI long-distance quote request — ${details.customerName}`
            : `New vehicle enquiry — ${details.customerName}`;

        // Persist every manual-quote request into Owner dashboard (A2A Quotes → Awaiting),
        // including out-of-area pickups to an airport (e.g. Downpatrick → Dublin Airport),
        // so the Owner can enter a price and send the payment link.
        let quoteRequestReference = "";
        if (isVehiclePersonalQuote || isManualQuoteJourney) {
          try {
            const { createA2aQuoteRequest } = await import("@/lib/a2a-quote-api");
            const created = await createA2aQuoteRequest({
              ...details,
              estimatedPrice: null,
              isAirportTrip:
                isVehiclePersonalQuote || journeyKind !== "address-to-address"
                  ? details.isAirportTrip
                  : false,
            });
            if (created.reference) {
              reference = created.reference;
              quoteRequestReference = created.reference;
            }
          } catch (persistErr) {
            console.error("A2A quote request persist failed", persistErr);
            if (isVehiclePersonalQuote) throw persistErr;
          }
        }

        // Personalised quote requests always go through the website (Owner A2A Quotes).
        // WhatsApp remains a help option in the site chrome — not a submit channel here.
        if (isManualQuoteJourney || !isMobile || delivery === "email") {
          const emailRef = await submitEnquiryByEmail({
            customerName: details.customerName,
            message: enquiryMessage,
            subject,
            booking: quoteRequestReference
              ? { ...details, a2aQuoteReference: quoteRequestReference }
              : details,
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
        `We couldn't send your request. Please try again or contact ${SITE.email} with your trip details.`,
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

  async function submitCheckoutForm() {
    setSubmitError("");
    if (
      presentation === "homepage" &&
      homepageFareChanged &&
      !homepageFareChangeAck
    ) {
      setSubmitError("Please confirm the updated price before you pay.");
      return;
    }
    const schedule = syncScheduleFieldsFromInputs();
    if (!validateTripForBooking(schedule)) {
      window.setTimeout(() => {
        focusFirstInvalidField(cardRef.current ?? document);
      }, 0);
      return;
    }
    if (!validateRequiredFlightNumbers()) {
      focusInvalidFlightNumber();
      return;
    }
    if (canPayNowOnline && liveQuote && !isEnquiryOnly && !showsRequestQuoteFlow) {
      await handlePayNow();
      return;
    }
    if (!validateCheckoutRequiredFields()) {
      return;
    }
    const blocked = await applyCustomerSmartAvailabilityCheck();
    if (blocked) {
      return;
    }
    if (!usesWhatsApp || isManualQuoteJourney) {
      await confirmBooking("email");
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
        if (presentation !== "homepage" && !journeyIntent) {
          failStep1("missing_journey_intent", "Please choose where you are travelling.");
          return;
        }
        if (
          presentation !== "homepage" &&
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
      if (blockTownGuidePickupBooking()) {
        trackQuoteValidationError("town_guide_pickup", quoteFunnelParams({ cta: step1Cta }));
        return;
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
        (passengers > passengerLimit || passengers < 1)
      ) {
        setPassengersError(PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE);
        failStep1(
          "invalid_passengers",
          publicMinibusEnabled
            ? publicPassengerLimitMessage(true)
            : PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE,
        );
        return;
      }
      if (
        suitcases != null &&
        (suitcases < 0 || suitcases > suitcaseLimit)
      ) {
        setSuitcasesError(PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE);
        failStep1(
          "invalid_suitcases",
          publicMinibusEnabled
            ? publicSuitcaseLimitMessage(true)
            : PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE,
        );
        return;
      }
      if ((presentation !== "homepage" || design2Home) && !isScheduleComplete) {
        failStep1(
          "missing_schedule",
          travelDetailsBlocker || QUOTE_PRICE_WAIT_FOR_SCHEDULE,
        );
        scrollQuoteStage("quote-section-schedule");
        window.setTimeout(() => {
          focusFirstInvalidField(cardRef.current ?? document);
        }, 0);
        return;
      }
      if (!exceedsOnlineCapacity && !isEnquiryOnly && !isManualQuoteJourney && !pricingConfirmationRequired && !liveQuote) {
        trackQuoteValidationError("price_not_ready", quoteFunnelParams({ cta: step1Cta }));
        return;
      }
      setSubmitError("");
      setExpressEditingLeg(null);
      if (presentation === "homepage") {
        const classified = classifyVerifiedJourney(pickupPlace, dropoffPlace);
        if (classified) {
          setJourneyIntent(classified.intent);
          setTripDirection(classified.direction);
          setIntentAirportCode(classified.airport);
          setAirportCode(classified.airport);
          setTripMode("address");
        }
        // Meet & Greet chosen at the vehicle step is part of the price the customer agreed,
        // so it must not show as a "fare changed" at checkout.
        const vehicleStepUpgradeGbp = desktopMeetGreetUpgrades()
          .filter((upgrade) => upgrade.selected && upgrade.inTransferFare)
          .reduce((sum, upgrade) => sum + upgrade.feeGbp, 0);
        provisionalQuotedAmountRef.current =
          paymentAmount != null && Number.isFinite(paymentAmount)
            ? paymentAmount + vehicleStepUpgradeGbp
            : liveQuote?.amount ?? null;
        setHomepageFareChangeAck(false);
      }
      // Blur CTA before DOM swap so iOS does not keep scroll anchored to the old button.
      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      notifyOwnerQuoteContactIfReady("booking_started");
      bookTransferGlideRef.current = true;
      pendingQuoteStepNavScrollRef.current = 2;
      setQuoteStep(2);
      return;
    }

    if (quoteStep === 2 || quoteStep === 3) {
      void submitCheckoutForm();
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

  function handleBackToQuote() {
    navigateQuoteStep(1);
  }

  /**
   * Desktop booking progress (1200px+): completed stages are buttons that reuse the existing
   * back-navigation. "Journey" opens the saved journey form for editing (same as Edit journey);
   * "Vehicle" is the existing Back to your quote. No state is cleared, no quote, payment session
   * or notification is created; changing the journey re-prices through the normal quote flow.
   */
  function goToJourneyFromProgress() {
    if (quoteStep !== 1) navigateQuoteStep(1);
    setDesktopJourneyEditing(true);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        const field = document.getElementById("pickup");
        field?.scrollIntoView({ block: "center", behavior: "smooth" });
        field?.focus({ preventScroll: true });
      }, 80);
    }
  }

  /** Mobile Design 3: completed stages in the top progress line go back to that stage. Same
   * back-navigation as Edit / Back; nothing is cleared and no quote or payment is created. */
  function scrollToD3Card() {
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      cardRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 60);
  }

  function goToJourneyFromD3Steps() {
    if (quoteStep !== 1) navigateQuoteStep(1);
    setHomepagePriceRequested(false);
    scrollToD3Card();
  }

  /** Header logo pressed while on the homepage: show the first screen again (all devices).
   * Same back-navigation as Edit journey; details are kept and nothing is created. */
  logoHomeRef.current = () => {
    if (presentation !== "homepage") return;
    if (quoteStep !== 1) navigateQuoteStep(1);
    setHomepagePriceRequested(false);
    setDesktopJourneyEditing(false);
    if (typeof window !== "undefined") {
      // The step change may scroll to the form; finish at the very top of the page.
      for (const delay of [80, 450, 900]) window.setTimeout(() => window.scrollTo({ top: 0 }), delay);
    }
  };
  function goToVehicleFromD3Steps() {
    if (quoteStep !== 1) navigateQuoteStep(1);
    setHomepagePriceRequested(true);
    scrollToD3Card();
  }

  function goToVehicleFromProgress() {
    handleBackToQuote();
  }

  /** Desktop booking header (1200px+): the same Call Us link on every booking step. */
  function renderDesktopCallUs() {
    return <CallUsButton variant="booking" />;
  }

  function renderBackToQuoteButton(placement: "top" | "bottom") {
    return (
      <button
        type="button"
        data-back-to-quote={placement}
        onClick={handleBackToQuote}
        className={`${
          placement === "top" ? "mt-1.5" : ""
        } inline-flex items-center py-1 text-sm font-semibold text-emerald hover:text-white`}
      >
        ← Back to your quote
      </button>
    );
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
      if (blockTownGuidePickupBooking()) {
        return;
      }
      const schedule = syncScheduleFieldsFromInputs();
      if (!validateTripForBooking(schedule)) {
        return;
      }
      // Soft lookup loading/unavailable must not require a second click — format validity is the gate.
      if (!validateRequiredFlightNumbers()) {
        focusInvalidFlightNumber();
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
      notifyOwnerQuoteContactIfReady("details_opened");
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
    const glideToDetails = bookTransferGlideRef.current;
    bookTransferGlideRef.current = false;
    if (glideToDetails && target === 2) {
      // The longer homepage headline must not push booking fields below the viewport.
      // Legacy homepage presentations retain their introduction and benefits.
      // Tablet/desktop use the card because their hero columns have a different order.
      const introduction =
        presentation === "homepage" && !homepagePolish && window.matchMedia("(max-width: 767px)").matches
          ? document.getElementById("homepage-booking-intro")
          : null;
      const bookingHeading = cardRef.current?.querySelector<HTMLElement>(
        '[data-site-nav-heading="quote"]',
      );
      // Mobile Design 3: stop with the progress line (Journey / Vehicle / Details & Payment) just
      // below the fixed header, so it stays visible and tappable.
      const design3Steps = mobileDesign3
        ? cardRef.current?.querySelector<HTMLElement>("[data-mobile-steps]")
        : null;
      return scheduleBookTransferGlide(
        design3Steps ?? introduction ?? bookingHeading ?? cardRef.current ?? step2TravelDetailsRef.current ?? "step2-travel-details",
      );
    }
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
  }, [quoteStep, presentation, homepagePolish, mobileDesign3]);

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
  /** One scroll when results first become visible. Vehicle/Express changes must not re-arm it. */
  const hadRouteSummaryScrollRef = useRef(false);
  const quoteRevealScrollCancelRef = useRef<(() => void) | null>(null);
  /** Time picker Done/blur → flight number (when shown) or Your Journey (once per step-2 visit). */
  const hadJourneySummaryScrollRef = useRef(false);
  const hadLegacyJourneyModeScrollRef = useRef(false);
  const hadLegacyPartyScrollRef = useRef(false);

  // Stage 1: Address to Address tapped → PICKUP / DESTINATION fields.
  // Desktop only. On mobile (< md / 768px) the viewport must stay still.
  useEffect(() => {
    if (!isA2AFlow || quoteStep !== 1 || presentation === "homepage") {
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
  }, [isA2AFlow, journeyIntent, presentation, quoteStep]);

  // Stage 3: both addresses selected → JOURNEY (One way / Return) only.
  // Pickup alone must not scroll. Route/vehicle renders must not steal viewport.
  // Desktop only — mobile Step 1 must not jump after an address becomes valid.
  useEffect(() => {
    if (!isA2AFlow || quoteStep !== 1 || presentation === "homepage") {
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
  }, [a2aShowJourneyMode, isA2AFlow, journeyMode, presentation, quoteStep]);

  // Stage 4: One way / Return selected → pickup date & time (then passengers).
  // Same 720ms glide as the quote reveal and Book This Transfer.
  // This effect runs after the selection render, so a Return choice has already
  // laid out the return note and return date/time before the glide measures.
  useEffect(() => {
    if (!isA2AFlow || quoteStep !== 1 || presentation === "homepage") {
      hadA2aPartyScrollRef.current = false;
      return;
    }
    if (!a2aShowParty) {
      hadA2aPartyScrollRef.current = false;
      return;
    }
    if (hadA2aPartyScrollRef.current) return;
    hadA2aPartyScrollRef.current = true;
    return scheduleBookTransferGlide("quote-section-schedule");
  }, [a2aShowParty, isA2AFlow, presentation, quoteStep]);

  // One results scroll, as soon as the results mount.
  // Stops with Vehicle options under the sticky header. Fare, vehicle,
  // availability, and price updates must not scroll again. A capacity flicker
  // must not reset the latch — that was restarting the scroll and juddering.
  useEffect(() => {
    if (quoteStep !== 1 || !hasQuoteRoute) {
      hadRouteSummaryScrollRef.current = false;
      quoteRevealScrollCancelRef.current?.();
      quoteRevealScrollCancelRef.current = null;
      return;
    }

    const revealWithoutSchedule =
      presentation === "homepage" && homepagePriceRequested;
    if (
      !quoteResultsReady ||
      !quoteChoicesReady ||
      (!isScheduleComplete && !revealWithoutSchedule) ||
      hadRouteSummaryScrollRef.current
    ) {
      return;
    }

    // Stop the earlier date/time glide before this scroll, then latch.
    // Cancelling first matters: its retry must not clear the latch we set next.
    cancelCompetingScrollJobs();
    hadRouteSummaryScrollRef.current = true;
    quoteRevealScrollCancelRef.current = scheduleQuoteRevealScroll({
      onConsume: () => {},
      onRetry: () => {
        hadRouteSummaryScrollRef.current = false;
        quoteRevealScrollCancelRef.current = null;
      },
    });
  }, [
    hasQuoteRoute,
    homepagePriceRequested,
    isScheduleComplete,
    presentation,
    quoteChoicesReady,
    quoteResultsReady,
    quoteStep,
  ]);

  useEffect(() => {
    return () => {
      quoteRevealScrollCancelRef.current?.();
      quoteRevealScrollCancelRef.current = null;
    };
  }, []);

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
    // Same post-render 720ms glide. Return fields are already in this commit.
    return scheduleBookTransferGlide("passenger-luggage-section");
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
    // The combined checkout already shows Your details directly after the schedule.
    // Stop at its heading; the legacy summary/Continue target sits below the name.
    if (step3CustomerDetailsRef.current) {
      scrollJourneySummaryAfterTimeConfirm(step3CustomerDetailsRef.current, null);
      return;
    }
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
      ? "Sending request…"
      : "Sending request…";

  const confirmButtonLabel = isManualQuoteJourney
    ? "Submit Quote Request"
    : showsRequestQuoteFlow
    ? pricingConfirmationRequired
      ? "Request a Quote"
      : liveQuote
        ? `Request quote · ${formatQuote(pricedFare?.totalGbp ?? liveQuote.amount)}`
        : "Request a Quote"
    : isEnquiryOnly
      ? "Send request"
      : "Send request";

  const whatsAppConfirmLabel = showsRequestQuoteFlow
    ? pricingConfirmationRequired || isManualQuoteJourney
      ? "Chat on WhatsApp"
      : liveQuote
        ? `Request quote via WhatsApp — ${formatQuote(pricedFare?.totalGbp ?? liveQuote.amount)}`
        : "Chat on WhatsApp"
    : "Send request via WhatsApp";

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
   * Optional (can be added later in Manage Booking); never shown for pure to-airport one-ways.
   */
  function renderFlightDetailsSection(activeOnStep: 2 | 3) {
    if (!needsOutboundFlightNumber && !needsReturnCollectionFlightNumber) {
      return null;
    }
    return (
      <div
        id={activeOnStep === 2 ? "step2-flight-details" : "step3-flight-details"}
        className="scroll-mt-44 space-y-2 rounded-xl quote-panel px-3 py-3 md:scroll-mt-28"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white">
            Flight details
          </p>
        </div>
        {needsOutboundFlightNumber ? (
          <FlightNumberField
            id="goingFlightNumber"
            label="Flight number (optional — add it later if you like)"
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
            enabled={quoteStep >= 2}
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
            label="Return flight number (optional — add it later if you like)"
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
            enabled={quoteStep >= 2}
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
        <p className="text-[11px] font-semibold uppercase tracking-wider quote-secondary">
          Airport charges
        </p>
        <ul className="space-y-2">
          {airportFeeResolution.lines.map((line) => (
            <li
              key={line.id}
              className="rounded-lg quote-panel px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-white">
                    {line.label}
                    {line.leg === "return" ? (
                      <span className="ml-1.5 text-xs font-normal quote-secondary">
                        (return)
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs quote-secondary">
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

  function renderRequiredAirportAccessNotes(tone: "on-dark" | "on-light") {
    if (testChargeAmount !== null) return null;
    const airport = effectiveAirportCode || null;
    if (!airport) return null;
    const notices = [
      {
        key: "outbound",
        notice: requiredAirportAccessNotice({
          airportCode: airport,
          fromAirport: isFromAirport,
        }),
      },
      ...(returnJourney
        ? [
            {
              key: "return",
              notice: requiredAirportAccessNotice({
                airportCode: airport,
                fromAirport: !isFromAirport,
              }),
            },
          ]
        : []),
    ].filter((item) => item.notice);
    if (notices.length === 0) return null;
    const light = tone === "on-light";
    return (
      <div className="mt-3 space-y-3 text-left" data-required-airport-access>
        {notices.map((item) => (
          <div key={item.key} data-required-airport-leg={item.key}>
            {notices.length > 1 ? (
              <p className={`mb-1 text-sm font-semibold ${light ? "text-navy" : "text-white"}`}>
                {item.key === "return" ? "Return journey" : "Outbound journey"}
              </p>
            ) : null}
            <div
              className={`rounded-xl border px-3 py-2.5 ${
                light ? "border-navy/15 bg-navy/[0.03]" : "border-white/20"
              }`}
            >
              <p className={`text-sm font-semibold ${light ? "text-navy" : "text-white"}`}>
                {item.notice!.heading}
              </p>
              <p
                className={`mt-1 break-words text-[0.8125rem] font-medium leading-snug ${
                  light ? "text-navy" : "text-white/80"
                }`}
              >
                {item.notice!.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderMeetGreetOnlyChoice(
    _mode: "full" | "summary",
    tone: "on-dark" | "on-light",
    _legs: AirportPickupLegRef[],
  ) {
    if (isExecutiveVehicle(quoteVehicle) && isFromAirport) return null;
    const light = tone === "on-light";
    return (
      <div className="mt-1 text-left" data-airport-access-included>
        <p className={`text-xs font-bold ${light ? "text-navy" : "text-white"}`}>
          {AIRPORT_ACCESS_INCLUDED_HEADING}
        </p>
        <p className={`mt-0.5 text-[11px] font-medium leading-snug ${light ? "text-navy" : "text-white"}`}>
          {AIRPORT_ACCESS_INCLUDED_BODY}
        </p>
      </div>
    );
  }

  function renderBusinessClassInclusions(forLayout = false) {
    if (!forLayout && !isExecutiveVehicle(quoteVehicle)) return null;
    const pickupLegs = listAirportPickupLegs({
      airportCode: effectiveAirportCode || null,
      fromAirport: isFromAirport,
      returnJourney,
      isAirportToAirport: isAirportToAirportJourney,
      pickupAirportCode,
      dropoffAirportCode,
    });
    const hasPickup = pickupLegs.length > 0;
    const airportDropOff =
      !hasPickup &&
      (isAirportTrip || isAirportToAirportJourney || Boolean(effectiveAirportCode));
    if (!hasPickup && !airportDropOff) return null;
    const items = hasPickup
      ? BUSINESS_CLASS_PICKUP_INCLUSIONS
      : BUSINESS_CLASS_DROPOFF_INCLUSIONS;
    return (
      <div
        className="mt-2 rounded-xl border border-navy/10 bg-navy/[0.03] px-3 py-2 text-left"
        data-business-class-inclusions={forLayout ? undefined : true}
        data-business-class-pickup={forLayout ? undefined : hasPickup ? "true" : "false"}
      >
        <p className="text-[11px] font-bold uppercase tracking-wider text-navy">Included with Business Class</p>
        <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-1.5 text-xs font-medium leading-tight text-navy">
              <span className="mt-px shrink-0 font-bold text-[#147a2a]" aria-hidden>
                ✓
              </span>
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  function renderExpressChoiceInPriceCard(
    _mode: "full" | "summary",
    _tone: "on-dark" | "on-light" = "on-dark",
  ) {
    if (testChargeAmount !== null || quoteStep === 1 || appliedPersonalQuote) return null;
    const visits = listTerminalAccessVisits({ airportCode: effectiveAirportCode, fromAirport: isFromAirport,
      returnJourney, isAirportToAirport: isAirportToAirportJourney, pickupAirportCode, dropoffAirportCode });
    if (!visits.length) return null;
    return <section className="space-y-3 rounded-xl quote-panel p-3" aria-label="Airport services">
      {visits.map((leg) => {
        const choice = terminalAccessChoices[airportVisitKey(leg)] ?? (leg.leg === "return" ? returnAccessChoice : outboundAccessChoice);
        const included = isExecutiveVehicle(quoteVehicle) && leg.service === "pick-up";
        const change = (next: AirportAccessChoice) => {
          setTerminalAccessChoices(current => ({...current, [airportVisitKey(leg)]: next}));
          setExpressAckRequired(false);
        };
        return <TerminalAccessOptions key={`${leg.leg}-${leg.airportCode}-${leg.service}`}
          leg={leg.leg} airportCode={leg.airportCode} service={leg.service}
          choice={included ? "meet-greet" : choice} onChange={change}
          freeAvailable={true} meetGreetIncluded={included}
          terminalFee={leg.airportCode === "BFS" ? publicPricing.terminalAccess.bfsGbp : publicPricing.terminalAccess.bhdGbp}
          meetGreetFee={leg.airportCode === "BFS" ? publicPricing.meetGreet.bfsGbp : publicPricing.meetGreet.bhdGbp}
          meetGreetOfferedEarlier={leg.service === "pick-up" && offeredAtVehicleStep(airportVisitKey(leg))}
          />;
      })}
    </section>;
  }

  function renderPriceBreakdownCollapsible() {
    if (!openWebsiteFareBreakdown || testChargeAmount !== null) {
      return null;
    }
    const payable = formatQuote(openWebsiteFareBreakdown.finalAmountPayableGbp);
    return (
      <details
        className="relative rounded-xl quote-panel px-3 py-2.5"
        data-quote-price-breakdown
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}
      >
        <summary className="cursor-pointer list-none text-sm font-medium text-white/80 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-3">
            <span>
              <span className="block">View price breakdown</span>
              <span className="mt-0.5 block text-xs font-normal quote-secondary">
                See how your {payable} quote is calculated
              </span>
            </span>
            <span className="shrink-0 quote-secondary" aria-hidden>
              ▾
            </span>
          </span>
        </summary>
        <div className="quote-breakdown-panel" data-quote-breakdown-panel>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-bold text-white">Your price breakdown</h3>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-white/30 px-3 text-sm font-semibold text-white"
              onClick={(event) => {
                const details = event.currentTarget.closest("details");
                if (details) {
                  details.open = false;
                  details.querySelector("summary")?.focus();
                }
              }}
            >
              Close breakdown
            </button>
          </div>
          <PromotionalPriceBreakdown
            alwaysShow
            breakdown={openWebsiteFareBreakdown}
            service={expressSelection.service ?? "drop-off"}
            freeAirportAccessSelected={
              expressSelection.eligible && airportAccessQuote.airportAccessChargeGbp === 0
            }
          />
          {renderAirportFeeLines()}
          <PriceInclusionBlock
            isAirportTrip={isAirportLegForInclusions}
            isFromAirport={isFromAirport}
            returnJourney={returnJourney}
            airportCode={effectiveAirportCode}
            addressToAddress={isAddressToAddressInclusions}
          />
        </div>
      </details>
    );
  }

  function renderAuthoritativeQuoteRetry() {
    return (
      <button
        type="button"
        data-quote-price-retry
        onClick={retryAuthoritativeQuote}
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-white/25 px-4 py-2 text-sm font-semibold text-white hover:border-white/50"
      >
        Try again
      </button>
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
              {isVehiclePersonalQuote ? "On request" : "Get a personalised quote for your journey"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              {isVehiclePersonalQuote
                ? `Send your ${vehicleShortLabel(quoteVehicle)} journey details and we’ll confirm availability and your personal price before payment.`
                : journeyKind === "address-to-address"
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
            {authoritativeQuoteFailed ? (
              <p className="mt-2 text-sm font-semibold leading-relaxed text-white" data-quote-fare-status="unavailable">
                {AUTHORITATIVE_QUOTE_UNAVAILABLE_MESSAGE}
              </p>
            ) : (
            <p className="quote-price-figure mt-2">
              {mayPaintNumericFare
                  ? formatQuote(pricedFare?.totalGbp ?? liveQuote.amount)
                  : "Calculating…"}
            </p>
            )}
            {authoritativeQuoteFailed ? renderAuthoritativeQuoteRetry() : null}
            {renderExpressChoiceInPriceCard(quoteStep === 1 ? "full" : "summary")}
            <p className="mt-3 text-sm text-white/75">
              Vehicle: {vehicleShortLabel(quoteVehicle)}
              <span className="mx-2 text-white/35">·</span>
              Passengers: {formatPassengerChoice(effectivePassengers as number)}
              <span className="mx-2 text-white/35">·</span>
              Suitcases: {formatSuitcaseChoice(suitcases as number)}
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
                ? "Test card charge"
                : appliedPersonalQuote
                  ? "Personal quoted fare"
                  : "Your transfer price"}
            </p>
            {authoritativeQuoteFailed ? (
              <p className="mt-2 text-sm font-semibold leading-relaxed text-white" data-quote-fare-status="unavailable">
                {AUTHORITATIVE_QUOTE_UNAVAILABLE_MESSAGE}
              </p>
            ) : (
            <p className="quote-price-figure mt-2">
              {testChargeAmount != null || appliedPersonalQuote || mayPaintNumericFare
                  ? formatQuote(
                      testChargeAmount ??
                        pricedFare?.totalGbp ??
                        appliedPersonalQuote?.agreedAmount ??
                        liveQuote.amount,
                    )
                  : "Calculating…"}
            </p>
            )}
            {authoritativeQuoteFailed ? renderAuthoritativeQuoteRetry() : null}
            {/* Surcharges are included in the fixed price and never named to customers. */}
            {testChargeAmount === null && !appliedPersonalQuote ? (
              <FixedPriceAssurance
                includesSelectedAirportAccess={expressSelection.eligible}
              />
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
              Suitcases: {formatSuitcaseChoice(suitcases as number)}
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
              Your transfer price
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
                    ? "Eligible bookings can be paid securely online by card."
                    : "Fixed price for your journey. Eligible bookings can be paid securely online by card."
                  : isAirportLegForInclusions
                    ? "Continue to enter your details — eligible bookings can be paid securely online by card."
                    : "Fixed price for your journey. Continue to enter your details when you’re ready."}
        </p>
      </>
    );
  }

  function checkoutTimeLabel(leg: "outbound" | "return" = "outbound"): string {
    const fromAirport =
      leg === "return" ? !isFromAirport && returnJourney : isFromAirport;
    return fromAirport ? "Scheduled flight arrival time" : "Pickup time";
  }

  function renderQuoteScheduleFields(variant: "quote" | "checkout", homepageInline = false) {
    return (
      <QuoteScheduleFields
        variant={variant}
        homepageInline={homepageInline}
        homepagePolish={homepagePolish && homepageInline}
        returnJourney={returnJourney}
        tripDate={tripDate}
        tripTime={tripTime}
        returnDate={returnDate}
        returnTime={returnTime}
        minTripDate={minTripDate}
        minReturnDate={minReturnDate}
        minTripTime={minTripTime}
        minReturnTime={minReturnTime}
        tripDateError={tripDateError}
        returnDateError={returnDateError}
        outboundTimeLabel={checkoutTimeLabel("outbound")}
        returnTimeLabel={checkoutTimeLabel("return")}
        tripDateInputRef={tripDateInputRef}
        tripTimeInputRef={tripTimeInputRef}
        d3TimePicker={mobileDesign3 && homepageInline}
        returnDateInputRef={returnDateInputRef}
        returnTimeInputRef={returnTimeInputRef}
        onTripDateChange={(value) => {
          setTripDate(value);
          if (presentation === "homepage" && !design2Home) setHomepagePriceRequested(false);
          if (value && tripTime) setTripDateError("");
          setReturnDateError("");
        }}
        onTripTimeChange={(value) => {
          setTripTime(value);
          if (presentation === "homepage" && !design2Home) setHomepagePriceRequested(false);
          if (tripDate && value) setTripDateError("");
          setReturnDateError("");
        }}
        onReturnDateChange={(value) => {
          setReturnDate(value);
          if (presentation === "homepage" && !design2Home) setHomepagePriceRequested(false);
          setReturnDateError("");
        }}
        onReturnTimeChange={(value) => {
          setReturnTime(value);
          if (presentation === "homepage" && !design2Home) setHomepagePriceRequested(false);
          setReturnDateError("");
        }}
        onTimeBlur={
          variant === "checkout"
            ? () => {
                requestJourneySummaryScrollAfterTimeConfirm();
              }
            : undefined
        }
      />
    );
  }

  function checkoutPayableLabel(): string | null {
    if (paymentAmount == null || !Number.isFinite(paymentAmount)) return null;
    return formatQuote(paymentAmount);
  }

  function checkoutAccessLine(): string | null {
    if (!airportAccessQuote.legs.some(row => row.airportCode === "BFS" || row.airportCode === "BHD")) {
      const airport = effectiveAirportCode || null;
      if (!airport) return null;
      const notices = [
        requiredAirportAccessNotice({ airportCode: airport, fromAirport: isFromAirport }),
        ...(returnJourney
          ? [requiredAirportAccessNotice({ airportCode: airport, fromAirport: !isFromAirport })]
          : []),
      ].filter((notice) => notice);
      if (notices.length === 0) return null;
      return notices.map((notice) => notice!.body).join(" ");
    }
    return airportAccessQuote.legs.map((leg) =>
      `${leg.leg === "return" ? "Return" : "Outbound"} ${leg.airportCode} ${leg.service}: ${leg.option === "meet-greet" ? "Meet & Greet (access included)" : leg.option === "express" ? "Terminal Access" : "Free Airport Access"} — ${formatQuote(leg.chargeGbp)}`
    ).join(" · ");
  }

  function renderCheckoutPage() {
    const amountLabel = checkoutPayableLabel();
    const payNow =
      canPayNowOnline && Boolean(liveQuote) && !isEnquiryOnly && !showsRequestQuoteFlow;
    const partyLine =
      partySelectionReady && effectivePassengers != null && suitcases != null
        ? `${vehicleShortLabel(quoteVehicle)} · ${formatPassengerChoice(effectivePassengers)} passenger${
            effectivePassengers === 1 ? "" : "s"
          } · ${formatSuitcaseChoice(suitcases)} suitcase${suitcases === 1 ? "" : "s"}${
            bookingChildSeats > 0
              ? ` · ${bookingChildSeats} child / booster seat${bookingChildSeats === 1 ? "" : "s"}`
              : ""
          }`
        : vehicleShortLabel(quoteVehicle);
    const showChangeDropOff =
      expressSelection.eligible && expressSelection.freeAlternativeAvailable;
    const ownerClosed =
      ownerNoAvailabilityBlocked || closedAvailabilityMessage;
    const checkoutBlocked =
      !ownerClosed &&
      !isMinimumNoticeRequest &&
      (smartAvailabilityBlocked || isCustomerSmartAvailabilityBlockMessage(paymentError));
    const isTooSoonCheckout = Boolean(
      payNow && liveQuote && isTooSoonPickup && !ownerClosed && !checkoutBlocked,
    );
    // Desktop (1200px+) side panel only — hidden below 1200px. Display text from existing
    // state; no pricing or booking logic. Waiting wording follows the published Terms
    // (AIRPORT_WAITING_FROM_LANDING: 60 minutes from actual landing, with a valid flight
    // number; other pickups 10 minutes) and only names the pickups this booking has.
    const checkoutWhenLine =
      tripDate && tripTime ? `${formatBookingDate(tripDate)} · ${formatCustomerClock(tripTime) || tripTime}` : null;
    const checkoutReturnWhenLine =
      returnJourney && returnDate && returnTime
        ? `${formatBookingDate(returnDate)} · ${formatCustomerClock(returnTime) || returnTime}`
        : null;
    const outboundPickupAtAirport = checkoutTimeLabel("outbound") !== "Pickup time";
    const returnPickupAtAirport = returnJourney && checkoutTimeLabel("return") !== "Pickup time";
    const waitingLine = (leg: string, atAirport: boolean) =>
      atAirport
        ? `${leg} airport pickup: up to 60 minutes complimentary waiting from your flight’s actual landing time, with a valid flight number`
        : `${leg} pickup: up to 10 minutes complimentary waiting`;
    const checkoutIncludedLines = [
      ...(payNow ? ["Fixed price, confirmed before you pay"] : []),
      waitingLine(returnJourney ? "Outbound" : "Your", outboundPickupAtAirport),
      ...(returnJourney ? [waitingLine("Return", returnPickupAtAirport)] : []),
    ];
    const checkoutDesktopDetails = (
      <>
        <ol data-checkout-route-stops aria-label="Journey">
          <li data-checkout-stop="from">
            <p data-checkout-stop-name>{(pickupLabel || "Pickup").split(",")[0]}</p>
            {pickupAddress ? <p data-checkout-stop-address>{pickupAddress}</p> : null}
          </li>
          <li data-checkout-stop="to">
            <p data-checkout-stop-name>{(dropoffLabel || "Destination").split(",")[0]}</p>
            {dropoffAddress ? <p data-checkout-stop-address>{dropoffAddress}</p> : null}
          </li>
        </ol>
        {checkoutWhenLine ? (
          <dl data-checkout-legs>
            <div data-checkout-leg="outbound">
              <dt>
                {returnJourney ? "Outbound" : "Pickup"}
                {outboundPickupAtAirport ? " · flight lands" : ""}
              </dt>
              <dd>{checkoutWhenLine}</dd>
            </div>
            {checkoutReturnWhenLine ? (
              <div data-checkout-leg="return">
                <dt>Return{returnPickupAtAirport ? " · flight lands" : ""}</dt>
                <dd>{checkoutReturnWhenLine}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <p data-checkout-vehicle>{partyLine}</p>
        <ul data-checkout-included aria-label="What’s included">
          {checkoutIncludedLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </>
    );

    /** Design 2/3 summary: a paid airport option (Belfast Meet & Greet or terminal area) shown as
        its own line; the total is unchanged (it already includes it). */
    const design2AccessGbp = Number.isFinite(airportAccessQuote.airportAccessChargeGbp)
      ? airportAccessQuote.airportAccessChargeGbp
      : 0;
    const design2AccessIsMeetGreet = Object.values(terminalAccessChoices).includes("meet-greet");
    const design2When =
      tripDate && tripTime ? `${formatBookingDate(tripDate)}, ${formatCustomerClock(tripTime) || tripTime}` : "";
    return (
      <>
        {design2Home ? (
          <section data-d2-pay-summary aria-label="Price summary">
            <div data-d2-pay-head>
              <div>
                <p data-d2-pay-when>
                  {vehicleShortLabel(quoteVehicle)}
                  {design2When ? ` · ${design2When}` : ""}
                </p>
                <p data-d2-pay-route>
                  {(pickupLabel || "Pickup").split(",")[0]} <span aria-hidden="true">→</span>
                  <span className="sr-only"> to </span> {(dropoffLabel || "Destination").split(",")[0]}
                </p>
              </div>
              <p data-d2-pay-amount>{amountLabel ?? "TBC"}</p>
            </div>
            <dl data-d2-pay-lines>
              {bookingMeetGreetActive ? (
                <div>
                  <dt>Meet &amp; Greet (in total)</dt>
                  <dd>{formatMeetGreetGbp(bookingMeetGreetCharge)}</dd>
                </div>
              ) : (
                <>
                  <div>
                    <dt>{vehicleShortLabel(quoteVehicle)}, {returnJourney ? "return" : "one way"}</dt>
                    <dd>
                      {design2AccessGbp > 0 && paymentAmount != null && Number.isFinite(paymentAmount)
                        ? formatQuote(Math.round((paymentAmount - design2AccessGbp) * 100) / 100)
                        : amountLabel ?? "TBC"}
                    </dd>
                  </div>
                  {design2AccessGbp > 0 ? (
                    <div>
                      <dt>{design2AccessIsMeetGreet ? "Meet & Greet" : "Airport pickup / drop-off option"}</dt>
                      <dd>{formatQuote(design2AccessGbp)}</dd>
                    </div>
                  ) : null}
                  {bookingMeetGreetEligible ? (
                    <div>
                      <dt>Meet &amp; Greet</dt>
                      <dd>Not added</dd>
                    </div>
                  ) : null}
                </>
              )}
              <div data-d2-pay-total>
                <dt>Total to pay</dt>
                <dd>{amountLabel ?? "TBC"}</dd>
              </div>
            </dl>
            <p data-d2-pay-note>Fixed price · Free cancellation up to 24 hrs</p>
          </section>
        ) : null}
        <div
          id="step2-travel-details"
          ref={step2TravelDetailsRef}
          onBlurCapture={handleCheckoutBoxBlur}
          data-d2-schedule-done={design2Home && isScheduleComplete ? "true" : undefined}
          className="scroll-mt-44 space-y-3 md:scroll-mt-28"
        >
          <h2
            data-booking-nav-heading
            tabIndex={-1}
            className="text-sm font-semibold text-white outline-none"
          >
            Pickup date & time
          </h2>

          {renderQuoteScheduleFields("checkout")}



          <section
            onFocusCapture={() => notifyOwnerQuoteContactIfReady("details_opened")}
            id="step3-customer-details"
            ref={step3CustomerDetailsRef}
            className="scroll-mt-44 space-y-3 md:scroll-mt-28"
          >
            <p
              data-booking-nav-heading
              tabIndex={-1}
              className="text-xs font-semibold uppercase tracking-wider text-white outline-none"
            >
              Your details
            </p>
            <div className="space-y-3">
              <div>
                <label htmlFor="name" className="form-label">
                  Full name
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
                    if (e.target.value.trim()) setCustomerNameError("");
                  }}
                  placeholder="John Smith"
                  className={bookingTextFieldClass(
                    fieldState({
                      hasError: Boolean(customerNameError),
                      complete: Boolean(customerName.trim()),
                      activeStep: quoteStep >= 2,
                    }),
                  )}
                />
                {customerNameError ? (
                  <p id="customer-name-error" role="alert" className="mt-1.5 text-xs text-red-300">
                    {customerNameError}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="mobile" className="form-label">
                  Mobile number
                </label>
                <input
                  id="mobile"
                  name="mobile"
                  type="tel"
                  autoComplete="tel"
                  value={customerMobile}
                  aria-invalid={Boolean(mobileNumberError)}
                  aria-describedby={mobileNumberError ? "customer-mobile-error customer-mobile-whatsapp" : "customer-mobile-whatsapp"}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCustomerMobile(value);
                    if (!mobileNumberError) return;
                    if (value.trim() && isValidMobileNumber(value)) {
                      setMobileNumberError("");
                    } else if (
                      value.trim() &&
                      mobileNumberError === QUOTE_REQUIRED_FIELD_MESSAGES.mobile
                    ) {
                      setMobileNumberError("");
                    }
                  }}
                  placeholder="07xxx xxxxxx"
                  className={bookingTextFieldClass(
                    fieldState({
                      hasError: Boolean(mobileNumberError),
                      complete: isValidMobileNumber(customerMobile),
                      activeStep: quoteStep >= 2,
                    }),
                  )}
                />
                {mobileNumberError ? (
                  <p id="customer-mobile-error" role="alert" className="mt-1.5 text-xs text-red-300">
                    {mobileNumberError}
                  </p>
                ) : null}
                <p id="customer-mobile-whatsapp" className="mt-1.5 text-xs text-white/55">
                  We&apos;ll send your booking confirmation, driver updates and a follow-up after your trip to this number on WhatsApp.
                </p>
              </div>
              <div>
                <label htmlFor="email" className="form-label">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={customerEmail}
                  aria-invalid={Boolean(emailAddressError)}
                  aria-describedby={emailAddressError ? "customer-email-error" : undefined}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCustomerEmail(value);
                    if (!emailAddressError) return;
                    if (value.trim() && isValidEmailAddress(value)) {
                      setEmailAddressError("");
                    } else if (
                      value.trim() &&
                      emailAddressError === QUOTE_REQUIRED_FIELD_MESSAGES.email
                    ) {
                      setEmailAddressError("");
                    }
                  }}
                  placeholder="you@example.com"
                  className={bookingTextFieldClass(
                    fieldState({
                      hasError: Boolean(emailAddressError),
                      complete: isValidEmailAddress(customerEmail),
                      activeStep: quoteStep >= 2,
                    }),
                  )}
                />
                {emailAddressError ? (
                  <p id="customer-email-error" role="alert" className="mt-1.5 text-xs text-red-300">
                    {emailAddressError}
                  </p>
                ) : null}
              </div>
              <div data-heard-about>
                <label htmlFor="heard-about" className="form-label">
                  How did you hear about us? <span className="font-normal opacity-70">(optional)</span>
                </label>
                <select
                  id="heard-about"
                  name="heardAbout"
                  value={heardAbout}
                  onChange={(e) => setHeardAbout(e.target.value)}
                  className={bookingTextFieldClass(
                    fieldState({ hasError: false, complete: Boolean(heardAbout), activeStep: quoteStep >= 2 }),
                  )}
                >
                  <option value="">Choose one</option>
                  {HEARD_ABOUT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              {bookingMeetGreetEligible ? (
                <section className="rounded-xl border border-emerald/30 bg-navy/30 px-3 py-3 text-white" data-booking-meet-greet data-offered-at-vehicle-step={offeredAtVehicleStep("dub-meet-greet") ? "true" : undefined}>
                  <h3 className="text-sm font-bold">Enhance Your Airport Pickup</h3>
                  <p className="mt-1 text-sm font-semibold">Meet &amp; Greet Service — {formatMeetGreetGbp(bookingMeetGreetPrice)}</p>
                  <p id="booking-meet-greet-description" className="mt-1 text-xs leading-snug">Your driver will meet you inside the airport arrivals hall with a personalised name board and assist you to your vehicle.</p>
                  <label className="mt-1 flex min-h-11 items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" className="h-4 w-4 accent-emerald" checked={bookingMeetGreetSelected}
                      aria-describedby="booking-meet-greet-description"
                      onChange={(event) => setBookingMeetGreetSelected(event.target.checked)} />
                    Add Meet &amp; Greet to my booking
                  </label>
                </section>
              ) : null}
              {childSeatsOffered ? (
              <div
                data-child-seats
                data-child-seats-open={childSeatsPanelOpen || Boolean(childSeatNotesError) ? "true" : "false"}
              >
                {/* Desktop (1200px+) only: one short row that opens the options. Hidden below 1200px,
                    where the options below always show exactly as before. */}
                <button
                  type="button"
                  className="hidden"
                  data-child-seats-toggle
                  aria-expanded={childSeatsPanelOpen || Boolean(childSeatNotesError)}
                  aria-controls="child-seat-panel"
                  onClick={() => setChildSeatsPanelOpen((open) => !(open || Boolean(childSeatNotesError)))}
                >
                  <span data-child-seats-toggle-label>Travelling with children? Request a child seat</span>
                  {bookingChildSeats > 0 ? (
                    <span data-child-seats-summary>
                      {bookingChildSeats} child / booster seat{bookingChildSeats === 1 ? "" : "s"} requested
                    </span>
                  ) : null}
                </button>
                <div id="child-seat-panel" data-child-seats-panel>
                <p className="form-label mb-1.5">Child / booster seats</p>
                <div
                  className="grid w-52 max-w-full grid-cols-3 gap-2 md:w-full"
                  data-child-seat-options
                  role="group"
                  aria-label="Child / booster seats"
                >
                  {([0, 1, 2] as const).map((option) => {
                    const selected = childSeats === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setChildSeats(option);
                          if (option === 0) {
                            setChildSeatNotes("");
                            setChildSeatNotesError("");
                          } else if (childSeatNotes.trim()) {
                            setChildSeatNotesError("");
                          }
                        }}
                        className={`min-h-11 rounded-xl text-sm font-semibold transition-all md:min-h-12 md:text-base lg:min-h-11 ${
                          selected ? QUOTE_CHOICE_ON : QUOTE_CHOICE_OFF
                        }`}
                      >
                        {option === 0 ? "None" : String(option)}
                      </button>
                    );
                  })}
                </div>
                {childSeats > 0 ? (
                  <div className="mt-3">
                    <label htmlFor="child-seat-notes" className="form-label">
                      Tell us each child’s age and whether you need a child seat or booster seat.
                    </label>
                    <textarea
                      id="child-seat-notes"
                      name="childSeatNotes"
                      rows={3}
                      value={childSeatNotes}
                      aria-invalid={Boolean(childSeatNotesError)}
                      aria-describedby={
                        childSeatNotesError ? "child-seat-notes-error" : "child-seat-availability"
                      }
                      onChange={(e) => {
                        setChildSeatNotes(e.target.value);
                        if (e.target.value.trim()) setChildSeatNotesError("");
                      }}
                      placeholder="e.g. 2-year-old child seat, 6-year-old booster"
                      className={bookingTextFieldClass(
                        fieldState({
                          hasError: Boolean(childSeatNotesError),
                          complete: Boolean(childSeatNotes.trim()),
                          activeStep: quoteStep >= 2,
                        }),
                      )}
                    />
                    {childSeatNotesError ? (
                      <p
                        id="child-seat-notes-error"
                        role="alert"
                        className="mt-1.5 text-xs text-red-300"
                      >
                        {childSeatNotesError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <p id="child-seat-availability" className="mt-2 text-xs leading-relaxed text-white/65">
                  Child seats are requested subject to availability. We’ll confirm your request.
                </p>
                </div>
              </div>
              ) : null}
            </div>
          </section>

          {renderFlightDetailsSection(2)}
          {renderExpressChoiceInPriceCard("full")}
        </div>

        {/* Summary, payment and their notices. Below 1024px a plain stack with the same
            spacing as before; 1024–1199px display: contents (unchanged layout); 1200px+
            on the homepage, the sticky booking panel beside the details. */}
        <div data-checkout-aside className="max-lg:space-y-3 lg:contents">
          <div id="step2-journey-summary" ref={step2JourneySummaryRef}>
          <QuoteCheckoutSummary
            routeLine={`${(pickupLabel || "Pickup").split(",")[0]} → ${(dropoffLabel || "Destination").split(",")[0]}`}
            pickupAddress={pickupAddress}
            destinationAddress={dropoffAddress}
            detailLine={partyLine}
            totalLabel={amountLabel ? `Total ${amountLabel}` : "Total TBC"}
            whenLine={
              tripDate && tripTime
                ? `${formatBookingDate(tripDate)} · ${formatCustomerClock(tripTime) || tripTime}`
                : null
            }
            returnWhenLine={
              returnJourney && returnDate && returnTime
                ? `${formatBookingDate(returnDate)} · ${formatCustomerClock(returnTime) || returnTime}`
                : null
            }
            accessLine={checkoutAccessLine()}
            desktopDetails={presentation === "homepage" ? checkoutDesktopDetails : undefined}
            onEditJourney={() => navigateQuoteStep(1)}
            changeAccessLabel={undefined}
            onChangeDropOff={
              airportAccessQuote.legs.length > 0
                ? () => {
                    const section = document.querySelector<HTMLElement>("[data-terminal-access]");
                    if (section) scrollQuoteStage(section);
                  }
                : showChangeDropOff
                ? () =>
                    setExpressEditingLeg((current) =>
                      current ? null : expressSelection.legs[0]?.leg ?? "outbound",
                    )
                : null
            }
          >
            {bookingMeetGreetActive ? <p className="mt-1 text-sm font-semibold" data-meet-greet-summary>Meet &amp; Greet: {formatMeetGreetGbp(bookingMeetGreetCharge)}</p> : null}
            {/* Desktop (1200px+) only: the fare breakdown beside the summary (vehicle fare,
                airport access, return discount, total) — same breakdown as the quote. */}
            {openWebsiteFareBreakdown ? (
              <button
                type="button"
                className="hidden"
                data-checkout-breakdown-toggle
                aria-expanded={checkoutBreakdownShown}
                aria-controls="checkout-fare-breakdown"
                onClick={() => setCheckoutBreakdownOpen(!checkoutBreakdownShown)}
              >
                {checkoutBreakdownShown ? "Hide price breakdown" : "View price breakdown"}
              </button>
            ) : null}
            {openWebsiteFareBreakdown ? (
              <div
                className="hidden"
                id="checkout-fare-breakdown"
                data-checkout-breakdown
                data-checkout-breakdown-open={checkoutBreakdownShown ? "true" : "false"}
              >
                <PromotionalPriceBreakdown
                  alwaysShow
                  extraLines={bookingMeetGreetActive ? [{ label: "Meet & Greet · Dublin Airport", gbp: bookingMeetGreetCharge }] : []}
                  breakdown={openWebsiteFareBreakdown}
                  service={expressSelection.service ?? "drop-off"}
                  freeAirportAccessSelected={
                    expressSelection.eligible && airportAccessQuote.airportAccessChargeGbp === 0
                  }
                />
              </div>
            ) : null}
            {showChangeDropOff && expressEditingLeg != null
              ? renderExpressChoiceInPriceCard("full")
              : null}

          </QuoteCheckoutSummary>
          </div>
          {checkoutBlocked ? (
            <div
              id="customer-smart-availability-blocked"
              className="scroll-mt-44 md:scroll-mt-28"
            >
              <CustomerSmartAvailabilityBlocked
                message={
                  isCustomerSmartAvailabilityBlockMessage(paymentError)
                    ? paymentError
                    : CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE
                }
                requestedTripTime={tripTime}
                alternativeTimes={availabilityAlternatives}
                onSelectAlternative={(option) => void handleSelectAvailabilityAlternative(option)}
                onChooseAnotherTime={handleChooseAnotherTime}
                onChooseAnotherDate={handleChooseAnotherDate}
                selectingTime={selectingAlternativeTime}
              />
            </div>
          ) : null}

        {paymentError && !(payNow && liveQuote) && !checkoutBlocked && !ownerClosed ? (
          <div className="space-y-3">
            <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {paymentError}
            </p>
            {renderBookingErrorHelp("payment-early")}
          </div>
        ) : null}

        {submitError ? (
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
        ) : null}

        {renderBackToQuoteButton("bottom")}

        <div
          id="step3-payment-actions"
          ref={step3PaymentActionsRef}
          className="scroll-mt-44 space-y-2 md:scroll-mt-28 sm:space-y-3"
          data-pay-ready={checkoutPayReady ? "true" : "false"}
        >
          <div id="quote-step2-next" className="sr-only" />
          {/* Desktop checkout (1200px+): the total heads the sticky payment block, so price, terms
              and Pay stay on screen together. Hidden below 1200px; same amount as the summary. */}
          <p className="hidden" data-checkout-sticky-total>
            <span data-checkout-total-heading>
              <span data-checkout-total-label>Total to pay</span>
              <span data-checkout-total-secure>Secure booking</span>
            </span>{" "}
            <span data-checkout-total-amount>{amountLabel ?? "TBC"}</span>
          </p>

          {payNow &&
          liveQuote &&
          isMinibusNoticeRequest &&
          !activeOpenCheckout &&
          !ownerClosed &&
          !checkoutBlocked ? (
            <MinibusNoticeCheckoutNotice />
          ) : null}

          {payNow &&
          liveQuote &&
          isMinimumNoticeRequest &&
          !activeOpenCheckout &&
          !ownerClosed &&
          !checkoutBlocked ? (
            <ShortNoticeCheckoutNotice noticeHours={minimumBookingNoticeHours} />
          ) : null}

          {presentation === "homepage" && homepageFareChanged ? (
            <div
              className="rounded-xl border border-emerald/40 bg-emerald/10 px-3 py-2.5 text-sm text-white"
              data-homepage-fare-change
            >
              <p className="font-semibold text-emerald">Updated total: {formatQuote(paymentAmount ?? 0)}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/80">
                Your fare has changed from {formatQuote(homepageQuotedBaseline ?? 0)}.
                Please confirm the updated amount before continuing.
              </p>
              <label className="mt-1 flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-emerald"
                  checked={homepageFareChangeAck}
                  onChange={(event) => {
                    setHomepageFareChangeAck(event.target.checked);
                    if (event.target.checked) setSubmitError("");
                  }}
                />
                <span>I confirm the updated price.</span>
              </label>
            </div>
          ) : null}

          {isTooSoonCheckout ? null : (
          <BookingTermsConsent
            accepted={termsAccepted}
            onAcceptedChange={(checked) => {
              setTermsAccepted(checked);
              if (checked) setTermsError("");
            }}
            error={termsError}
            mode={
              isManualQuoteJourney
                ? "quote-request"
                : isAvailabilityRequest
                  ? "booking-request"
                  : payNow
                    ? "card-payment"
                    : "booking-request"
            }
            paymentAmountLabel={
              isEnquiryOnly || isManualQuoteJourney
                ? undefined
                : testChargeAmount !== null
                  ? "£1.00"
                  : selectedDepositCash && depositCashOffer
                    ? `${formatDepositCashGbp(depositCashOffer.depositGbp)} deposit`
                    : selectedCardBalance && cardBalanceOffer
                      ? `${formatDepositCashGbp(cardBalanceOffer.depositGbp)} deposit`
                      : amountLabel ?? undefined
            }
          />
          )}

          {isTooSoonCheckout ? null : (
          <MarketingOptIn checked={marketingOptIn} onCheckedChange={setMarketingOptIn} />
          )}

          {ownerClosed ? (
            <div id="owner-no-availability-blocked">
              <OwnerNoAvailabilityBlocked
                message={
                  isClosedAvailabilityError(paymentError)
                    ? paymentError
                    : OWNER_NO_AVAILABILITY_MESSAGE
                }
                onChooseAnotherDate={handleChooseAnotherDate}
                onChooseAnotherTime={handleChooseAnotherTime}
              />
            </div>
          ) : checkoutBlocked ? null : isTooSoonCheckout ? (
            <TooSoonCheckoutNotice
              leadHours={minimumShortNoticeLeadHours}
              onChooseAnotherTime={handleChooseAnotherTime}
              overnight={isOvernightTooSoon}
            />
          ) : payNow && liveQuote ? (
            <div className="space-y-2 sm:space-y-3">
              {!isAvailabilityRequest && !activeOpenCheckout ? (
                <p className="text-xs leading-relaxed text-white/70">
                  Your transfer is reserved for your selected pickup time.
                </p>
              ) : null}
              {paymentError && !isCustomerSmartAvailabilityBlockMessage(paymentError) ? (
                <div className="space-y-3">
                  <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {paymentError}
                  </p>
                  {renderBookingErrorHelp("payment-actions")}
                </div>
              ) : null}
              {paymentPopupBlocked && !paymentError ? (
                <div className="space-y-3">
                  <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Payment could not open automatically. Tap “Continue to secure payment” below, or message
                    us on WhatsApp if you still need help.
                  </p>
                  {renderBookingErrorHelp("payment-actions")}
                </div>
              ) : null}
              {activeOpenCheckout ? (
                <div className="space-y-3 rounded-2xl border border-emerald/35 bg-emerald/10 px-4 py-4">
                  <p className="text-sm font-semibold text-emerald">Secure payment ready</p>
                  <p className="text-xs leading-relaxed text-white/75">
                    Your booking details are saved for {activeOpenCheckout.amountLabel}. Continue to
                    secure payment to finish paying, or cancel payment and return to your quote.
                  </p>
                  {isMobileDevice === false ? (
                    <p className="text-xs leading-relaxed text-white/70">
                      Secure payment opens in a separate tab. Close it at any time to return to your saved quote.
                    </p>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleReturnToEditBooking}
                      className="btn-secondary w-full"
                    >
                      Cancel payment and return to quote
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenPaymentAgain}
                      disabled={paymentLoading}
                      className="btn-pay w-full disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {paymentLoading ? "Opening secure payment…" : "Continue to secure payment"}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartFreshCheckout}
                    className="w-full text-center text-xs font-medium quote-secondary underline-offset-2 hover:text-white hover:underline"
                  >
                    Start a new payment link
                  </button>
                </div>
              ) : (
                <>
                {showPaymentChoice && paymentAmount != null ? (
                  <div className="space-y-3" data-booking-payment-options>
                    <p className="text-sm font-semibold text-white">{DEPOSIT_CASH_CHOOSE_HEADING}</p>
                    <div className={`grid gap-2 ${showDepositCashChoice && showCardBalanceChoice ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                      {showCardBalanceChoice && cardBalanceOffer ? (
                        <button
                          type="button"
                          disabled={paymentLoading}
                          data-card-balance-option
                          aria-pressed={selectedCardBalance}
                          onClick={() => {
                            setPaymentMethod(PAYMENT_METHOD_DEPOSIT_CARD_BALANCE);
                            setCashAgreementAccepted(false);
                            setPaymentError((prev) =>
                              prev === CASH_AGREEMENT_REQUIRED_MESSAGE ? "" : prev,
                            );
                          }}
                          className={`min-h-11 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                            selectedCardBalance
                              ? "border-emerald bg-emerald/15"
                              : "border-white/20 bg-white/[0.03] hover:border-white/40"
                          }`}
                        >
                          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                            {CARD_BALANCE_OPTION_LABEL}
                            <span className="rounded-full bg-emerald/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald">
                              {CARD_BALANCE_BADGE}
                            </span>
                          </p>
                          <p className="mt-2 text-sm font-semibold text-emerald">
                            {todayPayLabel(cardBalanceOffer.depositGbp)}
                          </p>
                          <p className="mt-0.5 text-xs text-white/70">
                            {cardBalanceOptionSubline(cardBalanceOffer.balanceGbp)}
                          </p>
                        </button>
                      ) : null}
                      {showDepositCashChoice && depositCashOffer ? (
                      <button
                        type="button"
                        disabled={paymentLoading}
                        aria-pressed={paymentMethod === PAYMENT_METHOD_DEPOSIT_CASH}
                        onClick={() => {
                          setPaymentMethod(PAYMENT_METHOD_DEPOSIT_CASH);
                          setPaymentError((prev) =>
                            prev === CARD_BALANCE_AGREEMENT_REQUIRED_MESSAGE ? "" : prev,
                          );
                        }}
                        className={`min-h-11 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          paymentMethod === PAYMENT_METHOD_DEPOSIT_CASH
                            ? "border-emerald bg-emerald/15"
                            : "border-white/20 bg-white/[0.03] hover:border-white/40"
                        }`}
                      >
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                          {DEPOSIT_CASH_OPTION_LABEL}
                          <span className="rounded-full bg-emerald/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald">
                            {DEPOSIT_CASH_BADGE}
                          </span>
                        </p>
                        <p className="mt-2 text-sm font-semibold text-emerald">
                          {todayPayLabel(depositCashOffer.depositGbp)}
                        </p>
                        <p className="mt-0.5 text-xs text-white/70">
                          {formatDepositCashGbp(depositCashOffer.cashDueGbp)}{" "}
                          <span className="font-semibold text-white">cash on the day</span>
                        </p>
                      </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={paymentLoading}
                        aria-pressed={effectivePaymentMethod === PAYMENT_METHOD_FULL_ONLINE}
                        onClick={() => {
                          setPaymentMethod(PAYMENT_METHOD_FULL_ONLINE);
                          setCashAgreementAccepted(false);
                          setPaymentError((prev) =>
                            prev === CASH_AGREEMENT_REQUIRED_MESSAGE ||
                            prev === CARD_BALANCE_AGREEMENT_REQUIRED_MESSAGE
                              ? ""
                              : prev,
                          );
                        }}
                        className={`min-h-11 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          effectivePaymentMethod === PAYMENT_METHOD_FULL_ONLINE
                            ? "border-emerald bg-emerald/15"
                            : "border-white/20 bg-white/[0.03] hover:border-white/40"
                        }`}
                      >
                        <p className="text-sm font-semibold text-white">{FULL_ONLINE_OPTION_LABEL}</p>
                        <p className="mt-2 text-sm font-semibold text-emerald">
                          {depositCashOffer
                            ? todayPayLabel(depositCashOffer.totalFare)
                            : todayPayLabel(paymentAmount)}
                        </p>
                        <p className="mt-0.5 text-xs text-white/70">{nothingToPayOnTheDayLabel()}</p>
                      </button>
                    </div>
                    {selectedDepositCash ? (depositCashOffer ? (
                      <div data-cash-agreement className="rounded-xl border border-amber-300/35 bg-amber-500/10 px-2.5 py-1.5">
                        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm leading-snug text-white/92">
                          <input
                            type="checkbox"
                            checked={cashAgreementAccepted}
                            aria-required="true"
                            onChange={(event) => {
                              setCashAgreementAccepted(event.target.checked);
                              if (event.target.checked) {
                                setPaymentError((prev) =>
                                  prev === CASH_AGREEMENT_REQUIRED_MESSAGE ? "" : prev,
                                );
                              }
                            }}
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-navy-dark text-emerald focus:ring-emerald/30"
                          />
                          <span>{cashAgreementLabel(depositCashOffer.cashDueGbp)}</span>
                        </label>
                      </div>
                    ) : null) : null}
                    {selectedCardBalance && cardBalanceOffer ? (
                      <p data-card-balance-note className="text-xs leading-snug text-white/75">
                        {cardBalanceShortNote(
                          cardBalanceOffer.balanceGbp,
                          cardBalanceDueDateLabel(tripDate, tripTime),
                        )}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {isAvailabilityRequest && !activeOpenCheckout ? (
                  <ShortNoticePaymentFollowUp windowHours={shortNoticeConfirmationWindowHours} />
                ) : null}
                {checkoutPayHint ? (
                  <p className="hidden" data-pay-hint>{checkoutPayHint}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handlePayNow()}
                  disabled={previewPaymentsOff || paymentLoading || paymentUncertain || submitted || (selectedDepositCash && !cashAgreementAccepted)}
                  aria-busy={paymentLoading}
                  aria-describedby={paymentLoading ? "payment-loading-status" : undefined}
                  className="btn-pay w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {paymentLoading ? <span aria-hidden="true" className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" /> : null}
                  {previewPaymentsOff
                    ? "Payments are switched off on this preview"
                    : paymentLoading
                    ? isAvailabilityRequest && !isMinimumNoticeRequest
                      ? "Submitting booking request…"
                      : "Preparing your secure payment…"
                    : testChargeAmount !== null
                      ? "Pay £1.00 test charge"
                      : isMinibusNoticeRequest
                        ? `${MINIBUS_NOTICE_CTA} — ${amountLabel ?? formatQuote(liveQuote.amount)}`
                        : isMinimumNoticeRequest
                          ? `Book Now — ${amountLabel ?? formatQuote(liveQuote.amount)}`
                          : selectedCardBalance && cardBalanceOffer
                            ? cardBalancePayButtonLabel(cardBalanceOffer.depositGbp)
                            : showDepositCashChoice && depositCashOffer
                              ? selectedDepositCash
                                ? depositPayButtonLabel(depositCashOffer.depositGbp)
                                : fullPayButtonLabel(depositCashOffer.totalFare)
                              : showCardBalanceChoice && cardBalanceOffer
                                ? fullPayButtonLabel(cardBalanceOffer.totalFare)
                                : `Pay ${amountLabel ?? formatQuote(liveQuote.amount)} & Confirm Booking`}
                </button>
                {previewPaymentsOff ? (
                  <p data-preview-payments-off className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-center text-sm leading-snug text-white">
                    {PREVIEW_PAYMENTS_DISABLED_MESSAGE}
                  </p>
                ) : null}
                <p id="payment-loading-status" role="status" aria-live="polite" aria-atomic="true" className="text-center text-sm text-white/85">
                  {paymentLoading && !isAvailabilityRequest
                    ? paymentSlow
                      ? "Still connecting to secure payment. Please wait…"
                      : "Please wait. We’re connecting you to secure payment."
                    : ""}
                </p>
                <PaymentMethodLogos />
                </>
              )}
            </div>
          ) : usesWhatsApp && !isManualQuoteJourney ? (
            <div className="space-y-2">
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
                {submitted ? submitInProgressLabel : "Send request by email"}
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={submitted}
              className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitted ? submitInProgressLabel : confirmButtonLabel}
            </button>
          )}

          {liveQuote &&
          payNow &&
          !appliedPersonalQuote &&
          !submitted &&
          !activeOpenCheckout ? (
            <>
              {mobileDesign3 && saveQuoteSettings.enabled && (saveQuoteSettings.emailEnabled || saveQuoteSettings.whatsappEnabled) ? (
                <p className="hidden" data-d3-send-quote-note>Not ready to book yet?</p>
              ) : null}
              <button
                type="button"
                onClick={() => handleSaveQuoteClick()}
                style={!saveQuoteSettings.enabled || !(saveQuoteSettings.emailEnabled || saveQuoteSettings.whatsappEnabled) ? { display: "none" } : undefined}
                data-checkout-email-quote
                data-d3-send-quote={mobileDesign3 ? "" : undefined}
                className="w-full text-center text-xs font-semibold text-white/70 underline-offset-2 hover:text-white hover:underline"
              >
                {mobileDesign3 ? "Send me my quote" : "Email my quote"}
              </button>
            </>
          ) : null}

          {ownerClosed ? null : renderBookingErrorHelp("step3")}
          {renderStartNewQuoteControls("step3")}
          {saveQuotePrompt ? (
            <p className="text-center text-xs text-emerald/90" role="status">
              {saveQuotePrompt}
            </p>
          ) : null}
        </div>
        </div>
      </>
    );
  }

  function renderStep1BookButton(options?: { instantTransferLabel?: boolean }) {
    const instantTransferLabel = options?.instantTransferLabel === true;
    const amountLabel =
      paymentAmount != null && Number.isFinite(paymentAmount)
        ? formatQuote(paymentAmount)
        : null;
    const showTransferCta =
      instantTransferLabel &&
      Boolean(liveQuote) &&
      canPayNowOnline &&
      !isEnquiryOnly &&
      !showsRequestQuoteFlow &&
      !submitted &&
      amountLabel;
    return (
      <button
        type="submit"
        id="quote-book-now-button"
        onClick={() => {
          // Plain "Book" goes back to the normal payment default if the deposit pill was tapped earlier.
          if (paymentMethod === PAYMENT_METHOD_DEPOSIT_CARD_BALANCE) setPaymentMethod(PAYMENT_METHOD_DEPOSIT_CASH);
        }}
        disabled={
          submitted ||
          !quoteChoicesReady ||
          (presentation === "homepage" ? false : !isScheduleComplete) ||
          (instantPriceExpected && !mayPaintNumericFare) ||
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
          : isVehiclePersonalQuote
            ? "REQUEST QUOTE"
          : authoritativeQuoteFailed
            ? "Price unavailable"
            : vehicleFareUpdating && instantPriceExpected && !mayPaintNumericFare
            ? "Updating price…"
            : instantPriceExpected && !mayPaintNumericFare
            ? "Calculating your transfer price…"
            : design2Home && isVehiclePersonalQuote
            ? "Request quote"
            : design2Home
            ? "Continue"
            : showTransferCta && presentation === "homepage"
            ? (
                <>
                  {/* Desktop (1200px+) shows the second label; everything below 1200px is unchanged. */}
                  <span data-book-cta-default>{`BOOK THIS TRANSFER — ${amountLabel}`}</span>
                  <span className="hidden" data-book-cta-desktop>
                    Continue to booking
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden focusable="false">
                      <path d="M3 8h9.5M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </>
              )
            : showTransferCta
            ? `BOOK THIS TRANSFER — ${amountLabel}`
            : liveQuote && canPayNowOnline && !isEnquiryOnly && !showsRequestQuoteFlow
              ? "Book Now"
              : (
                <>
                  Continue to travel details
                  <svg
                    className="ml-1.5 h-4 w-4 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.2"
                      d="M5 12h14M13 6l6 6-6 6"
                    />
                  </svg>
                </>
              )}
      </button>
    );
  }

  function renderStep1SaveQuote(compact = false) {
    if (!saveQuoteSettings.enabled || !(saveQuoteSettings.emailEnabled || saveQuoteSettings.whatsappEnabled)) return null;
    if (
      !(
        liveQuote &&
        canPayNowOnline &&
        !isEnquiryOnly &&
        !showsRequestQuoteFlow &&
        !appliedPersonalQuote &&
        !submitted
      )
    ) {
      return null;
    }
    return (
      <button
        type="button"
        onClick={() => handleSaveQuoteClick()}
              style={!saveQuoteSettings.enabled || !(saveQuoteSettings.emailEnabled || saveQuoteSettings.whatsappEnabled) ? { display: "none" } : undefined}
        className={
          compact
            ? "inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-white/45 bg-white/5 px-3 text-sm font-semibold text-white"
            : "btn-secondary w-full"
        }
      >
        Email my quote
      </button>
    );
  }

  function renderStep1PrimaryActions() {
    return (
      <>
        {renderStep1BookButton()}
        {renderStep1SaveQuote()}
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

  const showInstantQuoteResultCard =
    quoteResultsReady &&
    quoteStep === 1 &&
    (Boolean(liveQuote) || instantPriceExpected) &&
    !isEnquiryOnly &&
    !isManualQuoteJourney &&
    !pricingConfirmationRequired &&
    !showsRequestQuoteFlow &&
    !exceedsOnlineCapacity &&
    effectivePassengers != null &&
    suitcases != null;

  // No automatic popups: the "Not ready to book yet?" dialog used to open by itself (exit-intent
  // on desktop, a 45-second timer on mobile). Removed (Nov 2026); dialogs open only on a click.

  function handleQuoteVehicleChoice(next: string) {
    const pax =
      effectivePartyPassengers(passengers, passengerLimit) ??
      (passengers != null && passengers >= 1 ? passengers : null);
    if (pax == null || suitcases == null) return;
    const chosen = canonicalVehicleType(next);
    if (
      !enabledVehicleTypesForQuote({
        publicMinibusEnabled,
        publicExecutiveEnabled,
      }).includes(chosen) ||
      !vehicleFitsParty(chosen, pax, suitcases)
    ) {
      return;
    }
    customerPickedVehicleRef.current = true;
    setManualVehicle(chosen);
    setChooseExecutive(next === EXECUTIVE_VEHICLE);
    setChooseMinibus(next === MINIBUS_VEHICLE_TYPE);
    setChooseEstate(next === ESTATE_VEHICLE);
    setVehicle(chosen);
  }

  /**
   * Desktop (1200px+) only, inside the navy price panel: the journey being priced, with
   * Edit journey to unfold the (otherwise folded) quote form. Hidden below 1200px, where
   * the existing journey summary and form are unchanged.
   */
  function renderDesktopResultsJourney() {
    if (presentation !== "homepage") return null;
    const party = effectivePassengers ?? passengers;
    return (
      <div className="hidden" data-results-journey>
        <div data-results-journey-head>
          <span>Your journey</span>
          <button
            type="button"
            data-results-journey-edit
            aria-expanded={desktopJourneyEditing}
            aria-controls="step1-journey-details"
            onClick={() => {
              const next = !desktopJourneyEditing;
              setDesktopJourneyEditing(next);
              if (next && typeof window !== "undefined") {
                window.requestAnimationFrame(() => {
                  const field = document.getElementById("pickup");
                  field?.scrollIntoView({ block: "center", behavior: "smooth" });
                  field?.focus({ preventScroll: true });
                });
              }
            }}
          >
            {desktopJourneyEditing ? "Done" : "Edit journey"}
          </button>
        </div>
        <ol data-results-route>
          {(
            [
              ["from", "Pickup", pickupLabel || "Pickup"],
              ["to", "Drop-off", dropoffLabel || "Drop-off"],
            ] as const
          ).map(([key, role, label]) => {
            const [name, ...rest] = label.split(", ");
            // "Bangor, UK" leaves nothing after the country is dropped — don't show a dangling "·".
            const detail = rest.filter((part) => part !== "UK").join(", ");
            return (
              <li key={key} data-results-stop={key}>
                <strong>{name}</strong>
                <span>
                  {role}
                  {detail ? ` · ${detail}` : ""}
                </span>
                {(key === "from" && isIncompletePickupAddress) || (key === "to" && isIncompleteDropoffAddress) ? (
                  <span data-results-stop-hint role="status">
                    Add a house number or building name.{" "}
                    <button
                      type="button"
                      data-results-stop-hint-edit
                      onClick={() => {
                        setDesktopJourneyEditing(true);
                        if (typeof window !== "undefined") {
                          window.requestAnimationFrame(() => {
                            const field = document.getElementById(key === "from" ? "pickup" : "dropoff");
                            field?.scrollIntoView({ block: "center", behavior: "smooth" });
                            field?.focus({ preventScroll: true });
                          });
                        }
                      }}
                    >
                      Edit {key === "from" ? "pickup" : "drop-off"}
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        <p data-results-chips>
          <span data-results-chip>
            {journeySummaryDate(tripDate)}
            {" · "}
            {checkoutTimeLabel("outbound") === "Pickup time" ? "" : "flight lands "}
            {tripTime ? tripTime.slice(0, 5) : "—"}
          </span>
          <span data-results-chip>{returnJourney ? "Return" : "One way"}</span>
          <span data-results-chip>
            {party} passenger{party === 1 ? "" : "s"}
            {" · "}
            {suitcases != null && suitcases >= 5
              ? "5+ suitcases"
              : `${suitcases ?? 0} suitcase${suitcases === 1 ? "" : "s"}`}
          </span>
          {returnJourney ? (
            <span data-results-chip data-results-chip-return>
              Return {journeySummaryDate(returnDate)}
              {" · "}
              {checkoutTimeLabel("return") === "Pickup time" ? "" : "flight lands "}
              {returnTime ? returnTime.slice(0, 5) : "—"}
            </span>
          ) : null}
          {quoteDirectionsHref() ? (
            <button
              type="button"
              data-results-view-route
              aria-haspopup="dialog"
              onClick={() => setQuoteActionOpen("route")}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
                <path d="M9 4v14M15 6v14" />
              </svg>
              View route
            </button>
          ) : null}
        </p>
      </div>
    );
  }

  /**
   * Desktop (1200px+) vehicle step: optional Meet & Greet, one per eligible airport pickup.
   * Each card sets the very same choice the checkout uses (the per-leg airport choice at
   * Belfast International / Belfast City, or the existing Dublin option), so checkout shows it
   * already chosen and editable, and the existing pricing charges it once. Prices come from
   * the owner's configured Meet & Greet fees. Not offered for request-only vehicles or Business
   * Class (its pickups already include Meet & Greet).
   */
  function desktopMeetGreetUpgrades() {
    type Upgrade = {
      key: string;
      airportName: string;
      legLabel: string | null;
      feeGbp: number;
      selected: boolean;
      /** True when checkout folds this fee into the transfer fare (Belfast airports); Dublin is added separately. */
      inTransferFare: boolean;
      toggle: () => void;
    };
    if (presentation !== "homepage" || quoteStep !== 1 || !quoteResultsReady) return [] as Upgrade[];
    if (testChargeAmount != null || appliedPersonalQuote) return [] as Upgrade[];
    if (
      publicVehicleRequiresPersonalQuote(quoteVehicle, publicPricing) ||
      isEnquiryOnly ||
      isExecutiveVehicle(quoteVehicle) ||
      paymentAmount == null ||
      !Number.isFinite(paymentAmount) ||
      !mayPaintNumericFare ||
      vehicleFareUpdating
    ) {
      return [] as Upgrade[];
    }
    const airportNames: Record<string, string> = {
      BFS: "Belfast International",
      BHD: "Belfast City",
      DUB: "Dublin Airport",
    };
    const upgrades: Upgrade[] = [];
    for (const visit of listTerminalAccessVisits({
      airportCode: effectiveAirportCode,
      fromAirport: isFromAirport,
      returnJourney,
      isAirportToAirport: isAirportToAirportJourney,
      pickupAirportCode,
      dropoffAirportCode,
    })) {
      if (visit.service !== "pick-up") continue;
      const key = airportVisitKey(visit);
      const current =
        terminalAccessChoices[key] ?? (visit.leg === "return" ? returnAccessChoice : outboundAccessChoice);
      upgrades.push({
        key,
        airportName: airportNames[visit.airportCode] ?? visit.airportCode,
        legLabel: returnJourney ? (visit.leg === "return" ? "Return pickup" : "Outbound pickup") : null,
        feeGbp: meetGreetFeeGbp(visit.airportCode, publicPricing.meetGreet),
        selected: current === "meet-greet",
        inTransferFare: true,
        toggle: () =>
          setTerminalAccessChoices((choices) => ({
            ...choices,
            [key]: current === "meet-greet" ? "free" : "meet-greet",
          })),
      });
    }
    if (bookingMeetGreetEligible && bookingMeetGreetAirport) {
      upgrades.push({
        key: "dub-meet-greet",
        airportName: airportNames.DUB,
        legLabel: returnJourney ? "Outbound pickup" : null,
        feeGbp: bookingMeetGreetPrice,
        selected: bookingMeetGreetSelected,
        inTransferFare: false,
        toggle: () => setBookingMeetGreetSelected((selected) => !selected),
      });
    }
    return upgrades.filter((upgrade) => Number.isFinite(upgrade.feeGbp) && upgrade.feeGbp > 0);
  }

  function renderDesktopMeetGreetUpgrades() {
    const upgrades = desktopMeetGreetUpgrades();
    if (!upgrades.length) return null;
    return (
      <div className="hidden" data-results-upgrades>
        <p data-results-upgrades-heading>Optional upgrade</p>
        {upgrades.map((upgrade) => (
          <label key={upgrade.key} data-results-upgrade data-selected={upgrade.selected ? "true" : "false"}>
            <input
              type="checkbox"
              checked={upgrade.selected}
              onChange={upgrade.toggle}
              data-results-upgrade-input
              aria-describedby={`upgrade-${upgrade.key}-detail`}
            />
            <span data-results-upgrade-icon aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="12" rx="2" />
                <path d="M7 21h10M12 17v4M7 10h6M7 13h4" />
              </svg>
            </span>
            <span data-results-upgrade-copy>
              <strong>
                Meet &amp; Greet at arrivals
                <small>
                  {upgrade.airportName}
                  {upgrade.legLabel ? ` · ${upgrade.legLabel}` : ""}
                </small>
              </strong>
              <span id={`upgrade-${upgrade.key}-detail`}>
                Your driver meets you inside the terminal with a name board and helps with your luggage.
              </span>
            </span>
            <span data-results-upgrade-price>+{formatQuote(upgrade.feeGbp)}</span>
            <span data-results-upgrade-state aria-hidden="true">
              {upgrade.selected ? "Added" : "Add Meet & Greet"}
            </span>
          </label>
        ))}
      </div>
    );
  }

  /**
   * Desktop (1200px+) vehicle step: "View price breakdown" under the total in the navy summary.
   * Lines come from the same fare breakdown as the quoted price (night/weekend adjustments stay
   * inside the vehicle fare, as customerFacingFareBreakdown presents them). The vehicle fare is the
   * remainder after the other lines, so the lines always add up to the total shown. Shown only
   * when that breakdown is exactly the price on screen.
   */
  /** Price breakdown lines for the vehicle step (desktop panel and the mobile Price details sheet). */
  function resultsBreakdownData(): { rows: Array<[string, string]>; total: number } | null {
    if (!openWebsiteFareBreakdown || testChargeAmount != null || appliedPersonalQuote) return null;
    if (publicVehicleRequiresPersonalQuote(quoteVehicle, publicPricing) || isEnquiryOnly) return null;
    if (paymentAmount == null || !Number.isFinite(paymentAmount) || !mayPaintNumericFare || vehicleFareUpdating) return null;
    const fare = customerFacingFareBreakdown(openWebsiteFareBreakdown);
    if (Math.abs(fare.finalAmountPayableGbp - paymentAmount) >= 0.005) return null;
    const pence = (value: number) => Math.round(value * 100) / 100;
    const upgrades = desktopMeetGreetUpgrades().filter((upgrade) => upgrade.selected);
    const access = pence(fare.airportAccessChargeGbp);
    const fixed = pence(fare.airportFixedCostsGbp);
    const returnSaving = pence(fare.returnJourneySavingGbp);
    const offerSaving = pence(fare.returnOfferSavingGbp);
    const specialSaving = pence(currentServerFareParts?.emptyRunSavingGbp ?? 0);
    const vehicleFare = pence(paymentAmount - access - fixed + returnSaving + offerSaving + specialSaving);
    if (!(vehicleFare > 0)) return null;
    const total = pence(paymentAmount + upgrades.reduce((sum, upgrade) => sum + upgrade.feeGbp, 0));
    const vehicleName = quoteVehicle === ESTATE_VEHICLE ? "Estate" : vehicleShortLabel(quoteVehicle);
    const rows: Array<[string, string]> = [
      [fare.returnJourney ? `${vehicleName} fare, both journeys` : `${vehicleName} fare`, formatQuote(vehicleFare)],
      ...(specialSaving > 0 ? [["Special price saving", `−${formatQuote(specialSaving)}`] as [string, string]] : []),
      ...(returnSaving > 0 ? [["5% return discount", `−${formatQuote(returnSaving)}`] as [string, string]] : []),
      ...(offerSaving > 0 ? [[`Return saving (${fare.returnOfferDiscountPercentLabel})`, `−${formatQuote(offerSaving)}`] as [string, string]] : []),
      ...(fixed > 0 ? [["Airport charges", `+${formatQuote(fixed)}`] as [string, string]] : []),
      ...(access > 0 ? [["Airport access", `+${formatQuote(access)}`] as [string, string]] : []),
      ...upgrades.map(
        (upgrade) =>
          [
            `Meet & Greet · ${upgrade.airportName}${upgrade.legLabel ? ` (${upgrade.legLabel.toLowerCase()})` : ""}`,
            `+${formatQuote(upgrade.feeGbp)}`,
          ] as [string, string],
      ),
    ];
    return { rows, total };
  }

  /** Mobile: "Price details" in the bottom bar opens this sheet. */
  function renderPriceDetailsSheet() {
    const data = resultsBreakdownData();
    if (!data) return null;
    const close = () => setPriceSheetOpen(false);
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Price details"
        data-price-details-sheet
        className="fixed inset-0 z-[80] flex items-end justify-center"
        style={{ backgroundColor: "rgba(7, 28, 56, 0.55)" }}
        onClick={close}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      >
        <div
          className="w-full max-w-md rounded-t-3xl px-5 pb-8 pt-5 shadow-2xl"
          style={{ backgroundColor: "#ffffff", color: "#071c38" }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-lg font-extrabold" style={{ color: "#071c38" }}>Price details</h3>
            <button
              type="button"
              autoFocus
              onClick={close}
              className="min-h-11 rounded-xl border px-4 text-sm font-bold"
              style={{ borderColor: "#cbd5e1", color: "#071c38", backgroundColor: "#ffffff" }}
            >
              Close
            </button>
          </div>
          <dl className="space-y-2 text-base">
            {data.rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt style={{ color: "#334155" }}>{label}</dt>
                <dd
                  className="shrink-0 tabular-nums font-semibold"
                  style={{ color: value.startsWith("−") ? "#047857" : "#071c38" }}
                >
                  {value}
                </dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t pt-3" style={{ borderColor: "#e2e8f0" }}>
              <dt className="font-extrabold" style={{ color: "#071c38" }}>Total</dt>
              <dd className="shrink-0 tabular-nums text-lg font-extrabold" style={{ color: "#071c38" }}>
                {formatQuote(data.total)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm" style={{ color: "#475569" }}>
            Fixed price. Night, weekend and bank holiday rates are included in the vehicle fare.
          </p>
        </div>
      </div>
    );
  }

  function renderDesktopResultsBreakdown() {
    if (presentation !== "homepage" || quoteStep !== 1 || !quoteResultsReady) return null;
    const data = resultsBreakdownData();
    if (!data) return null;
    const { rows, total } = data;
    return (
      <div className="hidden" data-results-breakdown data-open={desktopBreakdownOpen ? "true" : "false"}>
        <button
          type="button"
          data-results-breakdown-toggle
          aria-expanded={desktopBreakdownOpen}
          aria-controls="desktop-results-breakdown"
          onClick={() => {
            const opening = !desktopBreakdownOpen;
            setDesktopBreakdownOpen(opening);
            // Short windows: keep Continue to booking on screen when the lines open above it.
            if (opening && typeof window !== "undefined") {
              // (scrollIntoView does nothing inside a sticky panel, so scroll the page by the overflow.)
              window.setTimeout(() => {
                const button = document.querySelector<HTMLElement>(":is(.homepage-hero, [data-hub-quote]) [data-quote-result-card] [data-quote-result-main-action] button");
                if (!button) return;
                const overflow = button.getBoundingClientRect().bottom - window.innerHeight + 16;
                if (overflow > 0) window.scrollBy({ top: overflow, behavior: "smooth" });
              }, 60);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && desktopBreakdownOpen) {
              event.preventDefault();
              setDesktopBreakdownOpen(false);
            }
          }}
        >
          {desktopBreakdownOpen ? "Hide price breakdown" : "View price breakdown"}
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true" focusable="false">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div id="desktop-results-breakdown" role="region" aria-label="Price breakdown" hidden={!desktopBreakdownOpen} data-results-breakdown-panel>
          <dl>
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
            <div data-results-breakdown-total>
              <dt>Total</dt>
              <dd>{formatQuote(total)}</dd>
            </div>
          </dl>
          <p>Night, weekend and bank holiday rates are included in the vehicle fare.</p>
        </div>
      </div>
    );
  }

  /** Desktop (1200px+) vehicle step: quote actions under Continue in the navy summary. */
  function renderDesktopResultsActions() {
    if (presentation !== "homepage" || quoteStep !== 1 || !quoteResultsReady) return null;
    const saveAvailable = saveQuoteSettings.enabled && (saveQuoteSettings.emailEnabled || saveQuoteSettings.whatsappEnabled);
    return (
      <div className="hidden" data-results-secondary-actions>
        <div data-results-secondary-row>
          {saveAvailable ? (
            <button
              type="button"
              data-results-email-quote
              aria-haspopup="dialog"
              onClick={() => handleSaveQuoteClick()}
              disabled={isVehiclePersonalQuote}
              title={isVehiclePersonalQuote ? "Available once your personalised price is confirmed." : undefined}
            >
              Email quote
            </button>
          ) : null}
          <DesktopQuoteEnquiry className="desktop-results-link" journey={desktopEnquiryJourney()} />
        </div>
        {startNewQuotePlacement === "results" ? (
          <button type="button" data-results-start-new aria-haspopup="dialog" onClick={() => setQuoteActionOpen("restart")}>
            Start a new quote
          </button>
        ) : null}
      </div>
    );
  }

  /** Desktop (1200px+) price panel, when an upgrade is chosen: transfer + upgrades = total. */
  function renderDesktopResultsTotal() {
    const chosen = desktopMeetGreetUpgrades().filter((upgrade) => upgrade.selected);
    if (!chosen.length || paymentAmount == null) return null;
    const total = Math.round((paymentAmount + chosen.reduce((sum, upgrade) => sum + upgrade.feeGbp, 0)) * 100) / 100;
    const vehicleName = quoteVehicle === ESTATE_VEHICLE ? "Estate" : vehicleShortLabel(quoteVehicle);
    return (
      <div className="hidden" data-results-upgrade-lines aria-live="polite">
        <p>
          <span>{vehicleName} transfer</span>
          <span>{formatQuote(paymentAmount)}</span>
        </p>
        {chosen.map((upgrade) => (
          <p key={upgrade.key} data-results-upgrade-line>
            <span>
              Meet &amp; Greet · {upgrade.airportName}
              {upgrade.legLabel ? ` (${upgrade.legLabel.toLowerCase()})` : ""}
            </span>
            <span>{formatQuote(upgrade.feeGbp)}</span>
          </p>
        ))}
        <p data-results-upgrade-total>
          <span>Your current total</span>
          <strong>{formatQuote(total)}</strong>
        </p>
      </div>
    );
  }

  /** Desktop (1200px+) price panel: flight monitoring reassurance for airport pickups. */
  function renderDesktopResultsFlight() {
    if (presentation !== "homepage") return null;
    const pickups = listAirportPickupLegs({
      airportCode: effectiveAirportCode || null,
      fromAirport: isFromAirport,
      returnJourney,
      isAirportToAirport: isAirportToAirportJourney,
      pickupAirportCode,
      dropoffAirportCode,
    });
    if (!pickups.length) return null;
    return (
      <p className="hidden" data-results-flight>
        <strong>Flight monitoring included</strong>
        <span>Add your flight number at the next step so we can track your arrival.</span>
      </p>
    );
  }

  /** Desktop (1200px+) price panel: what the fare includes (published policy wording). */
  function renderDesktopResultsIncluded() {
    if (presentation !== "homepage") return null;
    const requestOnly = publicVehicleRequiresPersonalQuote(quoteVehicle, publicPricing) || isEnquiryOnly;
    const airportPickup = checkoutTimeLabel("outbound") !== "Pickup time";
    return (
      <ul className="hidden" data-results-included>
        {requestOnly ? null : <li>Fixed price, confirmed before you pay</li>}
        <li>
          {airportPickup
            ? "Up to 60 minutes’ complimentary waiting from your flight’s actual landing time"
            : "Up to 10 minutes’ complimentary waiting at pickup"}
        </li>
        <li>Free cancellation up to 24 hours before pickup</li>
      </ul>
    );
  }

  /**
   * Desktop (1200px+) vehicle list: the fare beside each vehicle. Display only.
   * - Selected vehicle: exactly the amount in the price panel.
   * - Other vehicles: the Worker fare already fetched for them (the existing parallel
   *   request), run through the same fare breakdown as the price panel. No extra requests.
   * Safety check: the selected vehicle is re-derived the same way; if that does not match
   * the panel to the penny, other vehicles show no price (the customer selects to see it).
   * Request-only vehicles never get a price here.
   */
  function desktopVehiclePriceLabels(): Partial<Record<string, string>> {
    if (presentation !== "homepage" || quoteStep !== 1 || passengers == null || suitcases == null) return {};
    const labels: Partial<Record<string, string>> = {};
    const requestOnly = (vehicleType: string) => publicVehicleRequiresPersonalQuote(vehicleType, publicPricing);
    if (
      requestOnly(quoteVehicle) ||
      isEnquiryOnly ||
      paymentAmount == null ||
      !Number.isFinite(paymentAmount) ||
      !mayPaintNumericFare ||
      vehicleFareUpdating ||
      authoritativeQuoteFailed
    ) {
      return labels;
    }
    labels[quoteVehicle] = formatQuote(paymentAmount);
    if (
      !openWebsiteFareBreakdown ||
      testChargeAmount != null ||
      bookingMeetGreetCharge !== 0 ||
      isExecutiveVehicle(quoteVehicle) ||
      transferPaymentAmount == null
    ) {
      return labels;
    }
    const requestedPassengers: number = effectivePassengers ?? passengers;
    const suitcaseCount: number = suitcases;
    const transferTotal: number = transferPaymentAmount;
    const keyFor = (vehicleType: string) =>
      quoteFareRequestKey({
        pickup: pickupAddress.trim(),
        dropoff: dropoffAddress.trim(),
        passengers: requestedPassengers,
        suitcases: suitcaseCount,
        vehicle: vehicleType,
        outboundDate: tripDate.trim(),
        outboundTime: tripTime.trim(),
        returnJourney,
        returnDate,
        returnTime,
      });
    const totalFor = (vehicleType: string): number | null => {
      const parts = authoritativeFareCacheRef.current.get(keyFor(vehicleType));
      if (!parts || parts.vehicleType !== vehicleType) return null;
      return desktopWebsiteTotalFromParts(vehicleType, parts);
    };
    const selectedCheck = totalFor(quoteVehicle);
    if (selectedCheck == null || Math.abs(selectedCheck - transferTotal) >= 0.005) {
      return labels;
    }
    const paxNow = effectivePartyPassengers(passengers, passengerLimit) ?? (passengers >= 1 ? passengers : null);
    if (paxNow == null) return labels;
    for (const vehicleType of suitableVehicleTypesForParty(paxNow, suitcases, {
      publicMinibusEnabled,
      publicExecutiveEnabled,
    })) {
      if (vehicleType === quoteVehicle || requestOnly(vehicleType) || isExecutiveVehicle(vehicleType)) continue;
      const total = totalFor(vehicleType);
      if (total != null) labels[vehicleType] = formatQuote(total);
    }
    return labels;
  }

  /** Same website fare composition the selected vehicle's price uses, from journey/fixed/surcharge parts. */
  function desktopWebsiteTotalFromParts(
    vehicleType: string,
    parts: { journeyFareGbp: number; airportFixedCostsGbp: number; nightWeekendSurchargeGbp?: number | null; preserveBfsMinimumPence?: boolean | null },
  ): number | null {
    const applyReturnOffer =
      Boolean(returnOfferToken) && !returnJourney && isReturnOfferAirportJourney(pickupAddress, dropoffAddress);
    const breakdown = buildOpenWebsiteFareBreakdown({
        preserveFixedFarePence:
          Boolean(parts.preserveBfsMinimumPence) ||
          postcodeFareHasPence({
            enabled: publicPricing.postcodePricingEnabled,
            rules: publicPricing.postcodeRules,
            context: {
              address: isFromAirport ? dropoffAddress : pickupAddress,
              airportCode: effectiveAirportCode,
              fromAirport: isFromAirport,
            },
            vehicle: vehicleType,
            estateSupplement: publicPricing.estate.upliftGbp,
            returnJourney,
          }),
        journeyFareBeforeAirportAccessGbp: parts.journeyFareGbp,
        airportFixedCostsGbp:
          airportFeeResolution.lines.length > 0 ? airportFeeResolution.totalAppliedGbp : parts.airportFixedCostsGbp,
        nightWeekendSurchargeGbp: parts.nightWeekendSurchargeGbp ?? 0,
        nightWeekendSurchargeLabel: configuredSurchargeLabel,
        nightWeekendSurchargeExplanation: configuredSurchargeExplanation,
        airportAccessChargeGbp: airportAccessQuote.airportAccessChargeGbp,
        outboundAirportAccessChargeGbp: airportAccessQuote.outboundAirportAccessChargeGbp,
        returnAirportAccessChargeGbp: airportAccessQuote.returnAirportAccessChargeGbp,
        returnJourney,
        ...(applyReturnOffer ? { returnOfferDiscountRate: RETURN_OFFER_CONFIG.discountRate } : {}),
      });
    const total = breakdown?.finalAmountPayableGbp;
    return typeof total === "number" && Number.isFinite(total) ? total : null;
  }

  /** On-device estimate parts for a vehicle (existing shared calculators), shaped like the Worker parts. */
  function desktopEstimateParts(vehicleType: typeof quoteVehicle) {
    const estimate = estimateFareFor(vehicleType);
    if (!estimate || typeof estimate.amount !== "number" || !Number.isFinite(estimate.amount)) return null;
    const fixed =
      typeof estimate.airportFixedCostsGbp === "number" && Number.isFinite(estimate.airportFixedCostsGbp)
        ? Math.max(0, Math.round(estimate.airportFixedCostsGbp * 100) / 100)
        : 0;
    const journey =
      typeof estimate.journeyFareGbp === "number" && Number.isFinite(estimate.journeyFareGbp)
        ? Math.max(0, Math.round(estimate.journeyFareGbp * 100) / 100)
        : Math.max(0, Math.round((estimate.amount - fixed) * 100) / 100);
    const surcharge =
      typeof estimate.nightWeekendSurchargeGbp === "number" && Number.isFinite(estimate.nightWeekendSurchargeGbp)
        ? Math.max(0, Math.round(estimate.nightWeekendSurchargeGbp * 100) / 100)
        : 0;
    return {
      journeyFareGbp: journey,
      airportFixedCostsGbp: fixed,
      nightWeekendSurchargeGbp: surcharge,
      preserveBfsMinimumPence: Boolean(estimate.preserveBfsMinimumPence),
    };
  }

  /**
   * Desktop (1200px+): when the owner has made the 7 Seater request-only, its row shows the
   * on-device estimate for this journey (existing shared formulas) as an indicative starting price, subject to
   * availability, with Request a quote. Nothing is shown when no estimate is available.
   */
  function desktopRequestOnlyEstimates(): Partial<Record<string, string>> {
    if (presentation !== "homepage" || quoteStep !== 1 || testChargeAmount != null) return {};
    if (!publicVehicleRequiresPersonalQuote(MINIBUS_VEHICLE_TYPE, publicPricing)) return {};
    if (
      !openWebsiteFareBreakdown ||
      !mayPaintNumericFare ||
      vehicleFareUpdating ||
      transferPaymentAmount == null ||
      !Number.isFinite(transferPaymentAmount) ||
      publicVehicleRequiresPersonalQuote(quoteVehicle, publicPricing) ||
      isExecutiveVehicle(quoteVehicle)
    ) {
      return {};
    }
    // Self-check: the same estimate method must reproduce the selected vehicle's real quoted price.
    const selectedParts = desktopEstimateParts(quoteVehicle);
    const selectedTotal = selectedParts ? desktopWebsiteTotalFromParts(quoteVehicle, selectedParts) : null;
    if (selectedTotal == null || Math.abs(selectedTotal - transferPaymentAmount) >= 0.005) return {};
    const minibusParts = desktopEstimateParts(MINIBUS_VEHICLE_TYPE);
    const amount = minibusParts ? desktopWebsiteTotalFromParts(MINIBUS_VEHICLE_TYPE, minibusParts) : null;
    return amount != null && Number.isFinite(amount) && amount > 0
      ? { [MINIBUS_VEHICLE_TYPE]: formatQuote(amount) }
      : {};
  }

  function renderQuoteVehicleChoice() {
    if (passengers == null || suitcases == null) {
      return null;
    }
    return (
      <>
      {renderEmptyRunNotice()}
      <QuoteVehicleCategories
        passengers={passengers}
        suitcases={suitcases}
        selectedVehicle={quoteVehicle}
        onSelectVehicle={handleQuoteVehicleChoice}
        publicMinibusEnabled={publicMinibusEnabled}
        publicExecutiveEnabled={publicExecutiveEnabled}
        requestQuoteVehicles={enabledVehicleTypesForQuote({ publicMinibusEnabled, publicExecutiveEnabled }).filter((v) => publicVehicleRequiresPersonalQuote(v, publicPricing))}
        hideUnsuitable={presentation === "homepage"}
        heading={design2Home ? "Choose your vehicle" : undefined}
        desktopPrices={desktopVehiclePriceLabels()}
        desktopRequestPrices={desktopRequestOnlyEstimates()}
      />
      </>
    );
  }

  function renderInstantQuoteResultCard() {
    const layoutBusinessClassInclusions = publicExecutiveEnabled &&
      !publicVehicleRequiresPersonalQuote(EXECUTIVE_VEHICLE, publicPricing)
      ? renderBusinessClassInclusions(true) : null;
    if (isVehiclePersonalQuote) {
      const businessClass = isExecutiveVehicle(quoteVehicle);
      return (
        <QuoteResultShowcase
          ref={quoteSelectedVehicleCardRef}
          desktopJourney={<>{renderDesktopResultsJourney()}{renderDesktopResultsIncluded()}{renderDesktopResultsFlight()}{renderDesktopResultsTotal()}</>}
            desktopBreakdown={renderDesktopResultsBreakdown()}
            desktopActions={renderDesktopResultsActions()}
          vehicleType={quoteVehicle}
          passengers={effectivePassengers as number}
          suitcases={suitcases as number}
          priceLabel={effectiveAirportCode ? "YOUR FIXED AIRPORT TRANSFER PRICE" : "Fixed price"}
          formattedPrice=""
          layoutBusinessClassInclusions={layoutBusinessClassInclusions}
          requestQuote={{
            heading: `${vehicleShortLabel(quoteVehicle)} — Request a Quote`,
            description: businessClass
              ? "Executive airport transfers tailored to your requirements. Contact us for a personalised quotation."
              : "Group airport transfers tailored to your requirements. Contact us for a personalised quotation.",
          }}
          bookButton={design2Home ? null : renderStep1BookButton()}
        />
      );
    }
    const authoritativeTotal =
      testChargeAmount ??
      (appliedPersonalQuote
        ? (pricedFare?.totalGbp ?? appliedPersonalQuote.agreedAmount)
        : authoritativeFareReady
          ? (pricedFare?.totalGbp ?? null)
          : null);
    const priceUpdating =
      vehicleFareUpdating && !authoritativeQuoteFailed && authoritativeTotal == null;
    const liveLabel =
      authoritativeTotal != null && Number.isFinite(authoritativeTotal)
        ? formatQuote(authoritativeTotal)
        : null;
    const amountLabel = authoritativeQuoteFailed
      ? AUTHORITATIVE_QUOTE_UNAVAILABLE_MESSAGE
      : liveLabel
        ? liveLabel
        : "Calculating…";
    // Pickup 30+ days away: show the 20% deposit right under the price.
    const quoteDepositOffer =
      authoritativeTotal != null &&
      !priceUpdating &&
      !appliedPersonalQuote &&
      testChargeAmount == null &&
      !isAvailabilityRequest &&
      isCardBalanceDateEligible(tripDate, tripTime)
        ? calculateCardBalanceQuote(authoritativeTotal)
        : null;
    const quoteDepositNote = quoteDepositOffer?.eligible
      ? cardBalanceQuoteScreenNote(quoteDepositOffer.depositGbp)
      : null;
    // One-tap Business Class upgrade under a Saloon/Estate price (instant-price mode only).
    const offerBusinessClassUpgrade =
      publicExecutiveEnabled &&
      !publicVehicleRequiresPersonalQuote(EXECUTIVE_VEHICLE, publicPricing) &&
      !isExecutiveVehicle(quoteVehicle) &&
      !appliedPersonalQuote &&
      testChargeAmount == null &&
      !submitted &&
      effectivePassengers != null &&
      suitcases != null &&
      vehicleFitsParty(EXECUTIVE_VEHICLE, effectivePassengers, suitcases);
    const businessClassUpgrade = offerBusinessClassUpgrade ? (
      <button
        type="button"
        data-business-class-upgrade
        onClick={() => handleQuoteVehicleChoice(EXECUTIVE_VEHICLE)}
        className="mt-2 flex w-full items-center gap-3 rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-left transition-colors hover:bg-amber-300/15"
      >
        <span aria-hidden="true" className="text-lg">👑</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-white">Upgrade to Business Class</span>
          <span className="block text-xs leading-snug text-white/70">
            Mercedes, BMW or Lexus{isFromAirport ? ", with Meet & Greet in arrivals" : ""}. Tap to see your price.
          </span>
        </span>
        <span aria-hidden="true" className="text-sm font-semibold text-amber-200">View</span>
      </button>
    ) : null;
    return (
      <>
      <QuoteResultShowcase
        ref={quoteSelectedVehicleCardRef}
        desktopJourney={<>{renderDesktopResultsJourney()}{renderDesktopResultsIncluded()}{renderDesktopResultsFlight()}{renderDesktopResultsTotal()}</>}
            desktopBreakdown={renderDesktopResultsBreakdown()}
            desktopActions={renderDesktopResultsActions()}
        vehicleType={quoteVehicle}
        passengers={effectivePassengers as number}
        suitcases={suitcases as number}
        priceLabel={effectiveAirportCode ? "Your fixed airport transfer price" : "Your fixed transfer price"}
        desktopPriceLabel={presentation === "homepage" && quoteStep === 1 ? "Your current total" : undefined}
        formattedPrice={authoritativeQuoteFailed ? "Calculating…" : amountLabel}
        priceUpdating={priceUpdating}
        surchargeNote={null}
        depositNote={quoteDepositNote}
        trustBadge={<GoogleReviewsBadge className="!px-2.5 !py-1 !text-xs" />}
        onDepositSelect={() => {
          setPaymentMethod(PAYMENT_METHOD_DEPOSIT_CARD_BALANCE);
          setCashAgreementAccepted(false);
        }}
        businessClassInclusions={renderBusinessClassInclusions()}
        priceUnavailable={authoritativeQuoteFailed}
        onRetryPrice={retryAuthoritativeQuote}
        hasAirportCollection={isFromAirport || (returnJourney && Boolean(isAirportTrip || dropoffAirportCode))}
        layoutBusinessClassInclusions={layoutBusinessClassInclusions}
        bookButton={design2Home ? null : renderStep1BookButton({ instantTransferLabel: true })}
      />
      {businessClassUpgrade}
      </>
    );
  }

  /** Empty Run: show the saving already applied, or a cheaper time the same day. */
  function renderEmptyRunNotice() {
    const parts = currentServerFareParts;
    if (!parts || authoritativeQuoteFailed) return null;
    const gbp = (n: number) => `£${n % 1 ? n.toFixed(2) : n.toFixed(0)}`;
    if (parts.emptyRunSavingGbp && parts.emptyRunNormalAmountGbp) {
      return (
        <div
          data-empty-run-applied
          className="mb-3 mt-1 rounded-2xl border-2 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm text-slate-900"
        >
          <p className="text-base font-extrabold text-emerald-800">Special price: you save {gbp(parts.emptyRunSavingGbp)}</p>
          <p className="mt-0.5 text-slate-800">
            Our car is already heading that way at this time, so we&apos;ve lowered your fare from{" "}
            <span className="line-through">{gbp(parts.emptyRunNormalAmountGbp)}</span>.
          </p>
        </div>
      );
    }
    const offer = parts.emptyRunOffer;
    if (!offer) return null;
    const clock = formatCustomerClock(offer.tripTime) || offer.tripTime;
    return (
      <div
        data-empty-run-offer
        className="mb-3 mt-1 rounded-2xl border-2 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm text-slate-900"
      >
        <p className="text-base font-extrabold text-emerald-800">
          Save {gbp(offer.estimatedSavingGbp)} if you can travel {offer.direction} at {clock}
        </p>
        <p className="mt-0.5 text-slate-800">
          Our car is already heading that way, so a {clock} pickup is about {gbp(offer.estimatedAmountGbp)}.
        </p>
        <button
          type="button"
          className="empty-run-glow mt-2 inline-flex min-h-11 items-center rounded-xl px-4 font-bold"
          style={{ backgroundColor: "#047857", color: "#ffffff" }}
          disabled={selectingAlternativeTime != null}
          onClick={() => void handleSelectAvailabilityAlternative({ tripDate: offer.tripDate, tripTime: offer.tripTime })}
        >
          {selectingAlternativeTime === offer.tripTime ? "Updating…" : `Switch to ${clock}`}
        </button>
      </div>
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
        title={quoteActionOpen === "route" ? "View route" : restarting ? "Need a quote for a different journey?" : quoteActionOpen === "help" ? "Not ready to book yet?" : "WhatsApp"}
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
        ) : quoteActionOpen === "help" ? (
          <div data-quote-help-nudge>
            <p className="quote-secondary text-sm leading-relaxed">
              Get this price emailed to you so you can book whenever you&apos;re ready. Or if you&apos;ve a question
              about luggage, child seats, flight delays or where to meet your driver, message us on WhatsApp.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {saveQuoteSettings.enabled && saveQuoteSettings.emailEnabled ? (
                <button
                  type="button"
                  data-quote-help-email
                  onClick={() => {
                    setQuoteActionOpen(null);
                    handleSaveQuoteClick("email");
                  }}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy"
                >
                  Email me this quote
                </button>
              ) : null}
              <a
                href={whatsAppSendQuoteHref({
                  pickup: pickupAddress,
                  dropoff: dropoffAddress,
                  tripDate,
                  tripTime,
                  returnJourney: journeyMode == null ? null : journeyMode === "return",
                  returnDate,
                  returnTime,
                  passengers: effectivePassengers ?? passengers,
                  suitcases,
                })}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setQuoteActionOpen(null)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#25D366]/60 px-4 py-3 text-sm font-semibold text-white"
              >
                <QuoteResultActionIcon name="whatsapp" className="h-5 w-5 text-[#25D366]" />
                Ask a question on WhatsApp
              </a>
              <button
                type="button"
                onClick={() => setQuoteActionOpen(null)}
                className="rounded-xl border border-white/25 px-4 py-3 text-sm font-semibold text-white"
              >
                No thanks, back to my quote
              </button>
            </div>
          </div>
        ) : <QuoteHelpContact variant="card" />}
      </QuoteActionDialog>
    );
  }

  /** Quote details included in an email enquiry (same text wherever the enquiry is opened). */
  function desktopEnquiryJourney() {
    return [
      `Journey: ${pickupAddress.trim()} → ${dropoffAddress.trim()}`,
      `Vehicle: ${vehicleShortLabel(quoteVehicle)}`,
      `Party: ${effectivePassengers ?? "Not selected"} passengers · ${suitcases ?? "Not selected"} suitcases`,
      `Journey type: ${returnJourney ? "Return (5% journey-fare discount where applicable)" : "One way"}`,
      `Quoted fare: ${isVehiclePersonalQuote ? "On request" : authoritativeFareReady && pricedFare ? formatQuote(pricedFare.totalGbp) : "Awaiting confirmed quote"}`,
      tripDate || tripTime ? `Pickup date/time: ${tripDate || "Not set"} ${tripTime || "Not set"}` : "Pickup date/time: added at booking stage; not yet booked.",
      ...(returnJourney ? [`Return date/time: ${returnDate || "Not set"} ${returnTime || "Not set"}`] : []),
    ].join("\n");
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
              onClick={() => handleSaveQuoteClick()}
              style={!saveQuoteSettings.enabled || !(saveQuoteSettings.emailEnabled || saveQuoteSettings.whatsappEnabled) ? { display: "none" } : undefined}
              data-quote-save
              aria-haspopup="dialog"
              disabled={isVehiclePersonalQuote}
              title={isVehiclePersonalQuote ? "Available once your personalised price is confirmed." : undefined}
              className={`${QUOTE_RESULT_ACTION_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <QuoteResultActionIcon name="save" />
              <span>Email my quote</span>
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
            <DesktopQuoteEnquiry className={QUOTE_RESULT_ACTION_CLASS} journey={desktopEnquiryJourney()} />
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
        data-d3-render={mobileDesign3 ? "" : undefined}
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
        data-d3-render={mobileDesign3 ? "" : undefined}
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
      data-d3-render={mobileDesign3 ? "" : undefined}
      data-quote-results={quoteResultsReady && quoteStep === 1 ? "ready" : undefined}
      data-d2={design2Home ? (quoteStep >= 2 ? "details" : homepagePriceRequested ? "vehicle" : "journey") : undefined}
      data-d2-schedule={design2Home && homepagePriceRequested && quoteStep === 1 ? (isScheduleComplete ? "set" : "pending") : undefined}
      data-desktop-journey-editing={desktopJourneyEditing && quoteResultsReady && quoteStep === 1 ? "true" : undefined}
      className={
        presentation === "homepage"
          ? "quote-flow glass-card min-w-0 rounded-[1.1rem] px-3 py-2.5 sm:rounded-[1.35rem] sm:p-7 lg:p-6 xl:p-7"
          : "quote-flow glass-card min-w-0 rounded-[1.05rem] p-4 sm:p-7 lg:p-6 xl:p-7"
      }
    >
      {/* Mobile Design 2 progress line. Rendered only when Design 2 is active (below 1200px, preview
          on), so the desktop card keeps its heading area as the first child its styles expect. */}
      {design2Home ? (
      <ol data-mobile-steps aria-label="Booking progress" className="hidden" data-d2-stage={design2Home ? (quoteStep >= 2 ? "details" : homepagePriceRequested ? "vehicle" : "journey") : undefined}>
        {(design2Home ? ["Journey", "Vehicle", "Details & Payment"] : ["Journey", "Price", "Details & pay"]).map((label, index) => {
          const current = quoteStep >= 2 ? 3 : quoteResultsReady || (design2Home && homepagePriceRequested) ? 2 : 1;
          const state = index + 1 < current ? "done" : index + 1 === current ? "current" : "next";
          return (
            <li key={label} data-step-state={state} aria-current={state === "current" ? "step" : undefined}>
              {mobileDesign3 && state === "done" ? (
                <button
                  type="button"
                  data-d3-step-link={index === 0 ? "journey" : "vehicle"}
                  aria-label={`Go back to ${label}`}
                  onClick={() => (index === 0 ? goToJourneyFromD3Steps() : goToVehicleFromD3Steps())}
                >
                  <span aria-hidden>✓</span>
                  {label}
                </button>
              ) : (
                <>
                  <span aria-hidden>{state === "done" ? "✓" : index + 1}</span>
                  {label}
                </>
              )}
            </li>
          );
        })}
      </ol>
      ) : null}
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
              ? design2Home
                ? initialAirportCode && /^(BFS|BHD|DUB|LDY)$/.test(initialAirportCode)
                  ? `Your fixed price to or from ${initialAirportCode}`
                  : "Get your fixed price"
                : "Get Your Fixed Quote"
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
              : "Three quick steps — Journey details, Your quote, then Complete your booking. Instant fares can be paid online by card to confirm; otherwise Request to book and we’ll email a secure payment link after we confirm."}
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
        {quoteStep === 1 && presentation === "homepage" && quoteResultsReady ? (
          /* Desktop (1200px+) vehicle step header only — hidden below 1200px. */
          <div className="hidden" data-results-desktop-bar>
            <ol data-checkout-progress aria-label="Booking progress">
              <li data-checkout-progress-step="done">
                <button type="button" data-checkout-progress-link onClick={goToJourneyFromProgress}>
                  <span aria-hidden="true">✓</span> Journey<span className="sr-only"> (completed): change your journey</span>
                </button>
              </li>
              <li data-checkout-progress-step="current" aria-current="step">
                <span aria-hidden="true">2</span> Vehicle
              </li>
              <li data-checkout-progress-step="next" aria-disabled="true">
                <span aria-hidden="true">3</span> Details &amp; payment
              </li>
            </ol>
            {renderDesktopCallUs()}
            <p data-results-desktop-title>Choose your vehicle</p>
            <p data-results-desktop-subtitle>Fixed prices, confirmed before you pay.</p>
          </div>
        ) : null}
        {quoteStep >= 2 && presentation === "homepage" ? (
          /* Desktop (1200px+) checkout header only — hidden below 1200px. */
          <div className="hidden" data-checkout-desktop-bar>
            <ol data-checkout-progress aria-label="Booking progress">
              <li data-checkout-progress-step="done">
                <button type="button" data-checkout-progress-link onClick={goToJourneyFromProgress}>
                  <span aria-hidden="true">✓</span> Journey<span className="sr-only"> (completed): change your journey</span>
                </button>
              </li>
              <li data-checkout-progress-step="done">
                <button type="button" data-checkout-progress-link onClick={goToVehicleFromProgress}>
                  <span aria-hidden="true">✓</span> Vehicle<span className="sr-only"> (completed): change your vehicle</span>
                </button>
              </li>
              <li data-checkout-progress-step="current" aria-current="step">
                <span aria-hidden="true">3</span> Details &amp; payment
              </li>
            </ol>
            {renderDesktopCallUs()}
            <p data-checkout-desktop-subtitle>
              {returnJourney ? "Return transfer" : "One-way transfer"} ·{" "}
              {(pickupLabel || "Pickup").split(",")[0]} {returnJourney ? "⇄" : "→"} {(dropoffLabel || "Destination").split(",")[0]}
            </p>
          </div>
        ) : null}
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
            <strong className="text-white">Test booking mode.</strong> your card will be charged{" "}
            <strong className="text-white">£1.00</strong> only
            {testBookingLabel ? ` for ${testBookingLabel}` : ""}. You will still receive the full
            invoice email.
          </div>
        )}
        {pickupPlaceError === TOWN_GUIDE_PICKUP_MESSAGE && !routeReconfirmationRequired ? (
          <p
            role="alert"
            data-field-error
            data-town-guide-address-prompt
            className="rounded-xl border border-amber-300/40 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-50"
          >
            Nearly there — enter your full pickup address, including the house number, to get your
            exact price and book.
          </p>
        ) : routeReconfirmationRequired || pickupPlaceError || dropoffPlaceError ? (
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
            {design2Home && homepagePriceRequested ? (
              <div data-d2-vehicle-head className="space-y-3">
                <div data-d2-journey-card>
                  <div data-d2-journey-stops>
                    {([["from", pickupLabel || pickupAddress.trim() || "Pickup"], ["to", dropoffLabel || dropoffAddress.trim() || "Drop-off"]] as const).map(([stop, text]) => {
                      const cut = text.indexOf(",");
                      const name = cut > 0 ? text.slice(0, cut) : text;
                      const rest = cut > 0 ? text.slice(cut + 1).replace(/,\s*(UK|United Kingdom|Ireland)$/i, "").trim() : "";
                      return (
                        <p key={stop} data-d2-stop={stop}>
                          <strong>{name}</strong>
                          {rest ? <span>{rest}</span> : null}
                        </p>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    data-d2-edit
                    onClick={() => {
                      setHomepagePriceRequested(false);
                      window.setTimeout(() => {
                        document.getElementById("pickup")?.scrollIntoView({ block: "center" });
                      }, 0);
                    }}
                  >
                    Edit
                  </button>
                  <ul data-d2-chips aria-label="Journey details">
                    <li data-chip="pax">
                      {effectivePassengers ?? passengers} passenger{(effectivePassengers ?? passengers) === 1 ? "" : "s"}
                    </li>
                    <li data-chip="bags">
                      {suitcases != null && suitcases >= 5 ? "5+ suitcases" : `${suitcases ?? 0} suitcase${suitcases === 1 ? "" : "s"}`}
                    </li>
                    {journeyDurationLabel ? <li data-chip="time">≈ {journeyDurationLabel}</li> : null}
                    {mobileDesign3 && tripDate && tripTime ? (
                      <li data-chip="when">{formatD3ChipDate(tripDate)}, {tripTime}</li>
                    ) : null}
                    {mobileDesign3 && journeyMode === "return" && returnDate && returnTime ? (
                      <li data-chip="return">Return {formatD3ChipDate(returnDate)}, {returnTime}</li>
                    ) : null}
                  </ul>
                </div>
                {mobileDesign3 ? null : (<>
                <div role="group" aria-label="Journey type" data-d2-segment>
                  <button
                    type="button"
                    aria-pressed={journeyMode !== "return"}
                    onClick={() => {
                      if (returnOfferToken) return;
                      setJourneyMode("one-way");
                      setReturnDateError("");
                    }}
                  >
                    One way
                  </button>
                  <button
                    type="button"
                    aria-pressed={journeyMode === "return"}
                    onClick={() => {
                      if (returnOfferToken) return;
                      setJourneyMode("return");
                    }}
                  >
                    Return
                    <span data-return-discount-note>Save 5%</span>
                  </button>
                </div>
                {renderQuoteScheduleFields("quote", true)}
                {!isScheduleComplete ? (
                  <p data-d2-schedule-note role="status">
                    Add your pickup date and time{journeyMode === "return" ? ", and your return date and time," : ""} to see your fixed price for each vehicle.
                  </p>
                ) : null}
                </>)}
              </div>
            ) : presentation === "homepage" ? (
              <HomepageQuoteFields
                design2={design2Home}
                design3={mobileDesign3}
                homepagePolish={homepagePolish}
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
                dropoffNeedsHouseNumber={isIncompleteDropoffAddress}
                pickupNeedsHouseNumber={isIncompletePickupAddress}
                scheduleFields={design2Home && !mobileDesign3 ? null : renderQuoteScheduleFields("quote", true)}
                scheduleComplete={design2Home && !mobileDesign3 ? true : isScheduleComplete}
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

            {/* Only once a price is on screen, so the journey form stays short. */}
            {isTownGuidePickup && (presentation !== "homepage" || homepagePriceRequested) ? (
              <p
                data-town-guide-note
                className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm leading-relaxed text-white/90"
              >
                {TOWN_GUIDE_PICKUP_MESSAGE}
              </p>
            ) : null}

            {presentation === "homepage" &&
            !(isIncompletePickupAddress || isIncompleteDropoffAddress || isOutOfAreaPickupJourney || isRoiJourney) ? null : (
            <div
              data-incomplete-address-banner={
                (isIncompletePickupAddress || isIncompleteDropoffAddress) && !isOutOfAreaPickupJourney && !isRoiJourney
                  ? "true"
                  : undefined
              }
              className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                isIncompletePickupAddress || isIncompleteDropoffAddress || isOutOfAreaPickupJourney || isRoiJourney
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
                ) : isIncompleteDropoffAddress ? (
                  <div
                    role="alert"
                    data-incomplete-dropoff-address
                    className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-white/85"
                  >
                    <p className="font-semibold text-amber-200">{INCOMPLETE_DROPOFF_ADDRESS_MESSAGE}</p>
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
                          <span data-journey-from>{pickupLabel || "Pickup"}</span>{" "}
                          <span data-journey-arrow aria-hidden="true">→</span>{" "}
                          <span data-journey-to>{dropoffLabel || "Drop-off"}</span>
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
                        {/* Desktop (1200px+) only: journey type, dates and times from the
                            current quote, so the customer can check them before booking. */}
                        <div className="hidden" data-journey-schedule>
                          <span data-journey-type>{returnJourney ? "Return" : "One way"}</span>
                          <span data-journey-when>
                            <JourneySummaryIcon name="calendar" />
                            <span data-journey-when-label>{returnJourney ? "Outbound" : "Pickup"}</span>
                            <strong>{journeySummaryDate(tripDate)}</strong>
                            <JourneySummaryIcon name="clock" />
                            <span data-journey-when-label>
                              {checkoutTimeLabel("outbound") === "Pickup time" ? "at" : "flight lands"}
                            </span>
                            <strong>{tripTime ? tripTime.slice(0, 5) : "—"}</strong>
                          </span>
                          {returnJourney ? (
                            <span data-journey-when>
                              <JourneySummaryIcon name="return" />
                              <span data-journey-when-label>Return</span>
                              <strong>{journeySummaryDate(returnDate)}</strong>
                              <JourneySummaryIcon name="clock" />
                              <span data-journey-when-label>
                                {checkoutTimeLabel("return") === "Pickup time" ? "at" : "flight lands"}
                              </span>
                              <strong>{returnTime ? returnTime.slice(0, 5) : "—"}</strong>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {renderQuoteVehicleChoice()}
                    {renderDesktopMeetGreetUpgrades()}
                    {design2Home ? (
                      /* Design 3 (?mobile=d3) only, shown by its stylesheet: what the fare includes,
                         with the waiting time that applies to this pickup. */
                      <ul className="hidden" data-d3-included>
                        <li>
                          {isFromAirport
                            ? "Up to 60 minutes’ free waiting from your flight’s landing time"
                            : "10 minutes’ complimentary waiting at pickup"}
                        </li>
                        <li>Free cancellation up to 24 hours before pickup</li>
                      </ul>
                    ) : null}
                    {design2Home && liveQuote && !isVehiclePersonalQuote && !appliedPersonalQuote ? (
                      /* Design 3 only (shown by its stylesheet): send the quote link to the
                         customer's WhatsApp or email so they can finish booking later. */
                      <>
                        {saveQuoteSettings.enabled && (saveQuoteSettings.emailEnabled || saveQuoteSettings.whatsappEnabled) ? (
                          <p className="hidden" data-d3-send-quote-note>Not ready to book yet?</p>
                        ) : null}
                        <button
                          type="button"
                          className="hidden"
                          data-d3-send-quote
                          onClick={() => handleSaveQuoteClick()}
                          style={!saveQuoteSettings.enabled || !(saveQuoteSettings.emailEnabled || saveQuoteSettings.whatsappEnabled) ? { display: "none" } : undefined}
                        >
                          Send me my quote
                        </button>
                      </>
                    ) : null}
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
                        {design2Home ? (
                          <div data-d2-sticky role="region" aria-label="Selected vehicle and continue">
                            <div data-d2-sticky-summary>
                              <span data-d2-sticky-label>
                                {vehicleShortLabel(quoteVehicle)} · {returnJourney ? "return" : "one way"}
                              </span>
                              <span data-d2-sticky-price>
                                {isVehiclePersonalQuote
                                  ? <strong>On request</strong>
                                  : paymentAmount != null && Number.isFinite(paymentAmount) && mayPaintNumericFare && !vehicleFareUpdating
                                    ? <strong>{formatQuote(
                                        // Includes a Meet & Greet chosen under the vehicles (same sum as the desktop panel).
                                        Math.round((paymentAmount + desktopMeetGreetUpgrades()
                                          .filter((upgrade) => upgrade.selected)
                                          .reduce((sum, upgrade) => sum + upgrade.feeGbp, 0)) * 100) / 100,
                                      )}</strong>
                                    : <strong>…</strong>}
                                <button
                                  type="button"
                                  data-d2-price-details
                                  aria-haspopup="dialog"
                                  onClick={() => {
                                    if (resultsBreakdownData()) setPriceSheetOpen(true);
                                    else quoteSelectedVehicleCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                                  }}
                                >
                                  Price details
                                </button>
                              </span>
                            </div>
                            {renderStep1BookButton({ instantTransferLabel: true })}
                          </div>
                        ) : null}
                        {design2Home && priceSheetOpen ? renderPriceDetailsSheet() : null}
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
      {restoredQuote && quoteStep === 1 && <p role="status" className="my-3 rounded-xl border border-white/20 p-3 text-sm text-white">
        Original quote: {restoredQuote.amountLabel}. {authoritativeFareReady && pricedFare ?
          Math.abs(pricedFare.totalGbp + (bookingMeetGreetSelected ? bookingMeetGreetPrice : 0) - restoredQuote.amount) >= 0.01 ? `Your current fare has changed to ${formatQuote(pricedFare.totalGbp + (bookingMeetGreetSelected ? bookingMeetGreetPrice : 0))}.` : "Your recalculated fare is unchanged." : !tripDate || !tripTime ? "Choose your pickup date and time to recalculate." : "Recalculating your fare…"}
      </p>}
      <SaveQuoteModal
        initialWhatsAppRequest={initialWhatsAppRequest}
        settings={saveQuoteSettings}
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
