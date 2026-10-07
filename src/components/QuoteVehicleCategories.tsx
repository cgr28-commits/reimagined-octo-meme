"use client";

import { withBasePath } from "@/lib/paths";
import {
  ESTATE_VEHICLE,
  EXECUTIVE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  enabledVehicleTypesForQuote,
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
    detail: null,
    image: SALOON_IMAGE,
    art: "saloon" as VehicleArtId,
  },
  {
    id: "estate" as const,
    vehicle: ESTATE_VEHICLE,
    title: ESTATE_CUSTOMER_NAME,
    capacity: "1–4 passengers",
    detail: ESTATE_CUSTOMER_DESCRIPTION,
    image: ESTATE_IMAGE,
    art: "estate" as VehicleArtId,
  },
  {
    id: "executive" as const,
    vehicle: EXECUTIVE_VEHICLE,
    title: EXECUTIVE_CUSTOMER_NAME,
    capacity: "1–4 passengers",
    detail: EXECUTIVE_CUSTOMER_DESCRIPTION,
    image: BUSINESS_CLASS_IMAGE,
    art: "executive" as VehicleArtId,
  },
  {
    id: "minibus" as const,
    vehicle: MINIBUS_VEHICLE,
    title: MINIBUS_CUSTOMER_NAME,
    capacity: null,
    detail: MINIBUS_CUSTOMER_DESCRIPTION,
    image: MINIBUS_IMAGE,
    art: "minibus" as VehicleArtId,
  },
] as const;

export default function QuoteVehicleCategories({
  selectedVehicle = null,
  onSelectVehicle,
  publicMinibusEnabled = true,
  publicExecutiveEnabled = true,
}: {
  /** Kept for callers. Party size chooses the automatic vehicle elsewhere; it does not disable these cards. */
  passengers: number | null;
  suitcases: number | null;
  /** Booked vehicle, including an upgrade the customer has chosen. */
  selectedVehicle?: string | null;
  onSelectVehicle?: (vehicle: (typeof CATEGORIES)[number]["vehicle"]) => void;
  publicMinibusEnabled?: boolean;
  publicExecutiveEnabled?: boolean;
}) {
  const enabled = enabledVehicleTypesForQuote({
    publicMinibusEnabled,
    publicExecutiveEnabled,
  });
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
          const isSelected = selectedVehicle === option.vehicle;
          return (
            <div key={option.id} role="listitem" className="min-w-0">
              <button
                type="button"
                data-vehicle-category={option.id}
                aria-pressed={isSelected}
                onClick={() => onSelectVehicle?.(option.vehicle)}
                className={`grid h-[4.75rem] w-full grid-cols-[5.75rem_minmax(0,1fr)_1.25rem] items-center gap-x-1.5 overflow-hidden rounded-xl border-2 bg-white px-2 text-left text-navy shadow-sm ${
                  isSelected
                    ? "border-[var(--quote-selected-border)]"
                    : "border-navy/20"
                }`}
              >
                <VehicleQuoteArt
                  vehicle={option.art}
                  src={option.image}
                  alt=""
                  size="option"
                />
                <span className="min-w-0">
                  <span className="block text-[0.78rem] font-bold leading-tight text-navy tracking-[-0.02em]">
                    {option.title}
                  </span>
                  {option.capacity ? (
                    <span className="block text-[0.72rem] font-semibold leading-tight text-navy">
                      {option.capacity}
                    </span>
                  ) : null}
                  {option.detail ? (
                    <span className="block text-[0.72rem] font-medium leading-tight text-navy">
                      {option.detail}
                    </span>
                  ) : (
                    <span className="block text-[0.72rem] leading-tight text-transparent" aria-hidden>
                      {"\u00a0"}
                    </span>
                  )}
                </span>
                {isSelected ? (
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#147a2a] text-[11px] font-bold text-white"
                    aria-hidden
                  >
                    ✓
                  </span>
                ) : (
                  <span className="h-5 w-5 shrink-0" aria-hidden />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
