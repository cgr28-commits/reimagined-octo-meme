"use client";

import Image from "next/image";
import { withBasePath } from "@/lib/paths";
import { formatQuote } from "@/lib/quote";
import { STANDARD_SALOON_IMAGE } from "@/lib/vehicle-artwork";
// Standard Saloon art is public/images/vehicles/quote-standard-saloon.webp once added.
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
  ESTATE_MAX_PASSENGERS,
  ESTATE_MAX_SUITCASES,
  EXECUTIVE_LUGGAGE_UNAVAILABLE_MESSAGE,
  EXECUTIVE_MAX_PASSENGERS,
  EXECUTIVE_MAX_SUITCASES,
  EXECUTIVE_PASSENGER_LIMIT_MESSAGE,
  EXECUTIVE_PASSENGER_LIMIT_SHORT,
  SALOON_LUGGAGE_UNAVAILABLE_MESSAGE,
  SALOON_MAX_PASSENGERS,
  SALOON_MAX_SUITCASES,
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

const EXECUTIVE_CARD_BENEFITS = [
  "Complimentary bottled water",
  "Phone charging available",
  "Quiet Journey option",
  "Climate preference",
  "Flight monitoring where applicable",
  "Luggage assistance",
  "Premium comfort",
] as const;

const ESTATE_CARD_BENEFITS = ["Extra legroom", "Extra luggage space", "More relaxed journey"] as const;

export type QuoteVehicleFares = {
  saloon: number | null;
  estate: number | null;
  executive: number | null;
  minibus: number | null;
};

const CATEGORIES = [
  {
    id: "saloon",
    vehicle: SALOON_VEHICLE,
    title: "Saloon",
    short: "Standard travel",
    detail: "Standard travel",
    benefit: "Comfortable & efficient",
    image: STANDARD_SALOON_IMAGE,
    imageAlt: "Saloon airport transfer",
  },
  {
    id: "estate",
    vehicle: ESTATE_VEHICLE,
    title: "Estate",
    short: "More comfort & extra space",
    detail: "More comfort & extra space",
    benefit: "Extra legroom",
    image: ESTATE_IMAGE,
    imageAlt: "Estate airport transfer",
  },
  {
    id: "executive",
    vehicle: EXECUTIVE_VEHICLE,
    title: "Executive",
    short: "Premium travel",
    detail: "Premium travel experience",
    benefit: "Premium comfort",
    image: EXECUTIVE_IMAGE,
    imageAlt: "Executive airport transfer",
  },
  {
    id: "minibus",
    vehicle: MINIBUS_VEHICLE,
    title: MINIBUS_CUSTOMER_NAME,
    short: MINIBUS_CUSTOMER_DESCRIPTION,
    detail: MINIBUS_CUSTOMER_DESCRIPTION,
    benefit: "Room for the whole party",
    image: MINIBUS_IMAGE,
    imageAlt: "7 Seater Minibus airport transfer",
  },
] as const;

type Category = (typeof CATEGORIES)[number];

function formatUplift(amount: number): string {
  const value = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(value)) return "+£0";
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `+£${text}`;
}

function formatFare(amount: number | null | undefined): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return formatQuote(amount);
}

