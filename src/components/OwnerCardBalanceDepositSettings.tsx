"use client";

import { useState } from "react";
import {
  CARD_BALANCE_CANCEL_DAYS_BEFORE,
  CARD_BALANCE_DEPOSIT_PERCENT,
  CARD_BALANCE_DUE_DAYS_BEFORE,
  CARD_BALANCE_MIN_DAYS_AHEAD,
  CARD_BALANCE_MIN_FARE_GBP,
} from "../../shared/deposit-card-balance";
import type { BookingSettings } from "@/lib/short-notice-api";
import { updateCardBalanceDepositSettings } from "@/lib/short-notice-api";

type Props = {
  ownerKey: string;
  settings: BookingSettings | null;
  onSaved: (settings: BookingSettings) => void;
};

/** Owner switch for the 20% deposit on bookings made well ahead (15 Nov 2026). */
export default function OwnerCardBalanceDepositSettings({ ownerKey, settings, onSaved }: Props) {
  const enabled = settings ? settings.cardBalanceDeposit?.enabled !== false : null;
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(next: boolean) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await updateCardBalanceDepositSettings(ownerKey, next);
      onSaved(saved);
      setMessage(
        saved.cardBalanceDeposit?.enabled === false
          ? "20% deposit is OFF. New customers pay in full. Bookings already made on a deposit are unchanged."
          : "20% deposit is ON for new bookings made 30+ days ahead.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the 20% deposit setting");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-white/15 bg-white/[0.03] p-3 sm:p-4" data-owner-card-balance-deposit>
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald">Payment options</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-white">{CARD_BALANCE_DEPOSIT_PERCENT}% deposit</h3>
          <p className="mt-1 break-words text-sm text-white/65">
            Customers booking {CARD_BALANCE_MIN_DAYS_AHEAD}+ days ahead (fare £{CARD_BALANCE_MIN_FARE_GBP}+) can pay{" "}
            {CARD_BALANCE_DEPOSIT_PERCENT}% now. The balance link is emailed {CARD_BALANCE_DUE_DAYS_BEFORE} days
            before pickup; unpaid bookings cancel {CARD_BALANCE_CANCEL_DAYS_BEFORE} days before.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled === true}
          aria-label="20% deposit"
          disabled={saving || enabled == null}
          onClick={() => void save(!enabled)}
          className={`relative mt-1 inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            enabled ? "bg-emerald" : "bg-white/20"
          }`}
        >
          <span
            className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-7" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      <p className="mt-2 text-sm font-semibold text-white/80">
        {enabled == null ? "Loading…" : enabled ? "On — offered to customers" : "Off — customers pay in full"}
      </p>
      {message ? (
        <p className="mt-2 text-sm text-emerald" role="status">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-red-300" role="alert">{error}</p>
      ) : null}
    </div>
  );
}
