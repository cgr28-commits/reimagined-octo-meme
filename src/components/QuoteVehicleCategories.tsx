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
const BUSINESS_CLASS_IMAGE = withBasePath("/images/vehicles/quote-business-class.webp");
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
    image: BUSINESS_CLASS_IMAGE,
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
    <div className="space-y-2" data-quote-vehicle-categories>
      <p className="form-label mb-0">Vehicle options</p>
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
                className={`flex min-h-[4.5rem] w-full min-w-0 items-center gap-3 rounded-xl border bg-white px-3 py-2 text-left text-navy shadow-sm ${
                  isSelected
                    ? "border-emerald ring-2 ring-emerald/40"
                    : "border-navy/15"
                }`}
              >
                <Image
                  src={option.image}
                  alt=""
                  width={160}
                  height={80}
                  className="h-14 w-[6.5rem] shrink-0 object-contain"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.95rem] font-semibold leading-tight text-navy">
                    {option.title}
                  </span>
                  <span className="mt-0.5 block text-[0.8125rem] leading-snug text-navy/70">
                    {option.detail}
                  </span>
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
