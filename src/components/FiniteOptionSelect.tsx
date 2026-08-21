"use client";

/**
 * Native <select> for finite option sets (passengers, luggage, etc.).
 * Uses the platform picker on mobile — faster than typing for drivers/owners.
 */

type FiniteOptionSelectProps = {
  id?: string;
  label: string;
  value: number | "";
  options: readonly number[] | number[];
  onChange: (value: number) => void;
  formatOption?: (value: number) => string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  "aria-label"?: string;
};

const selectClass =
  "quote-text-input min-h-12 w-full appearance-none rounded-xl border border-white/15 bg-navy bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat px-3 pr-10 text-base text-white focus:border-emerald/50 focus:outline-none focus:ring-1 focus:ring-emerald/30 disabled:opacity-60";

const chevronSvg =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a8b3c2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")";

export default function FiniteOptionSelect({
  id,
  label,
  value,
  options,
  onChange,
  formatOption,
  className,
  disabled,
  required,
  allowEmpty = false,
  emptyLabel = "Select…",
  "aria-label": ariaLabel,
}: FiniteOptionSelectProps) {
  const safeOptions = options.length > 0 ? [...options] : [];
  const selected =
    value === "" || (typeof value === "number" && !safeOptions.includes(value))
      ? ""
      : value;

  return (
    <label className={`block min-w-0 text-sm text-white/80 ${className ?? ""}`}>
      {label.trim() ? (
        <span className="mb-1.5 block text-xs font-medium text-white/70">{label}</span>
      ) : null}
      <select
        id={id}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel || label}
        value={selected === "" ? "" : String(selected)}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") {
            return;
          }
          const next = Number(raw);
          if (Number.isFinite(next) && safeOptions.includes(next)) {
            onChange(next);
          }
        }}
        className={selectClass}
        style={{ backgroundImage: chevronSvg }}
      >
        {allowEmpty || selected === "" ? (
          <option value="" className="bg-navy text-white">
            {emptyLabel}
          </option>
        ) : null}
        {safeOptions.map((option) => (
          <option key={option} value={option} className="bg-navy text-white">
            {formatOption ? formatOption(option) : String(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Passenger options for online Saloon/Estate capacity (1–4). */
export const ONLINE_PASSENGER_OPTIONS = [1, 2, 3, 4] as const;

/**
 * Luggage options for Quick Quote: 0–3 exact, then 4+ stored as 5
 * (matches public FIVE_PLUS_SUITCASES → Minibus when bags > 4).
 */
export const ONLINE_SUITCASE_OPTIONS = [0, 1, 2, 3, 5] as const;

export function formatOnlineSuitcaseOption(count: number): string {
  return count >= 5 ? "4+" : String(count);
}

/**
 * Personal Quotes exclude Minibus — luggage stays 0–4 (last option labelled “4+”)
 * so vehicle remains Saloon/Estate without changing luggage thresholds.
 */
export const PERSONAL_QUOTE_SUITCASE_OPTIONS = [0, 1, 2, 3, 4] as const;

export function formatPersonalQuoteSuitcaseOption(count: number): string {
  return count >= 4 ? "4+" : String(count);
}
