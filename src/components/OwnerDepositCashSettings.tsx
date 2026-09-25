"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_DEPOSIT_MINIMUM_GBP,
  DEFAULT_DEPOSIT_PERCENT,
  MAX_DEPOSIT_MINIMUM_GBP,
  MAX_DEPOSIT_PERCENT,
  MIN_DEPOSIT_MINIMUM_GBP,
  MIN_DEPOSIT_PERCENT,
} from "../../shared/deposit-cash";
import { formatGbpAmount } from "../../shared/gbp";
import type { BookingSettings } from "@/lib/short-notice-api";
import { updateDepositCashSettings } from "@/lib/short-notice-api";

type OwnerDepositCashSettingsProps = {
  ownerKey: string;
  settings: BookingSettings | null;
  onSaved: (settings: BookingSettings) => void;
  fieldClass: string;
};

export default function OwnerDepositCashSettings({
  ownerKey,
  settings,
  onSaved,
  fieldClass,
}: OwnerDepositCashSettingsProps) {
  const saved = settings?.depositCash;
  const [enabled, setEnabled] = useState(saved?.enabled === true);
  const [percentDraft, setPercentDraft] = useState(String(saved?.percent ?? DEFAULT_DEPOSIT_PERCENT));
  const [minimumDraft, setMinimumDraft] = useState(
    String(saved?.minimumGbp ?? DEFAULT_DEPOSIT_MINIMUM_GBP),
  );

  useEffect(() => {
    setEnabled(saved?.enabled === true);
    setPercentDraft(String(saved?.percent ?? DEFAULT_DEPOSIT_PERCENT));
    setMinimumDraft(String(saved?.minimumGbp ?? DEFAULT_DEPOSIT_MINIMUM_GBP));
  }, [saved?.enabled, saved?.percent, saved?.minimumGbp]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const currentEnabled = saved?.enabled === true;
  const currentPercent = saved?.percent ?? DEFAULT_DEPOSIT_PERCENT;
  const currentMinimum = saved?.minimumGbp ?? DEFAULT_DEPOSIT_MINIMUM_GBP;

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const next = await updateDepositCashSettings(ownerKey, {
        enabled,
        percent: Number(percentDraft),
        minimumGbp: Number(minimumDraft),
      });
      onSaved(next);
      setEnabled(next.depositCash?.enabled === true);
      setPercentDraft(String(next.depositCash?.percent ?? DEFAULT_DEPOSIT_PERCENT));
      setMinimumDraft(String(next.depositCash?.minimumGbp ?? DEFAULT_DEPOSIT_MINIMUM_GBP));
      setMessage(
        next.depositCash?.enabled
          ? `Deposit + Cash is ON for new website instant quotes (${next.depositCash.percent}% / min ${formatGbpAmount(next.depositCash.minimumGbp)}). Existing bookings are unchanged.`
          : "Deposit + Cash is OFF for new bookings. Existing Deposit + Cash bookings keep their cash balances.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save Deposit + Cash settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-white/15 bg-white/[0.03] p-3 sm:p-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
          Payment options
        </p>
        <h3 className="mt-1 text-lg font-bold text-white">Deposit + Cash</h3>
        <p className="mt-1 break-words text-sm text-white/65">
          Off by default. When on, eligible homepage / website instant quotes can pay a card
          deposit and the rest in cash to the driver. Personal Quotes, Quick Quotes, saved quote
          links, short-notice links, Request Only links and A2A specialist links stay full-payment.
          Changing these settings never recalculates existing or in-progress bookings.
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-h-11 items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-white/30 bg-navy text-emerald focus:ring-emerald/30"
          />
          Enabled for new website instant quotes
        </label>
        <label className="block min-w-0 text-sm text-white/70">
          Deposit percentage
          <input
            type="number"
            inputMode="numeric"
            min={MIN_DEPOSIT_PERCENT}
            max={MAX_DEPOSIT_PERCENT}
            step={1}
            value={percentDraft}
            onChange={(event) => setPercentDraft(event.target.value)}
            className={`${fieldClass} sm:w-28`}
          />
        </label>
        <label className="block min-w-0 text-sm text-white/70">
          Minimum deposit (£)
          <input
            type="number"
            inputMode="decimal"
            min={MIN_DEPOSIT_MINIMUM_GBP}
            max={MAX_DEPOSIT_MINIMUM_GBP}
            step={1}
            value={minimumDraft}
            onChange={(event) => setMinimumDraft(event.target.value)}
            className={`${fieldClass} sm:w-28`}
          />
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="min-h-11 w-full rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy disabled:opacity-60 sm:w-auto"
        >
          {saving ? "Saving…" : "Save Deposit + Cash"}
        </button>
      </div>
      <p className="mt-2 break-words text-xs text-white/45">
        Current: {currentEnabled ? "Enabled" : "Disabled"} · {currentPercent}% · min{" "}
        {formatGbpAmount(currentMinimum)}. Allowed {MIN_DEPOSIT_PERCENT}–{MAX_DEPOSIT_PERCENT}% and{" "}
        {formatGbpAmount(MIN_DEPOSIT_MINIMUM_GBP)}–{formatGbpAmount(MAX_DEPOSIT_MINIMUM_GBP)}.
        Default 20% / £15.
      </p>
      {message ? (
        <p className="mt-2 text-sm text-emerald" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
