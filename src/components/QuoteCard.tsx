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
  onChang