"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { withBasePath } from "@/lib/paths";
import {
  ESTATE_VEHICLE,
  vehicleShortLabel,
} from "@/lib/vehicle-selection";

type QuoteResultShowcaseProps = {
  vehicleType: string;
  passengers: number;
  suitcases: number;
  priceLabel: string;
  formattedPrice: string;
  airportAccess?: ReactNode;
  bookButton: ReactNode;
};

// Presentational only: image follows the vehicle type already chosen by
// selectVehicleForParty / quoteVehicle. No new selection rules.

const SALOON_IMAGE = withBasePath("/images/vehicles/quote-saloon.webp");
const ESTATE_IMAGE = withBasePath("/images/vehicles/quote-estate.webp");

export default function QuoteResultShowcase({
  vehicleType,
  passengers,
  suitcases,
  priceLabel,
  formattedPrice,
  airportAccess,
  bookButton,
}: QuoteResultShowcaseProps) {
  const isEstate = vehicleType === ESTATE_VEHICLE || vehicleShortLabel(vehicleType) === "Estate";
  const vehicleLabel = vehicleShortLabel(vehicleType);
  const estateDueToLuggage = isEstate && suitcases >= 3;
  const passengerLabel = passengers === 1 ? "1 passenger" : `${passengers} passengers`;
  const suitcaseLabel =
    suitcases === 1 ? "1 large suitcase" : `${suitcases} large suitcases`;

  return (
    <div
      data-quote-result-card
      className="quote-result-card overflow-hidden rounded-2xl border border-navy/10 bg-white px-4 py-5 text-navy shadow-[0_12px_32px_rgba(2,10,24,0.22)] sm:px-5 sm:py-6"
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-6">
        <div className="min-w-0 text-center lg:text-left">
          <p className="font-sans text-[1.65rem] font-bold leading-none tracking-[-0.02em] text-navy sm:text-[1.85rem]">
            {vehicleLabel}
          </p>
          <p className="sr-only">Vehicle for this journey</p>
          <div className="-mx-3 mt-1 w-[calc(100%+1.5rem)] max-w-none sm:-mx-4 sm:w-[calc(100%+2rem)] lg:mx-0 lg:w-full lg:max-w-[460px]">
            <Image
              src={isEstate ? ESTATE_IMAGE : SALOON_IMAGE}
              alt={
                isEstate
                  ? "Estate airport transfer vehicle"
                  : "Saloon airport transfer vehicle"
              }
              width={1400}
              height={700}
              className="mx-auto h-auto w-full object-contain"
              sizes="(max-width: 640px) 96vw, 460px"
              priority={false}
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
          {estateDueToLuggage ? (
            <p className="mt-1.5 text-xs text-navy/55">Extra luggage space for your journey</p>
          ) : null}
        </div>

        <div className="mt-4 min-w-0 text-center lg:mt-0 lg:text-left">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-dark">
            {priceLabel}
          </p>
          <p className="font-sans mt-1 text-[clamp(3.5rem,1.6rem+10vw,4.5rem)] font-extrabold leading-[0.95] tracking-[-0.04em] text-navy tabular-nums lg:text-[clamp(4rem,3rem+2vw,5rem)]">
            {formattedPrice}
          </p>
          <p className="mt-2 text-sm font-semibold text-emerald-dark">✓ Fixed price. No surprises.</p>
          {airportAccess ? (
            <div className="mt-3 text-left" data-quote-result-airport-access>
              {airportAccess}
            </div>
          ) : null}

          <div className="mt-4">{bookButton}</div>
          <p className="mt-2.5 text-[11px] leading-snug text-navy/50">
            🔒 Secure booking · Takes around 2 minutes
          </p>

          <ul className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-medium leading-snug text-navy/85">
            <Benefit icon="card">
              Secure payment
              <span className="block font-normal text-navy/55">powered by SumUp</span>
            </Benefit>
            <Benefit icon="plane">
              Flight monitoring
              <span className="block font-normal text-navy/55">for airport pickups</span>
            </Benefit>
            <Benefit>No hidden charges</Benefit>
          </ul>
        </div>
      </div>
      <p className="mt-3 text-center text-[10px] leading-none text-navy/35 lg:mt-4">
        Vehicle shown for illustration.
      </p>
    </div>
  );
}

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
