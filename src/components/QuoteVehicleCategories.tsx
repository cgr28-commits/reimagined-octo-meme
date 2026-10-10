"use client";

import { withBasePath } from "@/lib/paths";
import {
  ESTATE_VEHICLE,
  EXECUTIVE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  VEHICLE_NOT_SUITABLE_CARD_MESSAGE,
  enabledVehicleTypesForQuote,
  suitableVehicleTypesForParty,
} from "@/lib/vehicle-selection";
import {
  ESTATE_CUSTOMER_DESCRIPTION,
  ESTATE_CUSTOMER_NAME,
  EXECUTIVE_CUSTOMER_DESCRIPTION,
  EXECUTIVE_CUSTOMER_NAME,
  MINIBUS_CUSTOMER_DESCRIPTION,
  MINIBUS_CUSTOMER_NAME,
  SALOON_CUSTOMER_DESCRIPTION,
  SALOON_CUSTOMER_NAME,
} from "../../shared/vehicle-display";
import { VehicleQuoteArt, type VehicleArtId } from "@/components/vehicle-quote-art";
import { QuoteCrownIcon, QuoteLuggageIcon } from "@/components/quote-vehicle-line-icons";

/**
 * Card wording only. Saloon and Business Class still fit 2 standard suitcases
 * (23kg) plus 2 small hand-luggage bags; that capacity is not changed here.
 */
const SALOON_LUGGAGE_CAPACITY = "2 standard suitcases (23kg)";

const SALOON_IMAGE = withBasePath("/images/vehicles/quote-saloon.webp");
const ESTATE_IMAGE = withBasePath("/images/vehicles/quote-estate.webp");
const BUSINESS_CLASS_IMAGE = withBasePath("/images/vehicles/quote-business-class.webp");
const MINIBUS_IMAGE = withBasePath("/images/vehicles/quote-minibus.webp");

const CATEGORIES = [
  {
    id: "saloon" as const,
    vehicle: SALOON_VEHICLE,
    title: SALOON_CUSTOMER_NAME,
    capacity: SALOON_CUSTOMER_DESCRIPTION,
    luggage: SALOON_LUGGAGE_CAPACITY,
    luggageIcon: "suitcase" as const,
    detail: null,
    detailIcon: null,
    image: SALOON_IMAGE,
    art: "saloon" as VehicleArtId,
  },
  {
    id: "estate" as const,
    vehicle: ESTATE_VEHICLE,
    title: ESTATE_CUSTOMER_NAME,
    capacity: "1–4 passengers",
    luggage: null,
    luggageIcon: null,
    detail: ESTATE_CUSTOMER_DESCRIPTION,
    detailIcon: "suitcase" as const,
    image: ESTATE_IMAGE,
    art: "estate" as VehicleArtId,
  },
  {
    id: "executive" as const,
    vehicle: EXECUTIVE_VEHICLE,
    title: EXECUTIVE_CUSTOMER_NAME,
    capacity: "1–4 passengers",
    luggage: SALOON_LUGGAGE_CAPACITY,
    luggageIcon: "suitcase" as const,
    detail: EXECUTIVE_CUSTOMER_DESCRIPTION,
    detailIcon: "crown" as const,
    image: BUSINESS_CLASS_IMAGE,
    art: "executive" as VehicleArtId,
  },
  {
    id: "minibus" as const,
    vehicle: MINIBUS_VEHICLE,
    title: MINIBUS_CUSTOMER_NAME,
    capacity: null,
    luggage: null,
    luggageIcon: null,
    detail: MINIBUS_CUSTOMER_DESCRIPTION,
    detailIcon: null,
    image: MINIBUS_IMAGE,
    art: "minibus" as VehicleArtId,
  },
] as const;

function VehicleLineIcon({ name }: { name: "suitcase" | "crown" | null }) {
  if (name === "suitcase") return <QuoteLuggageIcon className="mt-px h-3.5 w-3.5" />;
  if (name === "crown") return <QuoteCrownIcon className="mt-px h-3.5 w-3.5" />;
  return null;
}

