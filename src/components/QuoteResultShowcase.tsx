"use client";

import { cloneElement, isValidElement, forwardRef, type ReactNode } from "react";
import { preload } from "react-dom";
import { withBasePath } from "@/lib/paths";
import {
  ESTATE_VEHICLE,
  EXECUTIVE_VEHICLE,
  MINIBUS_VEHICLE,
  vehicleShortLabel,
} from "@/lib/vehicle-selection";
import { EXECUTIVE_CUSTOMER_CAPACITY } from "../../shared/vehicle-display";
import { VehicleQuoteArt, type VehicleArtId } from "@/components/vehicle-quote-art";
import { QuoteLuggageIcon as QuoteSuitcaseIcon } from "@/components/quote-vehicle-line-icons";
import {
  formatPublicSuitcaseChoice,
  isFivePlusLuggage,
} from "../../shared/vehicle-capacity";
import { AUTHORITATIVE_QUOTE_UNAVAILABLE_MESSAGE } from "@/lib/authoritative-quote-fare";

type QuoteResultShowcaseProps = {
  vehicleType: string;
  passengers: number;
  suitcases: number;
  priceLabel: string;
  formattedPrice: string;
  airportAccess?: ReactNode;
  bookButton: ReactNode;
  /** Compact Business Class inclusions, directly under the book button. */
  businessClassInclusions?: ReactNode;
  layoutBusinessClassInclusions?: ReactNode;
  /** Vehicle changed; keep the card and wait for the new authoritative price. */
  priceUpdating?: boolean;
  /** Shown only when the first displayed price already includes the 10%. */
  surchargeNote?: string | null;
  /** Worker quote failed. Do not show a fallback fare in the price slot. */
  priceUnavailable?: boolean;
  onRetryPrice?: () => void;
  requestQuote?: { heading: string; description: string };
};

// Presentational only: image follows the vehicle type already chosen for
// the party. No new selection rules.

const SALOON_IMAGE = withBasePath("/images/vehicles/quote-saloon.webp");
const ESTATE_IMAGE = withBasePath("/images/vehicles/quote-estate.webp");
const BUSINESS_CLASS_IMAGE = withBasePath("/images/vehicles/quote-business-class.webp");
const MINIBUS_IMAGE = withBasePath("/images/vehicles/quote-minibus.webp");

/** Vehicle art used on the result card. */
const QUOTE_RESULT_VEHICLE_IMAGES = [
  SALOON_IMAGE,
  ESTATE_IMAGE,
  BUSINESS_CLASS_IMAGE,
  MINIBUS_IMAGE,
] as const;

/**
 * Start these downloads with the quote form, before a price exists.
 * Low priority so they do not compete with the page's hero image.
 * The result photo then comes from cache.
 */
export function preloadQuoteResultVehicleImages() {
  for (const href of QUOTE_RESULT_VEHICLE_IMAGES) {
    preload(href, { as: "image", fetchPriority: "low" });
  }
}

