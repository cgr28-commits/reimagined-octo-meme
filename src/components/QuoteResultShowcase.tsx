"use client";

import { forwardRef, type ReactNode } from "react";
import { preload } from "react-dom";
import Image from "next/image";
import { withBasePath } from "@/lib/paths";
import {
  ESTATE_VEHICLE,
  EXECUTIVE_VEHICLE,
  MINIBUS_VEHICLE,
  vehicleShortLabel,
} from "@/lib/vehicle-selection";
import { vehicleCustomerDescription } from "../../shared/vehicle-display";
import {
  formatPublicSuitcaseChoice,
  isFivePlusLuggage,
  LUGGAGE_CAPACITY_CONFIRMATION_BODY,
  LUGGAGE_CAPACITY_CONFIRMATION_HEADING,
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
  /** Shown only when the first displayed price already includes the 10%. */
  surchargeNote?: string | null;
  /** High passenger + luggage load — fare shown, payment held. */
  capacityConfirmation?: boolean;
  /** Worker quote failed. Do not show a fallback fare in the price slot. */
  priceUnavailable?: boolean;
  onRetryPrice?: () => void;
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
      surchargeNote = null,
      capacityConfirmation = false,
      priceUnavailable = false,
      onRetryPrice,
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
  const vehicleLabel = vehicleShortLabel(vehicleType);
  const vehicleImage = isMinibus
    ? MINIBUS_IMAGE
    : isEstate
      ? ESTATE_IMAGE
      : isExecutive
        ? BUSINESS_CLASS_IMAGE
        : SALOON_IMAGE;
  const supporting = vehicleCustomerDescription(vehicleType);
  const passengerLabel = passengers === 1 ? "1 passenger" : `${passengers} passengers`;
  const suitcaseLabel = isFivePlusLuggage(suitcases)
    ? "5+ large bags"
    : suitcases === 1
      ? "1 large suitcase"
      : `${formatPublicSuitcaseChoice(suitcases)} large suitcases`;

  return (
    <div
      ref={ref}
      id="quote-selected-vehicle-card"
      data-quote-selected-vehicle-card
      data-quote-result-card
      className="quote-result-card overflow-hidden rounded-2xl border border-navy/10 bg-white px-3 py-3 text-navy shadow-[0_12px_32px_rgba(2,10,24,0.22)] sm:px-5 sm:py-6"
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-6">
        <div className="min-w-0 text-center lg:text-left">
          <p
            data-quote-result-heading
            className="font-sans text-[1.35rem] font-bold leading-none tracking-[-0.02em] text-navy sm:text-[1.85rem]"
          >
            {vehicleLabel}
          </p>
          <p className="sr-only">Vehicle for this journey</p>
          <p className="mt-1 text-xs text-[#475569]">{supporting}</p>
          <div className="mx-auto mt-1 w-full max-w-[280px] sm:max-w-none lg:mx-0 lg:max-w-[460px]">
            <Image
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
              width={1400}
              height={700}
              className="mx-auto h-auto max-h-28 w-full object-contain sm:max-h-none"
              sizes="(max-width: 640px) 70vw, 460px"
              priority
            />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm font-medium text-navy/80 min-[390px]:flex-nowrap lg:justify-start">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <PassengerIcon />
              {passengerLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <SuitcaseIcon />
              {suitcaseLabel}
            </span>
          </div>
        </div>

        <div className="mt-4 min-w-0 text-center lg:mt-0 lg:text-left">
          <div data-quote-result-price>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-dark">
            {priceLabel}
          </p>
          {priceUnavailable ? (
            <div className="mt-2" data-quote-fare-status="unavailable">
              <p className="text-sm font-semibold leading-relaxed text-navy">
                {AUTHORITATIVE_QUOTE_UNAVAILABLE_MESSAGE}
              </p>
              {onRetryPrice ? (
                <button
                  type="button"
                  onClick={onRetryPrice}
                  data-quote-price-retry
                  className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-navy/20 px-4 py-2 text-sm font-semibold text-navy hover:border-navy/40"
                >
                  Try again
                </button>
              ) : null}
            </div>
          ) : (
          <p
            data-quote-fare-status={formattedPrice.startsWith("£") ? "ready" : "pending"}
            className="mt-1 flex min-h-[clamp(3.5rem,1.6rem+10vw,4.5rem)] items-center justify-center lg:min-h-[clamp(4rem,3rem+2vw,5rem)] lg:justify-start"
          >
            <span
              className={
                formattedPrice.startsWith("£")
                  ? "font-sans text-[clamp(3.5rem,1.6rem+10vw,4.5rem)] font-extrabold leading-[0.95] tracking-[-0.04em] text-navy tabular-nums lg:text-[clamp(4rem,3rem+2vw,5rem)]"
                  : "font-sans text-[clamp(2.65rem,1.22rem+7.6vw,3.4rem)] font-bold leading-tight tracking-[-0.03em] text-navy/55 lg:text-[clamp(3rem,2.2rem+1.4vw,3.4rem)]"
              }
            >
              {formattedPrice}
            </span>
          </p>
          )}
          </div>
          {surchargeNote ? (
            <p
              className="mt-2 text-xs font-semibold text-emerald-dark"
              data-night-weekend-surcharge-badge
            >
              {surchargeNote}
            </p>
          ) : null}
          {priceUnavailable ? null : (
            <p className="mt-1.5 text-sm font-semibold text-emerald-dark">✓ Fixed price. No surprises.</p>
          )}

          <div className="mt-3">{bookButton}</div>
          <p className="mt-2 text-[11px] leading-snug text-[#475569]">
            🔒 Secure booking · Takes around 2 minutes
          </p>
          {capacityConfirmation ? (
            <div
              className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-left"
              data-luggage-capacity-confirmation
            >
              <p className="text-sm font-semibold text-navy">
                {LUGGAGE_CAPACITY_CONFIRMATION_HEADING}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-navy/75">
                {LUGGAGE_CAPACITY_CONFIRMATION_BODY}
              </p>
            </div>
          ) : null}
          {airportAccess ? (
            <div className="mt-3 text-left" data-quote-result-airport-access>
              {airportAccess}
            </div>
          ) : null}

          <ul className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-medium leading-snug text-navy/85">
            <Benefit icon="card">
              {capacityConfirmation ? "We'll confirm first" : "Secure payment"}
              <span className="block font-normal text-[#475569]">
                {capacityConfirmation ? "no payment taken yet" : "powered by SumUp"}
              </span>
            </Benefit>
            <Benefit icon="plane">
              Flight monitoring
              <span className="block font-normal text-[#475569]">for airport pickups</span>
            </Benefit>
            <Benefit>No hidden charges</Benefit>
          </ul>
        </div>
      </div>
      <p className="mt-3 text-center text-[10px] leading-none text-[#64748b] lg:mt-4">
        Vehicle shown for illustration.
      </p>
    </div>
  );
  },
);

export default QuoteResultShowcase;

function Benefit({
  children,
  icon = "tick",
}: {
  children: React.ReactNode;
  icon?: "tick" | "plane" | "card";
}) {
  return (
    <li className="flex min-w-0 flex-col items-center gap-0.5">
      <span className="shrink-0 text-emerald-dark" aria-hidden>
        {icon === "plane" ? "✈" : icon === "card" ? "💳" : "✓"}
      </span>
      <span>{children}</span>
    </li>
  );
}

function PassengerIcon() {
  return (
    <svg className="h-4 w-4 text-navy/70" viewBox="0 0 24 24" fill="none" aria-hidden>
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

function SuitcaseIcon() {
  return (
    <svg className="h-4 w-4 text-navy/70" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7.5 8.5h9A1.5 1.5 0 0 1 18 10v8.5A1.5 1.5 0 0 1 16.5 20h-9A1.5 1.5 0 0 1 6 18.5V10A1.5 1.5 0 0 1 7.5 8.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M9.5 8.5V6.75A1.25 1.25 0 0 1 10.75 5.5h2.5A1.25 1.25 0 0 1 14.5 6.75V8.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}
