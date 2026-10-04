"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { withBasePath } from "@/lib/paths";
import { formatQuote } from "@/lib/quote";
import { STANDARD_SALOON_IMAGE } from "@/lib/vehicle-artwork";
// Standard Saloon art: public/images/vehicles/quote-standard-saloon.webp
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
  executiveAvailableForParty,
  saloonCapacityAllows,
  type ClimatePreference,
} from "../../shared/executive-service";

/** Previous Saloon asset. Reused for Executive; the file itself is unchanged. */
const EXECUTIVE_IMAGE = withBasePath("/images/vehicles/quote-saloon.webp");
const ESTATE_IMAGE = withBasePath("/images/vehicles/quote-estate.webp");
const MINIBUS_IMAGE = withBasePath("/images/vehicles/quote-minibus.webp");

const EXECUTIVE_INCLUDED = [
  "Higher-spec vehicle",
  "Airport pickup & drop-off charges included",
  "Express terminal drop-off included when applicable",
  "Complimentary bottled water",
  "Phone charging available",
  "Quiet Journey option",
  "Climate preference",
  "Premium comfort",
] as const;

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
    short: "Spacious, comfortable private airport travel",
    detail: "Spacious, comfortable private airport travel",
    image: STANDARD_SALOON_IMAGE,
    imageAlt: "Saloon airport transfer",
  },
  {
    id: "estate",
    vehicle: ESTATE_VEHICLE,
    title: "Estate",
    short: "Extra luggage capacity & versatility",
    detail: "Extra luggage capacity & versatility",
    image: ESTATE_IMAGE,
    imageAlt: "Estate airport transfer",
  },
  {
    id: "executive",
    vehicle: EXECUTIVE_VEHICLE,
    title: "Executive",
    short: "Premium travel experience",
    detail: "Premium travel experience",
    image: EXECUTIVE_IMAGE,
    imageAlt: "Executive airport transfer",
  },
  {
    id: "minibus",
    vehicle: MINIBUS_VEHICLE,
    title: MINIBUS_CUSTOMER_NAME,
    short: MINIBUS_CUSTOMER_DESCRIPTION,
    detail: MINIBUS_CUSTOMER_DESCRIPTION,
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
    const showEstateBanner = option.id === "estate" && selectable;
    const uplift =
      option.id === "estate" ? estateUplift : option.id === "executive" ? executiveUplift : null;
    const fareLabel = formatFare(fareFor(option));
    const selectLabel = isSelected ? "Selected" : !selectable ? unavailable : `Select ${option.title}`;
    const shell = `flex min-w-0 flex-col overflow-hidden rounded-xl border-2 text-navy shadow-[0_8px_18px_rgba(7,28,56,0.08)] ${
      isSelected
        ? "border-emerald bg-[#f4fbf6]"
        : selectable
          ? "border-[#e4eaf2] bg-white"
          : "border-[#e4eaf2] bg-[#f7f8fa]"
    }`;
    const summary = (
      <>
        {layout === "grid" ? (
          <span className="hidden w-full md:block">
            <EstateBanner visible={showEstateBanner} />
          </span>
        ) : null}
        {showEstateBanner || option.id === "minibus" ? (
          <span className="block px-2.5 pt-2 md:hidden">
            {showEstateBanner ? <RecommendedPill /> : <GroupBadge />}
          </span>
        ) : null}
        <span className="flex items-center gap-2 px-2.5 pt-2.5 md:hidden">
          {selectable || isSelected ? (
            <RadioMark selected={isSelected} />
          ) : (
            <span className="h-5 w-5 shrink-0" aria-hidden />
          )}
          <VehicleArt
            src={option.image}
            alt={option.imageAlt}
            pending={option.id === "saloon" && !option.image}
            variant="mobile"
          />
          <span className="min-w-0 flex-1">
            {option.id === "executive" && executiveOk ? (
              <span className="mb-1 block">
                <PremiumBadge />
              </span>
            ) : null}
            <span className="flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5">
              <span className="min-w-0 text-sm font-semibold leading-tight text-navy">{option.title}</span>
              <MobilePrice uplift={uplift} fareLabel={fareLabel} />
              <span className="basis-full text-xs leading-snug text-navy/70">{option.short}</span>
            </span>
          </span>
        </span>
        <span
          className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 px-2.5 pb-2.5 text-[11px] leading-none text-navy md:hidden"
        >
          <MobileFacts option={option} />
          {isSelected ? (
            <span className="inline-flex items-center gap-1 font-semibold text-navy">
              <span aria-hidden>✓</span> Selected
            </span>
          ) : null}
          {unavailable ? <span className="basis-full pt-0.5 text-xs font-semibold leading-snug text-navy">{unavailable}</span> : null}
          {selectable ? <Chevron expanded={isSelected} /> : null}
        </span>
        {isSelected ? <MobileBenefits optionId={option.id} /> : null}
        {layout === "grid" ? (
          <span className="hidden min-h-0 flex-1 flex-col px-2.5 pb-2.5 md:flex">
            <VehicleArt
              src={option.image}
              alt={option.imageAlt}
              pending={option.id === "saloon" && !option.image}
              variant="desktop"
            />
            <span className="mt-2 flex min-h-6 items-center justify-center">
              {option.id === "executive" && executiveOk ? <PremiumBadge /> : null}
            </span>
            <span className="mt-1 block text-lg font-semibold leading-tight text-navy">{option.title}</span>
            <span className="mt-1 block min-h-10 text-sm leading-snug text-navy/70">{option.detail}</span>
            <span className="mt-3 block min-h-[11.5rem] space-y-2 text-sm leading-snug text-navy">
              <DesktopFacts option={option} />
            </span>
            <span
              className={`mt-auto flex min-h-11 items-center gap-1.5 rounded-full px-2.5 ${
                isSelected ? "bg-emerald text-navy" : "text-navy"
              }`}
            >
              {isSelected ? (
                <span aria-hidden className="text-base font-bold leading-none">
                  ✓
                </span>
              ) : selectable ? (
                <RadioMark selected={false} />
              ) : null}
              <span className="min-w-0 text-[13px] font-semibold leading-tight">{selectLabel ?? "Unavailable"}</span>
              <DesktopPrice uplift={uplift} fareLabel={fareLabel} inverted={isSelected} />
            </span>
          </span>
        ) : (
          <span className="hidden items-center gap-4 px-3 py-3 md:flex">
            <VehicleArt
              src={option.image}
              alt={option.imageAlt}
              pending={false}
              variant="row"
            />
            <span className="min-w-0 flex-1">
              <GroupBadge />
              <span className="mt-1 block text-lg font-semibold leading-tight text-navy">{option.title}</span>
              <span className="mt-0.5 block text-sm text-navy/70">{option.detail}</span>
            </span>
            <span
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3 ${
                isSelected ? "bg-emerald text-navy" : "text-navy"
              }`}
            >
              {isSelected ? (
                <span aria-hidden className="font-bold">
                  ✓
                </span>
              ) : (
                <RadioMark selected={false} />
              )}
              <span className="text-sm font-semibold">{selectLabel}</span>
              <DesktopPrice uplift={null} fareLabel={fareLabel} inverted={isSelected} />
            </span>
          </span>
        )}
      </>
    );
    const controlClass = "flex h-full min-w-0 flex-col text-left";
    return (
      <div
        key={option.id}
        role="listitem"
        data-vehicle-category={option.id}
        data-vehicle-expanded={isSelected ? "true" : "false"}
        className={shell}
      >
        {selectable ? (
          <button
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelectVehicle?.(option.vehicle)}
            className={`${controlClass} cursor-pointer`}
          >
            {summary}
          </button>
        ) : (
          <div className={controlClass} aria-disabled="true">
            {summary}
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
    <div className="min-w-0 max-w-full overflow-x-hidden rounded-2xl bg-white px-3 py-3.5 text-navy shadow-[0_10px_24px_rgba(7,28,56,0.12)] md:px-4 md:py-5" data-quote-vehicle-categories>
      <h2 className="text-xl font-semibold leading-tight text-navy md:text-2xl">Choose your vehicle</h2>
      <p className="mt-1 text-sm leading-snug text-navy/70">
        All vehicles are modern, comfortable and fully licensed for airport transfers.
      </p>
      {lockedToMinibus ? (
        <div className="mt-3" data-minibus-required>
          <p className="text-sm leading-snug text-navy/75">
            This party needs a 7 Seater Minibus. Saloon, Estate and Executive are not used for this number of passengers or suitcases.
          </p>
          {includeMinibus && minibusOption ? (
            <div className="mt-2.5" role="list" aria-label="7 Seater Minibus">
              {renderOption(minibusOption, "row")}
            </div>
          ) : (
            <p className="mt-2 text-sm font-semibold text-navy">
              A 7 Seater Minibus is not offered online for this journey.
            </p>
          )}
        </div>
      ) : (
        <>
          <div
            className="mt-3 grid grid-cols-1 items-start gap-2.5 md:mt-4 md:grid-cols-3 md:items-start md:gap-3"
            role="list"
            aria-label="Vehicle for this journey"
            data-standard-vehicle-choice
          >
            {ownerOptions.map((option) => renderOption(option, "grid"))}
          </div>
          <ChoiceGuidance />
        </>
      )}
      {!saloonOk && estateOk && !lockedToMinibus ? (
        <p className="mt-2 text-xs leading-relaxed text-navy/75" data-saloon-unavailable>
          Saloon is not suitable for your luggage. Estate is selected because it has the extra space.
        </p>
      ) : null}
      {!lockedToMinibus && executiveBlockedByPassengers ? (
        <p className="mt-2 text-xs leading-relaxed text-navy/75" data-executive-unavailable>
          {EXECUTIVE_PASSENGER_LIMIT_MESSAGE}
        </p>
      ) : null}
      {!lockedToMinibus && executiveBlockedByLuggage ? (
        <p className="mt-2 text-xs leading-relaxed text-navy/75" data-executive-luggage-unavailable>
          {EXECUTIVE_LUGGAGE_UNAVAILABLE_MESSAGE}
        </p>
      ) : null}
    </div>
  );
}

function DesktopFacts({ option }: { option: Category }) {
  if (option.id === "saloon") {
    return (
      <>
        <Fact icon={<PersonIcon />}>Up to {SALOON_MAX_PASSENGERS} passengers</Fact>
        <Fact icon={<CaseIcon />}>Up to {SALOON_MAX_SUITCASES} large suitcases</Fact>
        <Fact icon={<CheckIcon />}>Comfortable and efficient</Fact>
        <Fact icon={<CheckIcon />}>Spacious, comfortable interior</Fact>
      </>
    );
  }
  if (option.id === "estate") {
    return (
      <>
        <Fact icon={<PersonIcon />}>Up to {ESTATE_MAX_PASSENGERS} passengers</Fact>
        <Fact icon={<CaseIcon />}>Up to {ESTATE_MAX_SUITCASES} large suitcases</Fact>
        <Fact icon={<CheckIcon />}>Extra luggage space</Fact>
        <Fact icon={<CheckIcon />}>More room for larger bags</Fact>
        <Fact icon={<CheckIcon />}>Flexible luggage capacity</Fact>
      </>
    );
  }
  if (option.id === "executive") {
    return (
      <>
        <Fact icon={<PersonIcon />}>Up to {EXECUTIVE_MAX_PASSENGERS} passengers</Fact>
        <Fact icon={<CaseIcon />}>Up to {EXECUTIVE_MAX_SUITCASES} large suitcases</Fact>
        <Fact icon={<CheckIcon />}>Higher-spec vehicle</Fact>
        <Fact icon={<CheckIcon />}>Premium comfort</Fact>
        <Fact icon={<CheckIcon />}>Quiet Journey option</Fact>
      </>
    );
  }
  return null;
}

function MobileFacts({ option }: { option: Category }) {
  if (option.id === "saloon") {
    return (
      <>
        <Chip icon={<PersonIcon />} sr="Passengers">Up to {SALOON_MAX_PASSENGERS}</Chip>
        <Chip icon={<CaseIcon />} sr="Large suitcases">Up to {SALOON_MAX_SUITCASES}</Chip>
        <Chip icon={<CheckIcon />} sr="">Comfortable</Chip>
      </>
    );
  }
  if (option.id === "estate") {
    return (
      <>
        <Chip icon={<PersonIcon />} sr="Passengers">Up to {ESTATE_MAX_PASSENGERS}</Chip>
        <Chip icon={<CaseIcon />} sr="Large suitcases">Up to {ESTATE_MAX_SUITCASES}</Chip>
        <Chip icon={<CheckIcon />} sr="">Extra luggage</Chip>
      </>
    );
  }
  if (option.id === "executive") {
    return (
      <>
        <Chip icon={<PersonIcon />} sr="Passengers">Up to {EXECUTIVE_MAX_PASSENGERS}</Chip>
        <Chip icon={<CaseIcon />} sr="Large suitcases">Up to {EXECUTIVE_MAX_SUITCASES}</Chip>
        <Chip icon={<SparkIcon />} sr="">Premium</Chip>
      </>
    );
  }
  return (
    <Chip icon={<PersonIcon />} sr="">
      {MINIBUS_CUSTOMER_DESCRIPTION}
    </Chip>
  );
}

function MobileBenefits({ optionId }: { optionId: Category["id"] }) {
  const lines =
    optionId === "saloon"
      ? ["Comfortable and efficient", "Spacious, comfortable interior"]
      : optionId === "estate"
        ? ["Extra luggage space", "More room for larger bags", "Flexible luggage capacity"]
        : [];
  if (lines.length === 0) return null;
  return (
    <span className="block space-y-0.5 px-2.5 pb-2.5 text-xs leading-snug text-navy/80 md:hidden">
      {lines.map((line) => (
        <span key={line} className="block">
          ✓ {line}
        </span>
      ))}
    </span>
  );
}

function ChoiceGuidance() {
  return (
    <div className="mt-2.5 flex gap-2.5 rounded-xl border border-[#e4eaf2] bg-[#f7f9fc] px-3 py-2.5 text-navy">
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-navy/20 text-[11px] font-bold text-navy" aria-hidden>
        i
      </span>
      <p className="min-w-0 text-sm leading-snug">
        <span className="font-semibold">Not sure which to choose?</span>{" "}
        <span className="text-navy/75">
          All options provide a spacious, comfortable private airport transfer. Choose Estate for extra luggage capacity, or Executive for a premium travel experience.
        </span>
      </p>
    </div>
  );
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-navy/65" aria-hidden>
        {icon}
      </span>
      <span>{children}</span>
    </span>
  );
}

function Chip({ icon, sr, children }: { icon: ReactNode; sr: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="text-navy/65" aria-hidden>
        {icon}
      </span>
      {sr ? <span className="sr-only">{sr}: </span> : null}
      <span>{children}</span>
    </span>
  );
}

function EstateBanner({ visible }: { visible: boolean }) {
  return (
    <span
      className={`flex min-h-9 w-full items-center justify-center gap-1 px-2 py-1.5 text-center text-[10px] font-bold uppercase leading-tight tracking-wide ${
        visible ? "bg-[#0e7a36] text-white" : "invisible"
      }`}
      aria-hidden={visible ? undefined : true}
    >
      <StarIcon />
      Extra luggage space
    </span>
  );
}

function PremiumBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-emerald bg-navy px-2 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white">
      Premium
    </span>
  );
}

function RecommendedPill() {
  return (
    <span className="mb-1 inline-flex max-w-full items-center gap-1 rounded-full bg-[#0e7a36] px-2 py-1 text-[10px] font-bold uppercase leading-tight tracking-wide text-white">
      <StarIcon />
      <span className="min-w-0 text-left">Extra luggage space</span>
    </span>
  );
}

function GroupBadge() {
  return (
    <span className="mb-1 inline-flex rounded-full border border-navy/15 bg-navy/[0.05] px-2 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-navy">
      Group travel
    </span>
  );
}

function MobilePrice({ uplift, fareLabel }: { uplift: string | null; fareLabel: string | null }) {
  return (
    <span className="shrink-0 text-right tabular-nums text-navy">
      {uplift ? (
        <>
          <span className="block text-sm font-bold leading-tight whitespace-nowrap">{uplift}</span>
          {fareLabel ? (
            <span className="mt-0.5 block text-[11px] font-semibold leading-tight whitespace-nowrap text-navy/75">
              ({fareLabel} total)
            </span>
          ) : null}
        </>
      ) : (
        <span className="block text-sm font-bold leading-tight whitespace-nowrap">{fareLabel ?? "…"}</span>
      )}
    </span>
  );
}

function DesktopPrice({
  uplift,
  fareLabel,
  inverted,
}: {
  uplift: string | null;
  fareLabel: string | null;
  inverted?: boolean;
}) {
  const totalClass = inverted ? "text-navy/80" : "text-navy/70";
  return (
    <span className="ml-auto shrink-0 text-right tabular-nums whitespace-nowrap">
      {uplift ? (
        <>
          <span className="block text-sm font-bold leading-tight">{uplift}</span>
          {fareLabel ? <span className={`block text-[11px] font-semibold leading-tight ${totalClass}`}>{fareLabel} total</span> : null}
        </>
      ) : (
        <span className="block text-sm font-bold leading-tight">{fareLabel ?? "…"}</span>
      )}
    </span>
  );
}

function VehicleArt({
  src,
  alt,
  pending,
  variant,
}: {
  src: string | null;
  alt: string;
  pending?: boolean;
  variant: "mobile" | "desktop" | "row";
}) {
  const frame =
    variant === "desktop"
      ? "aspect-[2/1] w-full"
      : variant === "row"
        ? "h-16 w-36 shrink-0"
        : "h-16 w-[38%] min-w-[5.25rem] max-w-[8.75rem] shrink-0";
  if (!src) {
    return (
      <span
        className={`block rounded-md border border-[#d5deea] bg-[#eef3f8] ${frame}`}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        data-vehicle-image={pending ? "pending" : "missing"}
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={1400}
      height={700}
      className={`rounded-md bg-white object-contain ${frame}`}
    />
  );
}

function RadioMark({ selected }: { selected: boolean }) {
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
        selected ? "border-emerald bg-emerald" : "border-navy/30 bg-white"
      }`}
      aria-hidden
    >
      {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
    </span>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <span
      className={`ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center text-navy/55 ${
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

function PersonIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="6.5" r="2.2" />
      <path d="M4.8 16.2c.7-2.5 2.6-3.8 5.2-3.8s4.5 1.3 5.2 3.8" strokeLinecap="round" />
    </svg>
  );
}

function CaseIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="6.5" width="13" height="9" rx="1.4" />
      <path d="M8 6.5V5.2A1.2 1.2 0 0 1 9.2 4h1.6A1.2 1.2 0 0 1 12 5.2v1.3" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4.5 10.5l3.2 3.2 7.3-7.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
      <path d="M10 2.5l1.4 4.3L15.8 8l-4.4 1.3L10 13.6 8.6 9.3 4.2 8l4.4-1.2L10 2.5z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor" aria-hidden>
      <path d="M10 2.2l1.8 3.8 4.2.6-3 3 .7 4.2L10 11.8 6.3 13.8l.7-4.2-3-3 4.2-.6L10 2.2z" />
    </svg>
  );
}

