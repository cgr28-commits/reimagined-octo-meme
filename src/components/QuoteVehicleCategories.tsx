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

/** Shown under the passenger line on Saloon and Business Class, including when disabled. */
const SALOON_LUGGAGE_CAPACITY = "2 large suitcases + 2 hand luggage";

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
    detail: null,
    image: SALOON_IMAGE,
    art: "saloon" as VehicleArtId,
  },
  {
    id: "estate" as const,
    vehicle: ESTATE_VEHICLE,
    title: ESTATE_CUSTOMER_NAME,
    capacity: "1–4 passengers",
    luggage: null,
    detail: ESTATE_CUSTOMER_DESCRIPTION,
    image: ESTATE_IMAGE,
    art: "estate" as VehicleArtId,
  },
  {
    id: "executive" as const,
    vehicle: EXECUTIVE_VEHICLE,
    title: EXECUTIVE_CUSTOMER_NAME,
    capacity: "1–4 passengers",
    luggage: SALOON_LUGGAGE_CAPACITY,
    detail: EXECUTIVE_CUSTOMER_DESCRIPTION,
    image: BUSINESS_CLASS_IMAGE,
    art: "executive" as VehicleArtId,
  },
  {
    id: "minibus" as const,
    vehicle: MINIBUS_VEHICLE,
    title: MINIBUS_CUSTOMER_NAME,
    capacity: null,
    luggage: null,
    detail: MINIBUS_CUSTOMER_DESCRIPTION,
    image: MINIBUS_IMAGE,
    art: "minibus" as VehicleArtId,
  },
] as const;

export default function QuoteVehicleCategories({
  passengers,
  suitcases,
  selectedVehicle = null,
  onSelectVehicle,
  publicMinibusEnabled = true,
  publicExecutiveEnabled = true,
}: {
  passengers: number | null;
  suitcases: number | null;
  /** Booked vehicle. Only a category that fits this party can be selected. */
  selectedVehicle?: string | null;
  onSelectVehicle?: (vehicle: (typeof CATEGORIES)[number]["vehicle"]) => void;
  publicMinibusEnabled?: boolean;
  publicExecutiveEnabled?: boolean;
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
  );
  if (options.length === 0) return null;

  return (
    <div className="scroll-mt-20 space-y-2" data-quote-vehicle-categories>
      <p
        className="form-label mb-0 scroll-mt-20"
        data-quote-vehicle-options-heading
      >
        Vehicle options
      </p>
      <div
        className="grid grid-cols-1 gap-2"
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
                className={`flex min-h-[7.75rem] w-full flex-col justify-center gap-1 overflow-hidden rounded-2xl border-2 bg-white px-3 py-2.5 text-left text-navy shadow-sm disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-100 ${
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
                      <span className="mt-0.5 block text-[0.78rem] font-semibold leading-tight text-navy">
                        {option.luggage}
                      </span>
                    ) : null}
                    {option.detail ? (
                      <span className="mt-0.5 block text-[0.78rem] font-medium leading-tight text-navy">
                        {option.detail}
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
                <span
                  className={`block text-[0.72rem] font-semibold leading-tight ${
                    fits ? "invisible" : "text-navy"
                  }`}
                  aria-hidden={fits}
                >
                  {VEHICLE_NOT_SUITABLE_CARD_MESSAGE}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
