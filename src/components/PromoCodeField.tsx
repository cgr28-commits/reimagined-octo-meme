"use client";

/**
 * Checkout: optional "Have a promo code?" field and, once applied, the original fare,
 * promotional saving, airport charges and final total. The Worker re-checks everything
 * before the payment page is created; this only shows the customer what they will pay.
 */
import { useId, useState } from "react";
import { formatGbpFare } from "../../shared/website-fare-breakdown";

export type PromoSummaryRows = {
  vehicleFareGbp: number;
  savingGbp: number;
  airportChargesGbp: number;
  extrasGbp: number;
  totalGbp: number;
  percentLabel: string;
  code: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
  onRemove: () => void;
  checking: boolean;
  /** Error or information about the code (shown under the field). */
  message: string;
  applied: PromoSummaryRows | null;
  /** Shown instead of the field when a code cannot be used on this booking. */
  unavailableReason?: string;
  /** Start expanded (a code arrived from the email link). */
  defaultOpen?: boolean;
};

export default function PromoCodeField({
  value,
  onChange,
  onApply,
  onRemove,
  checking,
  message,
  applied,
  unavailableReason,
  defaultOpen = false,
}: Props) {
  const uid = useId();
  const [open, setOpen] = useState(defaultOpen || Boolean(value));
  const inputId = `${uid}-promo`;
  const msgId = `${uid}-promo-msg`;

  if (applied) {
    return (
      <div className="mt-2 border-t border-white/10 pt-2" data-promo-applied>
        <dl className="space-y-0.5 text-xs">
          <div className="flex justify-between gap-3 quote-secondary">
            <dt>Vehicle fare</dt>
            <dd className="shrink-0 tabular-nums">{formatGbpFare(applied.vehicleFareGbp)}</dd>
          </div>
          <div className="flex justify-between gap-3 font-semibold text-emerald" data-promo-saving>
            <dt>
              {applied.percentLabel} promo code ({applied.code})
            </dt>
            <dd className="shrink-0 tabular-nums">−{formatGbpFare(applied.savingGbp)}</dd>
          </div>
          {applied.airportChargesGbp > 0 ? (
            <div className="flex justify-between gap-3 quote-secondary">
              <dt>Airport charges (not discounted)</dt>
              <dd className="shrink-0 tabular-nums">+{formatGbpFare(applied.airportChargesGbp)}</dd>
            </div>
          ) : null}
          {applied.extrasGbp > 0 ? (
            <div className="flex justify-between gap-3 quote-secondary">
              <dt>Meet &amp; Greet</dt>
              <dd className="shrink-0 tabular-nums">+{formatGbpFare(applied.extrasGbp)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 border-t border-white/10 pt-1 text-sm font-bold text-white">
            <dt>Total to pay</dt>
            <dd className="shrink-0 tabular-nums">{formatGbpFare(applied.totalGbp)}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={onRemove}
          className="mt-1 min-h-11 text-xs font-semibold text-emerald underline underline-offset-2"
        >
          Remove promo code
        </button>
      </div>
    );
  }

  if (unavailableReason) {
    return (
      <p className="mt-2 text-xs quote-secondary" data-promo-unavailable>
        {unavailableReason}
      </p>
    );
  }

  return (
    <div className="mt-2" data-promo-field>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded="false"
          className="min-h-11 text-xs font-semibold text-emerald underline underline-offset-2"
        >
          Have a promo code?
        </button>
      ) : (
        // A group, not a <form>: this sits inside the booking form.
        <div role="group" aria-labelledby={`${inputId}-label`}>
          <label id={`${inputId}-label`} htmlFor={inputId} className="block text-xs font-semibold text-white">
            Promo code
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id={inputId}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                // Inside the booking form: Enter applies the code instead of submitting the booking.
                if (e.key === "Enter") {
                  e.preventDefault();
                  onApply();
                }
              }}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="MATNI-XXXX-XXXX"
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? msgId : undefined}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#c9d4e2] bg-white px-3 text-sm font-semibold uppercase tracking-wide text-[#071c38] placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-[#8a99ad] focus:border-emerald focus:outline-none focus:ring-2 focus:ring-emerald/40"
            />
            <button
              type="button"
              onClick={onApply}
              disabled={checking || !value.trim()}
              className="btn-primary min-h-11 shrink-0 rounded-lg px-4 text-sm"
            >
              {checking ? "Checking…" : "Apply"}
            </button>
          </div>
          {message ? (
            <p id={msgId} role="alert" className="mt-1.5 text-xs font-semibold text-[#ffb4b4]" data-promo-message>
              {message}
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] quote-secondary">
              Use the email address your code was sent to. Airport charges are not discounted.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
