"use client";

import Image from "next/image";
import { withBasePath } from "@/lib/paths";
import {
  ESTATE_VEHICLE,
  EXECUTIVE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
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

const SALOON_IMAGE = withBasePath("/images/vehicles/quote-saloon.webp");
const ESTATE_IMAGE = withBasePath("/images/vehicles/quote-estate.webp");
const MINIBUS_IMAGE = withBasePath("/images/vehicles/quote-minibus.webp");

const CATEGORIES = [
  {
    id: "saloon",
    vehicle: SALOON_VEHICLE,
    title: SALOON_CUSTOMER_NAME,
    detail: SALOON_CUSTOMER_DESCRIPTION,
    image: SALOON_IMAGE,
  },
  {
    id: "estate",
    vehicle: ESTATE_VEHICLE,
    title: ESTATE_CUSTOMER_NAME,
    detail: ESTATE_CUSTOMER_DESCRIPTION,
    image: ESTATE_IMAGE,
  },
  {
    id: "executive",
    vehicle: EXECUTIVE_VEHICLE,
    title: EXECUTIVE_CUSTOMER_NAME,
    detail: EXECUTIVE_CUSTOMER_DESCRIPTION,
    // No unbadged Business Class photo is in the repo yet. Keep the saloon image.
    image: SALOON_IMAGE,
  },
  {
    id: "minibus",
    vehicle: MINIBUS_VEHICLE,
    title: MINIBUS_CUSTOMER_NAME,
    detail: MINIBUS_CUSTOMER_DESCRIPTION,
    image: MINIBUS_IMAGE,
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
  /** Booked vehicle, including an upgrade the customer has chosen. */
  selectedVehicle?: string | null;
  onSelectVehicle?: (vehicle: (typeof CATEGORIES)[number]["vehicle"]) => void;
  publicMinibusEnabled?: boolean;
  publicExecutiveEnabled?: boolean;
}) {
  const suitable =
    passengers != null && suitcases != null
      ? suitableVehicleTypesForParty(passengers, suitcases, {
          publicMinibusEnabled,
          publicExecutiveEnabled,
        })
      : [];
  const options = CATEGORIES.filter((option) =>
    suitable.some((vehicle) => vehicle === option.vehicle),
  );
  if (options.length === 0) return null;

  return (
    <div className="space-y-1.5" data-quote-vehicle-categories>
      <p className="form-label mb-0">Vehicle</p>
      <div
        className="grid grid-cols-1 gap-1.5"
        role="list"
        aria-label="Vehicle for this journey"
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
                className={`flex min-h-12 w-full min-w-0 items-center gap-2.5 rounded-xl border bg-white px-2.5 py-1.5 text-left text-navy shadow-sm ${
                  isSelected
                    ? "border-emerald ring-2 ring-emerald/40"
                    : "border-navy/15"
                }`}
              >
                <Image
                  src={option.image}
                  alt=""
                  width={88}
                  height={44}
                  className="h-9 w-14 shrink-0 object-contain"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-tight text-navy">
                    {option.title}
                  </span>
                  <span className="block text-xs leading-tight text-navy/60">{option.detail}</span>
                </span>
                {isSelected ? (
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald text-[11px] font-bold text-white"
                    aria-hidden
                  >
                    ✓
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