function ExecutiveIncludedList() {
  return (
    <ul className="mt-1.5 space-y-1 text-sm leading-snug text-navy">
      {EXECUTIVE_INCLUDED.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 text-navy/65" aria-hidden>
            <CheckIcon />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ExecutivePreferenceControls({
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
    <>
      <label className="flex min-h-11 items-start gap-3 text-sm text-navy">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 accent-emerald"
          checked={quietJourney}
          onChange={(event) => onQuietJourneyChange?.(event.target.checked)}
        />
        <span>
          <span className="block font-semibold">Quiet Journey</span>
          <span className="block text-xs leading-relaxed text-navy/70">
            Prefer a peaceful journey with minimal conversation.
          </span>
        </span>
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-navy">Climate preference</legend>
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
                className={`min-h-11 rounded-xl border px-2 text-xs font-semibold text-navy ${
                  pressed ? "border-emerald bg-emerald/10" : "border-navy/15 bg-white"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>
    </>
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
    <div className="space-y-3 border-t border-navy/10 px-3 py-3" data-executive-includes>
      <div>
        <p className="text-sm font-semibold text-navy">Executive includes</p>
        <ExecutiveIncludedList />
      </div>
      <ExecutivePreferenceControls
        quietJourney={quietJourney}
        climatePreference={climatePreference}
        onQuietJourneyChange={onQuietJourneyChange}
        onClimatePreferenceChange={onClimatePreferenceChange}
      />
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