const QuoteResultShowcase = forwardRef<HTMLDivElement, QuoteResultShowcaseProps>(
  function QuoteResultShowcase(
    {
      vehicleType,
      passengers,
      suitcases,
      priceLabel,
      formattedPrice,
      airportAccess,
      bookButton,
      businessClassInclusions = null,
      layoutBusinessClassInclusions = null,
      priceUpdating = false,
      priceUnavailable = false,
      onRetryPrice,
      requestQuote,
    },
    ref,
  ) {
  const isExecutive =
    vehicleType === EXECUTIVE_VEHICLE || String(vehicleType).toLowerCase().includes("executive") ||
    String(vehicleType).toLowerCase().includes("business class");
  const isMinibus =
    !isExecutive &&
    (vehicleType === MINIBUS_VEHICLE || String(vehicleType).toLowerCase().includes("minibus"));
  const isEstate =
    !isExecutive &&
    !isMinibus &&
    (vehicleType === ESTATE_VEHICLE || String(vehicleType).toLowerCase().includes("estate"));
  const vehicleLabel = isEstate ? "Estate" : vehicleShortLabel(vehicleType);
  const art: VehicleArtId = isMinibus
    ? "minibus"
    : isEstate
      ? "estate"
      : isExecutive
        ? "executive"
        : "saloon";
  const vehicleImage = isMinibus
    ? MINIBUS_IMAGE
    : isEstate
      ? ESTATE_IMAGE
      : isExecutive
        ? BUSINESS_CLASS_IMAGE
        : SALOON_IMAGE;
  const capacityLine = isMinibus ? "Up to 7 passengers" : isExecutive ? EXECUTIVE_CUSTOMER_CAPACITY : "1–4 passengers";
  const detailLine = isMinibus ? "Up to 7 passengers" : isExecutive
    ? `${EXECUTIVE_CUSTOMER_CAPACITY} · 2 suitcases`
    : isEstate
      ? <>Up to 4 passengers · 4 suitcases + <span className="whitespace-nowrap">2 small bags</span></>
      : <>Up to 4 passengers · 2 suitcases + <span className="whitespace-nowrap">2 small bags</span></>;
  const passengerLabel = passengers === 1 ? "1 passenger" : `${passengers} passengers`;
  const suitcaseLabel = isFivePlusLuggage(suitcases)
    ? "5+ suitcases"
    : suitcases === 1
      ? "1 suitcase"
      : `${formatPublicSuitcaseChoice(suitcases)} suitcases`;

  const layoutAirportAccess = isValidElement<{ layoutOnly?: boolean }>(airportAccess)
    ? cloneElement(airportAccess, { layoutOnly: true }) : airportAccess;

  return (
    <div
      ref={ref}
      id="quote-selected-vehicle-card"
      data-quote-selected-vehicle-card
      data-quote-result-card
      className="quote-result-card overflow-hidden rounded-2xl border border-navy/10 bg-white px-3 py-2 text-navy shadow-[0_8px_22px_rgba(2,10,24,0.16)] sm:px-3.5 sm:py-2.5"
      style={{ overflowAnchor: "none" }}
    >
      <div className="min-w-0 text-center" data-quote-vehicle-summary>
        <p
          key={vehicleType}
          data-quote-result-heading
          className="font-sans text-base font-bold leading-tight tracking-[-0.02em] text-navy"
        >
          {vehicleLabel}
        </p>
        <p className="sr-only">Vehicle for this journey</p>
        <p data-quote-result-capacity className="mt-0.5 text-[0.84rem] font-semibold leading-tight text-navy">{capacityLine}</p>
        <div data-quote-result-detail-slot>
        {detailLine ? (
          <p className="flex items-start justify-center gap-1 text-[0.78rem] font-medium leading-tight text-navy">
            <QuoteSuitcaseIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">{detailLine}</span>
          </p>
        ) : null}
        </div>
        <div data-quote-result-art className="mt-0.5">
          <VehicleQuoteArt
            vehicle={art}
            src={vehicleImage}
            alt={
              isMinibus
                ? "7 Seater Minibus airport transfer vehicle"
                : isEstate
                  ? "Estate airport transfer vehicle"
                  : isExecutive
                    ? "Premium executive vehicle"
                    : "Saloon airport transfer vehicle"
            }
            size="result"
          />
        </div>
        <div data-quote-party className="mt-0.5 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-0.5 text-[0.84rem] font-semibold leading-tight text-navy min-[390px]:flex-nowrap">
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <PassengerIcon />
            {passengerLabel}
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <QuoteSuitcaseIcon className="h-4 w-4" />
            {suitcaseLabel}
          </span>
        </div>
      </div>

      <div className="mt-1 min-w-0 text-center">
        <div data-quote-info-grid>
          <div data-quote-layout-reference aria-hidden="true" inert>
            <div data-quote-instant-reference>
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.16em]">{priceLabel}</p>
              <p className="mt-0.5 min-h-[2.35rem]" />
              {layoutAirportAccess ? <div className="my-1.5 text-left">{layoutAirportAccess}</div> : null}
            </div>
          </div>
          <div data-quote-changing-info key={vehicleType}>
        <div data-quote-result-price>
          {requestQuote ? (
            <div data-quote-manual-state>
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.16em] text-navy">{priceLabel}</p>
              <div className="mt-0.5 flex min-h-8 items-center justify-center" data-quote-fare-status="on-request">
                <span className="font-sans text-[clamp(1.85rem,1rem+3.4vw,2.35rem)] font-extrabold leading-none tracking-[-0.04em] text-navy tabular-nums">TBC</span>
              </div>
            </div>
          ) : (
          <>
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.16em] text-navy">
            {priceLabel}
          </p>
          {priceUnavailable ? (
            <div className="mt-1" data-quote-fare-status="unavailable">
              <p className="text-sm font-semibold leading-snug text-navy">
                {AUTHORITATIVE_QUOTE_UNAVAILABLE_MESSAGE}
              </p>
              {onRetryPrice ? (
                <button
                  type="button"
                  onClick={onRetryPrice}
                  data-quote-price-retry
                  className="mt-2 inline-flex min-h-11 items-center justify-center rounded-xl border border-navy/20 px-4 py-2 text-sm font-semibold text-navy hover:border-navy/40"
                >
                  Try again
                </button>
              ) : null}
            </div>
          ) : (
            <p
              data-quote-fare-status={
                priceUpdating ? "updating" : formattedPrice.startsWith("£") ? "ready" : "pending"
              }
              className="mt-0.5 flex min-h-8 items-center justify-center"
            >
              <span
                className={
                  !formattedPrice.startsWith("£")
                    ? "font-sans text-sm font-semibold leading-tight text-navy"
                    : "font-sans text-[clamp(1.85rem,1rem+3.4vw,2.35rem)] font-extrabold leading-none tracking-[-0.04em] text-navy tabular-nums"
                }
              >
                {formattedPrice}
              </span>
            </p>
          )}
          {priceUpdating && formattedPrice.startsWith("£") ? (
            <p className="text-[11px] font-semibold leading-none text-navy">Updating price…</p>
          ) : null}
          </>
          )}
        </div>

        {!priceUnavailable && airportAccess ? (
          <div className="my-1.5 text-left" data-quote-result-airport-access>
            {airportAccess}
          </div>
        ) : null}
          </div>
        </div>
        {!requestQuote && !priceUnavailable && !airportAccess ? (
          <p className="my-1.5 flex items-start gap-1.5 text-left text-[13px] font-bold leading-snug text-navy" data-private-transfer-benefit>
            <span className="w-3 shrink-0 text-[#2FBF4A]" aria-hidden>✓</span>
            Your own pre-booked transfer
          </p>
        ) : null}
        <div className="mt-3" data-quote-result-main-action>{bookButton}</div>
        <div data-quote-footer-grid>
          <div data-quote-layout-reference aria-hidden="true" inert>
            <p className="mt-1.5 text-xs font-semibold leading-tight">The price you see is the price you pay.</p>
            {layoutBusinessClassInclusions}
          </div>
          <div data-quote-result-footer>
        {priceUnavailable ? null : (
          <p data-quote-assurance className="mt-1.5 text-xs font-semibold leading-tight text-[#147a2a]">{requestQuote ? "Your fixed price will be confirmed before booking." : "The price you see is the price you pay."}</p>
        )}
        {requestQuote ? null : businessClassInclusions}
          </div>
        </div>
      </div>
    </div>
  );
  },
);

export default QuoteResultShowcase;

function PassengerIcon() {
  return (
    <svg className="h-4 w-4 text-navy" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 12a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M5.5 19.25c.7-3 3.1-4.75 6.5-4.75s5.8 1.75 6.5 4.75"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

