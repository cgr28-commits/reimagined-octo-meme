"use client";

import Image from "next/image";
import { withBasePath } from "@/lib/paths";
import {
  ESTATE_VEHICLE,
  EXECUTIVE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  requiresMinibus,
  selectVehicleForParty,
} from "@/lib/vehicle-selection";
import { MINIBUS_CUSTOMER_DESCRIPTION, MINIBUS_CUSTOMER_NAME } from "../../shared/vehicle-display";
import {
  EXECUTIVE_AIRPORT_PICKUP_BENEFIT,
  EXECUTIVE_BENEFITS,
  EXECUTIVE_LUGGAGE_UNAVAILABLE_MESSAGE,
  EXECUTIVE_MAX_PASSENGERS,
  EXECUTIVE_PASSENGER_LIMIT_MESSAGE,
  EXECUTIVE_PASSENGER_LIMIT_SHORT,
  SALOON_LUGGAGE_UNAVAILABLE_MESSAGE,
  estateCapacityAllows,
  estateRecommendedForLuggage,
  executiveAvailableForParty,
  saloonCapacityAllows,
  type ClimatePreference,
} from "../../shared/executive-service";

/** Previous Saloon asset. Reused for Executive; the file itself is unchanged. */
const EXECUTIVE_IMAGE = withBasePath("/images/vehicles/quote-saloon.webp");
const ESTATE_IMAGE = withBasePath("/images/vehicles/quote-estate.webp");
const MINIBUS_IMAGE = withBasePath("/images/vehicles/quote-minibus.webp");

const CATEGORIES = [
  {
    id: "saloon",
    vehicle: SALOON_VEHICLE,
    title: "Saloon",
    detail: "Standard Travel",
    image: null,
  },
  {
    id: "estate",
    vehicle: ESTATE_VEHICLE,
    title: "Estate",
    detail: "Extra Luggage Space",
    image: ESTATE_IMAGE,
  },
  {
    id: "executive",
    vehicle: EXECUTIVE_VEHICLE,
    title: "Executive",
    detail: "Premium Travel",
    image: EXECUTIVE_IMAGE,
  },
  {
    id: "minibus",
    vehicle: MINIBUS_VEHICLE,
    title: MINIBUS_CUSTOMER_NAME,
    detail: MINIBUS_CUSTOMER_DESCRIPTION,
    image: MINIBUS_IMAGE,
  },
] as const;

function formatUplift(amount: number): string {
  const value = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(value)) return "+£0";
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `+£${text}`;
}