export default function QuoteVehicleCategories({
  passengers,
  suitcases,
  selectedVehicle = null,
  onSelectVehicle,
  publicMinibusEnabled = true,
  publicExecutiveEnabled = true,
  hideUnsuitable = false,
}: {
  passengers: number | null;
  suitcases: number | null;
  /** Booked vehicle. Only a category that fits this party can be selected. */
  selectedVehicle?: string | null;
  onSelectVehicle?: (vehicle: (typeof CATEGORIES)[number]["vehicle"]) => void;
  publicMinibusEnabled?: boolean;
  publicExecutiveEnabled?: boolean;
  /** Homepage quote results list only vehicles that fit this party. */
  hideUnsuitable?: boolean;
}) {
  const enabled = enabledVehicleTypesForQuote({
    publicMinibusEnabled,
    publicExecutiveEnabled,
  });
  const suitable =
    passengers != null && suitcases != null
      ? suitableVehicleTypesForParty(passengers, suitcases, {
          publicMinibusEnabled,
          publicExecutiveEnabled,
        })
      : enabled;
  const options = CATEGORIES.filter((option) =>
    enabled.some((vehicle) => vehicle === option.vehicle),
  ).filter(
    (option) => !hideUnsuitable || suitable.some((vehicle) => vehicle === option.vehicle),
  );
  if (options.length === 0) return null;

  return (
    <div className="scroll-mt-20 space-y-1.5" data-quote-vehicle-categories>
      <p
        className="form-label mb-0 scroll-mt-20"
        data-quote-vehicle-options-heading
      >
        Vehicle options
      </p>
      <div
        className="grid grid-cols-1 gap-1.5"
        role="list"
        aria-label="Vehicle options for this journey"
      >
        {options.map((option) => {
          const fits = suitable.some((vehicle) => vehicle === option.vehicle);
          const isSelected = fits && selectedVehicle === option.vehicle;
          return (
            <div key={option.id} role="listitem" className="min-w-0">
              <button
                type="button"
                data-vehicle-category={option.id}
                data-vehicle-suitable={fits ? "true" : "false"}
                aria-pressed={isSelected}
                aria-disabled={!fits}
                disabled={!fits}
                onClick={() => {
                  if (!fits) return;
                  onSelectVehicle?.(option.vehicle);
                }}
                className={`flex w-full flex-col gap-1 overflow-hidden rounded-2xl border-2 bg-white px-2.5 py-1.5 text-left text-navy shadow-sm disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-100 ${
                  isSelected
                    ? "border-[var(--quote-selected-border)] shadow-[0_0_0_1px_var(--quote-selected-border)]"
                    : "border-navy/15"
                }`}
              >
                <span className="grid grid-cols-[6.4rem_minmax(0,1fr)_1.5rem] items-center gap-x-2.5">
                  <VehicleQuoteArt
                    vehicle={option.art}
                    src={option.image}
                    alt=""
                    size="option"
                  />
                  <span className="min-w-0">
                    <span className="block text-[0.95rem] font-bold leading-tight text-navy tracking-[-0.02em]">
                      {option.title}
                    </span>
                    {option.capacity ? (
                      <span className="mt-0.5 block text-[0.84rem] font-semibold leading-tight text-navy">
                        {option.capacity}
                      </span>
                    ) : null}
                    {option.luggage ? (
                      <span className="mt-0.5 flex items-start gap-1 text-[0.78rem] font-semibold leading-tight text-navy">
                        <VehicleLineIcon name={option.luggageIcon} />
                        <span>{option.luggage}</span>
                      </span>
                    ) : null}
                    {option.detail ? (
                      <span className="mt-0.5 flex items-start gap-1 text-[0.78rem] font-medium leading-tight text-navy">
                        <VehicleLineIcon name={option.detailIcon} />
                        <span>{option.detail}</span>
                      </span>
                    ) : option.luggage ? null : (
                      <span className="block text-[0.78rem] leading-tight text-transparent" aria-hidden>
                        {"\u00a0"}
                      </span>
                    )}
                  </span>
                  {isSelected ? (
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#147a2a] text-[13px] font-bold text-white"
                      aria-hidden
                    >
                      ✓
                    </span>
                  ) : (
                    <span
                      className="h-6 w-6 shrink-0 rounded-full border-2 border-navy/30"
                      aria-hidden
                    />
                  )}
                </span>
                {fits ? null : (
                  <span className="block text-[0.72rem] font-semibold leading-tight text-navy">
                    {VEHICLE_NOT_SUITABLE_CARD_MESSAGE}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