export default function QuoteVehicleCategories({
  passengers,
  suitcases,
  selectedVehicle = null,
  onSelectVehicle,
  estateUpliftGbp = 6,
  executiveUpliftGbp = 20,
  vehicleFares = null,
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
  onSelectVehicle?: (vehicle: Category["vehicle"]) => void;
  estateUpliftGbp?: number;
  executiveUpliftGbp?: number;
  /** Authoritative totals for the current route. Null until a fare may be shown. */
  vehicleFares?: QuoteVehicleFares | null;
  /** Existing call sites pass this. Flight monitoring is worded “where applicable”. */
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
  const executiveBlockedByLuggage =
    passengers != null &&
    suitcases != null &&
    suitcases > EXECUTIVE_MAX_SUITCASES &&
    !lockedToMinibus &&
    !executiveBlockedByPassengers;
  const visible = CATEGORIES.filter((option) => option.id !== "minibus" || includeMinibus);
  const ownerOptions = visible.filter((option) => option.id !== "minibus");
  const minibusOption = visible.find((option) => option.id === "minibus") ?? null;
  const estateUplift = formatUplift(estateUpliftGbp);
  const executiveUplift = formatUplift(executiveUpliftGbp);

  function optionIsSelectable(option: Category): boolean {
    return (
      Boolean(onSelectVehicle) &&
      automatic != null &&
      (lockedToMinibus
        ? option.vehicle === MINIBUS_VEHICLE
        : option.vehicle === MINIBUS_VEHICLE || option.vehicle === automatic ||
          (option.id === "saloon" && saloonOk) ||
          (option.id === "estate" && estateOk) ||
          (option.id === "executive" && executiveOk))
    );
  }

  function fareFor(option: Category): number | null {
    if (!vehicleFares) return null;
    return vehicleFares[option.id];
  }

  function renderOption(option: Category, layout: "grid" | "row") {
    const isSelected = selected === option.vehicle;
    const selectable = optionIsSelectable(option);
    const unavailable = unavailableReason(option.id, {
      selectable,
      lockedToMinibus,
      saloonOk,
      estateOk,
      executiveOk,
      executiveBlockedByPassengers,
    });
    const badge =
      option.id === "estate" && luggageRecommendsEstate
        ? "Recommended for your luggage"
        : option.id === "estate" && estateOk && saloonOk
          ? "More comfort"
          : option.id === "executive" && executiveOk
            ? "Premium"
            : null;
    const uplift =
      option.id === "estate" ? estateUplift : option.id === "executive" ? executiveUplift : null;
    const fareLabel = formatFare(fareFor(option));
    const headerPrice = uplift ?? fareLabel;
    const selectLabel = isSelected
      ? "Selected"
      : !selectable
        ? unavailable
        : option.id === "estate"
          ? "Upgrade to Estate"
          : option.id === "executive"
            ? "Upgrade to Executive"
            : `Select ${option.title}`;
    const shell = `min-w-0 rounded-xl border ${
      isSelected
        ? "border-emerald bg-emerald/15 text-white ring-2 ring-emerald/70"
        : selectable
          ? "border-white/15 bg-white/[0.04] text-white/90"
          : "border-white/10 bg-white/[0.02] text-white/40"
    }`;
    const stackOnDesktop = layout === "grid";
    const summary = (
      <span
        className={`flex min-w-0 items-center gap-3 ${
          stackOnDesktop ? "md:flex-col md:items-stretch md:gap-2 md:text-center" : ""
        }`}
      >
        <VehicleArt
          src={option.image}
          alt={option.imageAlt}
          pending={option.id === "saloon" && !option.image}
          compact={layout === "row"}
        />
        <span className="min-w-0 flex-1">
          <span
            className={`flex items-start justify-between gap-2 ${
              stackOnDesktop ? "md:flex-col md:items-center" : ""
            }`}
          >
            <span className="min-w-0">
              {badge ? (
                <span className="mb-1 inline-flex max-w-full rounded-full border border-emerald/40 bg-emerald/15 px-2 py-0.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-emerald">
                  {badge}
                </span>
              ) : null}
              <span className="block text-base font-semibold leading-tight text-white">{option.title}</span>
              <span className={`mt-0.5 block text-xs leading-snug text-white/70 ${stackOnDesktop ? "md:hidden" : ""}`}>
                {option.short}
              </span>
              {stackOnDesktop ? (
                <span className="mt-0.5 hidden text-xs leading-snug text-white/70 md:block">{option.detail}</span>
              ) : null}
            </span>
            {headerPrice ? (
              <span className={`shrink-0 text-base font-bold tabular-nums text-white ${stackOnDesktop ? "md:hidden" : ""}`}>
                {headerPrice}
              </span>
            ) : null}
          </span>
          {option.id !== "minibus" && !(isSelected && stackOnDesktop) ? (
            <span
              className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-snug text-white/65 ${
                stackOnDesktop ? "md:hidden" : ""
              }`}
            >
              <CapacityBits option={option} />
            </span>
          ) : null}
          {selectLabel ? (
            <span
              className={`mt-1 inline-flex items-center gap-1 text-sm font-semibold text-white ${
                stackOnDesktop ? "md:hidden" : ""
              }`}
            >
              {isSelected ? <span aria-hidden>✓</span> : selectable ? <span aria-hidden>○</span> : null}
              <span>{selectLabel}</span>
            </span>
          ) : null}
        </span>
        {selectable ? <Chevron expanded={isSelected} /> : null}
      </span>
    );
    const details = (
      <span
        className={`mt-2 block space-y-1 text-left text-xs leading-snug text-white/80 ${
          stackOnDesktop ? "md:text-center" : ""
        } ${isSelected ? "" : stackOnDesktop ? "hidden md:block" : "hidden"}`}
      >
        <CapacityLines option={option} />
        <span className="block text-white/75">{option.benefit}</span>
        {isSelected && option.id === "estate" ? (
          <span className="mt-1 block space-y-0.5 md:hidden">
            {ESTATE_CARD_BENEFITS.map((benefit) => (
              <span key={benefit} className="block">
                ✓ {benefit}
              </span>
            ))}
          </span>
        ) : null}
        {isSelected && option.id === "executive" ? (
          <span className="mt-1 block space-y-0.5 md:hidden">
            {EXECUTIVE_CARD_BENEFITS.map((benefit) => (
              <span key={benefit} className="block">
                ✓ {benefit}
              </span>
            ))}
          </span>
        ) : null}
        <span className="block pt-1">
          {uplift ? (
            <>
              <span className="block text-sm font-semibold text-white">
                {selectable
                  ? `${option.id === "estate" ? "Upgrade to Estate" : "Upgrade to Executive"} ${uplift}`
                  : uplift}
              </span>
              {fareLabel ? (
                <span className="mt-0.5 block text-sm font-bold tabular-nums text-white">{fareLabel} total</span>
              ) : null}
            </>
          ) : (
            <span className="block text-lg font-bold tabular-nums text-white">{fareLabel ?? "…"}</span>
          )}
        </span>
        {selectLabel ? (
          <span
            className={`mt-1 min-h-11 items-center justify-center gap-1 text-sm font-semibold text-white ${
              stackOnDesktop ? "hidden md:inline-flex" : "hidden"
            }`}
          >
            {isSelected ? <span aria-hidden>✓</span> : selectable ? <span aria-hidden>○</span> : null}
            <span>{selectLabel}</span>
          </span>
        ) : null}
      </span>
    );
    const controlClass = "flex w-full min-w-0 flex-col px-3 py-3 text-left md:px-3 md:py-3";
    return (
      <div
        key={option.id}
        role="listitem"
        data-vehicle-category={option.id}
        data-vehicle-expanded={isSelected ? "true" : "false"}
        className={`${shell} ${layout === "row" ? "md:col-span-3" : ""}`}
      >
        {selectable ? (
          <button
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelectVehicle?.(option.vehicle)}
            className={`${controlClass} cursor-pointer`}
          >
            {summary}
            {details}
          </button>
        ) : (
          <div className={controlClass} aria-disabled="true">
            {summary}
            {details}
          </div>
        )}
        {isSelected && option.id === "executive" && executiveOk ? (
          <ExecutivePreferences
            quietJourney={quietJourney}
            climatePreference={climatePreference}
            onQuietJourneyChange={onQuietJourneyChange}
            onClimatePreferenceChange={onClimatePreferenceChange}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-2 overflow-x-hidden" data-quote-vehicle-categories>
      <p className="form-label mb-0">Choose your vehicle</p>
      <div
        className="grid grid-cols-1 gap-2 md:grid-cols-3 md:items-start"
        role="list"
        aria-label="Vehicle for this journey"
      >
        {ownerOptions.map((option) => renderOption(option, "grid"))}
        {minibusOption ? renderOption(minibusOption, "row") : null}
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
      {executiveBlockedByLuggage ? (
        <p className="text-xs leading-relaxed text-white/70" data-executive-luggage-unavailable>
          {EXECUTIVE_LUGGAGE_UNAVAILABLE_MESSAGE}
        </p>
      ) : null}
    </div>
  );
}

function CapacityBits({ option }: { option: Category }) {
  if (option.id === "saloon") {
    return (
      <>
        <span>Up to {SALOON_MAX_PASSENGERS} passengers</span>
        <span aria-hidden>·</span>
        <span>Up to {SALOON_MAX_SUITCASES} large suitcases</span>
      </>
    );
  }
  if (option.id === "estate") {
    return (
      <>
        <span>Up to {ESTATE_MAX_PASSENGERS} passengers</span>
        <span aria-hidden>·</span>
        <span>Up to {ESTATE_MAX_SUITCASES} large suitcases</span>
      </>
    );
  }
  if (option.id === "executive") {
    return (
      <>
        <span>Up to {EXECUTIVE_MAX_PASSENGERS} passengers</span>
        <span aria-hidden>·</span>
        <span>Up to {EXECUTIVE_MAX_SUITCASES} large suitcases</span>
      </>
    );
  }
  return <span>{option.short}</span>;
}

function CapacityLines({ option }: { option: Category }) {
  if (option.id === "saloon") {
    return (
      <>
        <span className="block">Up to {SALOON_MAX_PASSENGERS} passengers</span>
        <span className="block">Up to {SALOON_MAX_SUITCASES} large suitcases</span>
      </>
    );
  }
  if (option.id === "estate") {
    return (
      <>
        <span className="block">Up to {ESTATE_MAX_PASSENGERS} passengers</span>
        <span className="block">Extra luggage space</span>
      </>
    );
  }
  if (option.id === "executive") {
    return (
      <>
        <span className="block">Up to {EXECUTIVE_MAX_PASSENGERS} passengers</span>
        <span className="block">Up to {EXECUTIVE_MAX_SUITCASES} large suitcases</span>
      </>
    );
  }
  return null;
}

function VehicleArt({
  src,
  alt,
  pending,
  compact,
}: {
  src: string | null;
  alt: string;
  pending?: boolean;
  compact?: boolean;
}) {
  const frame = compact
    ? "h-14 w-24 shrink-0"
    : "h-14 w-24 shrink-0 md:h-16 md:w-full";
  if (!src) {
    return (
      <span
        className={`flex items-center justify-center rounded-lg bg-white/[0.06] ${frame}`}
        role="img"
        aria-label={alt}
        data-vehicle-image={pending ? "pending" : "missing"}
      >
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={1400}
      height={700}
      className={`object-contain ${frame}`}
    />
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center text-white/70 md:hidden ${
        expanded ? "rotate-180" : ""
      }`}
      aria-hidden
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 8l5 5 5-5" />
      </svg>
    </span>
  );
}

function ExecutivePreferences({
  quietJourney,
  climatePreference,
  onQuietJourneyChange,
  onClimatePreferenceChange,
}: {
  quietJourney: boolean;
  climatePreference: ClimatePreference;
  onQuietJourneyChange?: (value: boolean) => void;
  onClimatePreferenceChange?: (value: ClimatePreference) => void;
}) {
  return (
    <div className="space-y-3 border-t border-white/10 px-3 py-3">
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
