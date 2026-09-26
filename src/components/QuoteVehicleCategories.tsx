"use client";

import Image from "next/image";
import { withBasePath } from "@/lib/paths";
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  requiresMinibus,
  selectVehicleForParty,
} from "@/lib/vehicle-selection";
import { MINIBUS_CUSTOMER_DESCRIPTION, MINIBUS_CUSTOMER_NAME } from "../../shared/vehicle-display";

const SALOON_IMAGE = withBasePath("/images/vehicles/quote-saloon.webp");
const ESTATE_IMAGE = withBasePath("/images/vehicles/quote-estate.webp");
const MINIBUS_IMAGE = withBasePath("/images/vehicles/quote-minibus.webp");

const CATEGORIES = [
  {
    id: "saloon",
    vehicle: SALOON_VEHICLE,
    title: "Saloon",
    detail: "1–4 passengers",
    image: SALOON_IMAGE,
  },
  {
    id: "estate",
    vehicle: ESTATE_VEHICLE,
    title: "Estate",
    detail: "Extra luggage space",
    image: ESTATE_IMAGE,
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
}: {
  passengers: number | null;
  suitcases: number | null;
  /** Booked vehicle, including an optional 7-seater the customer has chosen. */
  selectedVehicle?: string | null;
  onSelectVehicle?: (vehicle: (typeof CATEGORIES)[number]["vehicle"]) => void;
}) {
  const automatic =
    passengers != null && suitcases != null
      ? selectVehicleForParty(passengers, suitcases)
      : null;
  const selected = selectedVehicle ?? automatic;
  const lockedToMinibus =
    passengers != null && suitcases != null && requiresMinibus(passengers, suitcases);

  return (
    <div className="space-y-2" data-quote-vehicle-categories>
      <p className="form-label mb-0">Vehicle</p>
      <div
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        role="list"
        aria-label="Vehicle for this journey"
      >
        {CATEGORIES.map((option) => {
          const isSelected = selected === option.vehicle;
          const selectable =
            Boolean(onSelectVehicle) &&
            automatic != null &&
            (lockedToMinibus
              ? option.vehicle === MINIBUS_VEHICLE
              : option.vehicle === MINIBUS_VEHICLE || option.vehicle === automatic);
          const className = `flex min-h-16 w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-left sm:flex-col sm:items-center sm:text-center ${
            isSelected
              ? "border-emerald bg-emerald/10 text-white"
              : "border-white/15 text-white/75"
          }`;
          const body = (
            <>
              <Image
                src={option.image}
                alt=""
                width={96}
                height={48}
                className="h-12 w-20 shrink-0 object-contain sm:h-14 sm:w-24"
              />
              <span className="min-w-0">
                <span className="block break-words font-semibold leading-snug">{option.title}</span>
                <span className="block break-words text-xs text-white/60">{option.detail}</span>
              </span>
            </>
          );
          return (
            <div key={option.id} role="listitem" className="min-w-0">
              {selectable ? (
                <button
                  type="button"
                  data-vehicle-category={option.id}
                  aria-pressed={isSelected}
                  onClick={() => onSelectVehicle?.(option.vehicle)}
                  className={`${className} cursor-pointer`}
                >
                  {body}
                </button>
              ) : (
                <div data-vehicle-category={option.id} className={className}>
                  {body}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