export default function QuoteVehicleCategories({
  passengers,
  suitcases,
  selectedVehicle = null,
  onSelectVehicle,
  estateUpliftGbp = 6,
  executiveUpliftGbp = 20,
  airportPickup = false,
  includeMinibus = true,
  quietJourney = false,
  climatePreference = "no_preference",
  onQuietJourneyChange,
  onClimatePreferenceChange,
}: {
  passengers: number | null;
  suitcases: number | null;
  /** Booked vehicle, including an optional 7-seater the customer has chosen. */
  selectedVehicle?: string | null;
  onSelectVehicle?: (vehicle: (typeof CATEGORIES)[number]["vehicle"]) => void;
  estateUpliftGbp?: number;
  executiveUpliftGbp?: number;
  /** Flight monitoring is advertised only for airport pickups. */
  airportPickup?: boolean;
  includeMinibus?: boolean;
  quietJourney?: boolean;
  climatePreference?: ClimatePreference;
  onQuietJourneyChange?: (value: boolean) => void;
  onClimatePreferenceChange?: (value: ClimatePreference) => void;
}) {
  const automatic =
    passengers != null && suitcases != null
      ? selectVehicleForParty(passengers, suitcases)
      : null;
  const selected = selectedVehicle ?? automatic;
  const lockedToMinibus =
    passengers != null && suitcases != null && requiresMinibus(passengers, suitcases);
  const saloonOk =
    passengers != null && suitcases != null && saloonCapacityAllows(passengers, suitcases);
  const estateOk =
    passengers != null && suitcases != null && estateCapacityAllows(passengers, suitcases);
  const executiveOk =
    passengers != null && suitcases != null && executiveAvailableForParty(passengers, suitcases);
  const luggageRecommendsEstate =
    passengers != null && suitcases != null && estateRecommendedForLuggage(passengers, suitcases);
  const executiveBlockedByPassengers =
    passengers != null && passengers > EXECUTIVE_MAX_PASSENGERS && !lockedToMinibus;
  const visible = CATEGORIES.filter((option) => option.id !== "minibus" || includeMinibus);
  const showExecutivePreferences = selected === EXECUTIVE_VEHICLE && executiveOk;

  return (
    <div className="min-w-0 space-y-2 overflow-x-hidden" data-quote-vehicle-categories>
      <p className="form-label mb-0">Choose your vehicle</p>
      <div className="grid grid-cols-3 gap-2" role="list" aria-label="Vehicle for this journey">
        {visible.map((option) => {
          const isSelected = selected === option.vehicle;
          const selectable =
            Boolean(onSelectVehicle) &&
            automatic != null &&
            (lockedToMinibus
              ? option.vehicle === MINIBUS_VEHICLE
              : option.vehicle === MINIBUS_VEHICLE || option.vehicle === automatic ||
                (option.id === "saloon" && saloonOk) ||
                (option.id === "estate" && estateOk) ||
                (option.id === "executive" && executiveOk));
          const unavailable = unavailableReason(option.id, {
            selectable,
            lockedToMinibus,
            saloonOk,
            estateOk,
            executiveOk,
            executiveBlockedByPassengers,
          });
          const badge =
            option.id === "saloon" && saloonOk
              ? "Best Value"
              : option.id === "estate" && luggageRecommendsEstate
                ? "Recommended for Luggage"
                : option.id === "executive" && executiveOk
                  ? "Premium"
                  : null;
          const className = `flex min-h-28 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2.5 text-center ${
            isSelected
              ? "border-emerald bg-emerald/15 text-white ring-2 ring-emerald/70"
              : selectable
                ? "border-white/15 text-white/80"
                : "cursor-not-allowed border-white/10 bg-white/[0.02] text-white/35"
          }`;
          const uplift =
            option.id === "estate"
              ? formatUplift(estateUpliftGbp)
              : option.id === "executive"
                ? formatUplift(executiveUpliftGbp)
                : null;
          const body = (
            <>
              {badge ? (
                <span className="max-w-full rounded-full border border-emerald/40 bg-emerald/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-tight tracking-wide text-emerald">
                  {badge}
                </span>
              ) : (
                <span className="h-4" aria-hidden />
              )}
              {option.image ? (
                <Image
                  src={option.image}
                  alt=""
                  width={1400}
                  height={700}
                  className="h-9 w-full max-w-[5.5rem] shrink-0 object-contain"
                />
              ) : null}
              <span className="min-w-0">
                <span className="block break-words text-sm font-semibold leading-snug">{option.title}</span>
                <span className="block break-words text-[11px] leading-snug text-white/60">{option.detail}</span>
                {uplift ? (
                  <span className="mt-0.5 block text-xs font-semibold text-white">{uplift}</span>
                ) : option.id === "saloon" ? (
                  <span className="mt-0.5 block text-[11px] font-semibold text-white/70">Included</span>
                ) : null}
                {unavailable ? (
                  <span className="mt-1 block break-words text-[10px] font-medium leading-snug text-white/55">
                    {unavailable}
                  </span>
                ) : null}
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
                <div
                  data-vehicle-category={option.id}
                  className={className}
                  aria-disabled="true"
                >
                  {body}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!saloonOk && estateOk && !lockedToMinibus ? (
        <p className="text-xs leading-relaxed text-white/75" data-saloon-unavailable>
          Saloon is not suitable for your luggage. Estate is selected because it has the extra space.
        </p>
      ) : null}
      {executiveBlockedByPassengers ? (
        <p className="text-xs leading-relaxed text-white/70" data-executive-unavailable>
          {EXECUTIVE_PASSENGER_LIMIT_MESSAGE}
        </p>
      ) : null}
      {showExecutivePreferences ? (
        <div className="space-y-3 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-3">
          <details className="group">
            <summary className="cursor-pointer list-none text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
              <span className="inline-flex min-h-11 items-center">What&apos;s included?</span>
            </summary>
            <ul className="space-y-1 pb-1 text-xs leading-relaxed text-white/75">
              <li>Up to 3 passengers</li>
              {EXECUTIVE_BENEFITS.map((benefit) => (
                <li key={benefit}>✓ {benefit}</li>
              ))}
              {airportPickup ? <li>✓ {EXECUTIVE_AIRPORT_PICKUP_BENEFIT}</li> : null}
            </ul>
          </details>
          <label className="flex min-h-11 items-start gap-3 text-sm text-white">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-emerald"
              checked={quietJourney}
              onChange={(event) => onQuietJourneyChange?.(event.target.checked)}
            />
            <span>
              <span className="block font-semibold">Quiet Journey</span>
              <span className="block text-xs leading-relaxed text-white/65">
                Prefer a peaceful journey with minimal conversation.
              </span>
            </span>
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-white">Climate preference</legend>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["no_preference", "No preference"],
                  ["cooler", "Cooler"],
                  ["warmer", "Warmer"],
                ] as const
              ).map(([value, label]) => {
                const pressed = climatePreference === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => onClimatePreferenceChange?.(value)}
                    className={`min-h-11 rounded-xl border px-2 text-xs font-semibold ${
                      pressed
                        ? "border-emerald bg-emerald/15 text-white"
                        : "border-white/15 text-white/75"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}

function unavailableReason(
  id: string,
  state: {
    selectable: boolean;
    lockedToMinibus: boolean;
    saloonOk: boolean;
    estateOk: boolean;
    executiveOk: boolean;
    executiveBlockedByPassengers: boolean;
  },
): string | null {
  if (state.selectable || state.lockedToMinibus) return null;
  if (id === "saloon" && !state.saloonOk) return SALOON_LUGGAGE_UNAVAILABLE_MESSAGE;
  if (id === "executive" && state.executiveBlockedByPassengers) return EXECUTIVE_PASSENGER_LIMIT_SHORT;
  if (id === "executive" && !state.executiveOk) return EXECUTIVE_LUGGAGE_UNAVAILABLE_MESSAGE;
  if (id === "estate" && !state.estateOk) return "Not suitable for your luggage";
  return null;
}
