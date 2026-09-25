"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BANK_HOLIDAY_BEHAVIOUR_NOTE,
  SURCHARGE_STACKING_EXPLANATION,
  defaultOwnerPricingSettings,
  diffOwnerPricingSettings,
  formatMinutesAsTime,
  formatPercentFromRate,
  nightWeekendSurchargeExplanation,
  previewSurchargeOnBase,
  previewVehicleFaresFromSaloon,
  validateOwnerPricingInput,
  type OwnerPricingAuditEntry,
  type OwnerPricingSettings,
} from "../../shared/owner-pricing-config";
import { AIRPORT_FIXED_COSTS_GBP } from "../../shared/airport-fixed-costs";
import { EXPRESS_DROP_OFF_FEES_GBP } from "../../shared/express-drop-off";
import {
  fetchOwnerPricing,
  restoreOwnerPricingDefaults,
  saveOwnerPricing,
} from "@/lib/owner-pricing-api";
import { isBrowserPricingPreview } from "@/lib/pricing-preview-store";
import { PREVIEW_PRICING_BANNER } from "../../shared/pricing-preview-isolation";
import { MINIBUS_CUSTOMER_DESCRIPTION, MINIBUS_CUSTOMER_NAME } from "../../shared/vehicle-display";

type OwnerPricingPanelProps = {
  ownerKey: string;
  isolated?: boolean;
};

const fieldClass =
  "box-border mt-1 min-h-12 w-full min-w-0 max-w-full rounded-xl border border-white/15 bg-navy px-3 text-base text-white [color-scheme:dark]";
const prefixedFieldClass =
  "box-border mt-1 min-h-12 w-full min-w-0 max-w-full rounded-xl border border-white/15 bg-navy pl-8 pr-3 text-base text-white [color-scheme:dark]";
const percentFieldClass =
  "box-border mt-1 min-h-12 w-full min-w-0 max-w-full rounded-xl border border-white/15 bg-navy pl-3 pr-8 text-base text-white [color-scheme:dark]";
const labelClass = "block min-w-0 text-sm font-medium text-white/70";

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className={`${labelClass} mt-3`}>
      {label}
      <span className="relative mt-1 block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/55" aria-hidden>
          £
        </span>
        <input
          className={prefixedFieldClass}
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </span>
    </label>
  );
}

function PercentField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className={`${labelClass} mt-3`}>
      {label}
      <span className="relative mt-1 block">
        <input
          className={percentFieldClass}
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/55" aria-hidden>
          %
        </span>
      </span>
    </label>
  );
}

function knotLabel(index: number, knots: Array<{ miles: number }>): string {
  if (index === 0) return `Distance rate — up to ${knots[0]?.miles ?? 0} miles`;
  return `Distance rate — ${knots[index - 1]?.miles ?? 0} to ${knots[index]?.miles ?? 0} miles`;
}

function cloneSettings(settings: OwnerPricingSettings): OwnerPricingSettings {
  return JSON.parse(JSON.stringify(settings)) as OwnerPricingSettings;
}

function settingsEqual(a: OwnerPricingSettings, b: OwnerPricingSettings): boolean {
  return JSON.stringify({ ...a, updatedAt: "", version: 0 }) === JSON.stringify({ ...b, updatedAt: "", version: 0 });
}

function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  id: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`inline-flex min-h-11 min-w-[5.5rem] items-center justify-center rounded-xl px-3 text-sm font-semibold ${
        checked ? "bg-emerald text-navy" : "bg-white/10 text-white"
      }`}
    >
      <span className="sr-only">{label}</span>
      {checked ? "ON" : "OFF"}
    </button>
  );
}

export default function OwnerPricingPanel({ ownerKey, isolated = false }: OwnerPricingPanelProps) {
  const [saved, setSaved] = useState<OwnerPricingSettings>(defaultOwnerPricingSettings());
  const [draft, setDraft] = useState<OwnerPricingSettings>(defaultOwnerPricingSettings());
  const [defaults, setDefaults] = useState<OwnerPricingSettings>(defaultOwnerPricingSettings());
  const [audit, setAudit] = useState<OwnerPricingAuditEntry[]>([]);
  const [loading, setLoading] = useState(!isolated);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"save" | "restore" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOwnerPricing(ownerKey);
      setSaved(result.settings);
      setDraft(cloneSettings(result.settings));
      setDefaults(result.defaults);
      setAudit(result.audit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load pricing settings.");
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => !settingsEqual(saved, draft), [saved, draft]);
  const validation = useMemo(() => validateOwnerPricingInput(draft), [draft]);
  const changes = useMemo(() => diffOwnerPricingSettings(saved, draft), [saved, draft]);
  const restoreChanges = useMemo(
    () =>
      diffOwnerPricingSettings(draft, {
        ...defaults,
        minibus: { ...defaults.minibus, publicEnabled: draft.minibus.publicEnabled },
      }),
    [defaults, draft],
  );
  const preview = useMemo(() => previewVehicleFaresFromSaloon(50, draft), [draft]);
  const nightOnHundred = previewSurchargeOnBase(100, draft.night.surchargeRate);
  const nightOnMinibus = previewSurchargeOnBase(preview.minibusQuotedGbp, draft.night.surchargeRate);
  const weekendDays = draft.weekend.days.includes(6) && draft.weekend.days.includes(0)
    ? "Saturday and Sunday, all day (Europe/London)"
    : `Days ${draft.weekend.days.join(", ")}`;
  const isolatedPreview = isolated || isBrowserPricingPreview();

  const update = <K extends keyof OwnerPricingSettings>(key: K, value: OwnerPricingSettings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const persist = async (mode: "save" | "restore") => {
    setSaving(true);
    setError(null);
    try {
      const result =
        mode === "restore"
          ? await restoreOwnerPricingDefaults(ownerKey, saved.version)
          : await saveOwnerPricing(ownerKey, draft, saved.version);
      setSaved(result.settings);
      setDraft(cloneSettings(result.settings));
      setDefaults(result.defaults);
      setAudit(result.audit);
      setConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save pricing settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-white/70">Loading pricing settings…</p>;
  }

  return (
    <section className="space-y-5" aria-labelledby="owner-pricing-heading">
      <div>
        <h2 id="owner-pricing-heading" className="text-xl font-bold text-white">
          Pricing
        </h2>
        <p className="mt-1 text-sm text-white/70">
          Customer fare settings. Manage vehicle prices, surcharges and online vehicle availability.
        </p>
        {isolatedPreview ? (
          <p
            className="mt-3 rounded-xl border border-sky-300/40 bg-sky-400/10 px-3 py-3 text-sm font-semibold text-sky-100"
            role="status"
          >
            {PREVIEW_PRICING_BANNER}
          </p>
        ) : null}
        {dirty ? (
          <p className="mt-2 rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-100">
            Unsaved changes — {isolatedPreview ? "preview only, not live pricing" : "preview only until you save"}.
          </p>
        ) : null}
      </div>

      <section className="rounded-2xl border border-white/10 bg-navy/50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald">Vehicle pricing</h3>
        <div className="mt-4 space-y-6">
          <div>
            <p className="text-lg font-semibold text-white">Saloon</p>
            <MoneyField
              label="Minimum fare"
              value={draft.saloon.minimumFareGbp}
              onChange={(minimumFareGbp) => update("saloon", { ...draft.saloon, minimumFareGbp })}
            />
            <label className={`${labelClass} mt-3`}>
              Floor distance (miles)
              <input
                className={fieldClass}
                inputMode="numeric"
                value={draft.saloon.floorMiles}
                onChange={(event) =>
                  update("saloon", { ...draft.saloon, floorMiles: Number(event.target.value) })
                }
              />
            </label>
            <p className="mt-3 text-xs text-white/55">Current Saloon distance rates</p>
            <div className="mt-2 space-y-3">
              {draft.saloon.knots.map((knot, index) => (
                <div key={`${knot.miles}-${index}`} className="min-w-0">
                  <p className="text-sm font-medium text-white/80">{knotLabel(index, draft.saloon.knots)}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={labelClass}>
                      Miles
                      <input
                        className={fieldClass}
                        inputMode="decimal"
                        value={knot.miles}
                        onChange={(event) => {
                          const knots = draft.saloon.knots.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, miles: Number(event.target.value) } : row,
                          );
                          update("saloon", { ...draft.saloon, knots });
                        }}
                      />
                    </label>
                    <MoneyField
                      label="Fare"
                      value={knot.fareGbp}
                      onChange={(fareGbp) => {
                        const knots = draft.saloon.knots.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, fareGbp } : row,
                        );
                        update("saloon", { ...draft.saloon, knots });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-lg font-semibold text-white">Estate</p>
            <MoneyField
              label="Uplift over Saloon"
              value={draft.estate.upliftGbp}
              onChange={(upliftGbp) => update("estate", { upliftGbp })}
            />
            <p className="mt-1 text-xs text-white/55">
              Example: Saloon £50.00 → Estate £{(50 + Number(draft.estate.upliftGbp || 0)).toFixed(2)}
            </p>
          </div>

          <div>
            <p className="text-lg font-semibold text-white">{MINIBUS_CUSTOMER_NAME}</p>
            <p className="mt-1 text-sm text-white/70">{MINIBUS_CUSTOMER_DESCRIPTION}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-sm text-white/80">Offer 7 Seater Minibus online</p>
              <Toggle
                id="public-minibus-enabled"
                label="Offer 7 Seater Minibus online"
                checked={draft.minibus.publicEnabled}
                onChange={(publicEnabled) =>
                  update("minibus", { ...draft.minibus, publicEnabled })
                }
              />
            </div>
            <label className={`${labelClass} mt-3`}>
              Pricing: Estate fare ×
              <input
                className={fieldClass}
                inputMode="decimal"
                value={draft.minibus.multiplier}
                onChange={(event) =>
                  update("minibus", { ...draft.minibus, multiplier: Number(event.target.value) })
                }
              />
            </label>
            <p className="mt-1 text-xs text-white/55">
              Estate × {Number(draft.minibus.multiplier || 0).toFixed(2)}, nearest penny only. Not
              rounded to the nearest £5.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-navy/50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald">Return pricing</h3>
        <PercentField
          label="Return Booking Discount"
          value={Math.round(draft.returnDiscount.rate * 1000) / 10}
          onChange={(value) => update("returnDiscount", { rate: value / 100 })}
        />
        <p className="mt-1 text-xs text-white/55">
          Applies only to eligible base vehicle fares. Airport, Express and other fixed charges are
          not discounted.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-navy/50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald">
          Night / Weekend / Bank Holiday
        </h3>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-white/70">Night pricing enabled</p>
          <Toggle
            id="night-enabled"
            label="Night pricing enabled"
            checked={draft.night.enabled}
            onChange={(enabled) => update("night", { ...draft.night, enabled })}
          />
        </div>
        <PercentField
          label="Night surcharge"
          value={Math.round(draft.night.surchargeRate * 1000) / 10}
          onChange={(value) => update("night", { ...draft.night, surchargeRate: value / 100 })}
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className={labelClass}>
            Night starts
            <input
              className={fieldClass}
              type="time"
              value={formatMinutesAsTime(draft.night.startMinutes)}
              onChange={(event) => {
                const [hours, minutes] = event.target.value.split(":").map(Number);
                update("night", { ...draft.night, startMinutes: hours * 60 + minutes });
              }}
            />
          </label>
          <label className={labelClass}>
            Night ends
            <input
              className={fieldClass}
              type="time"
              value={formatMinutesAsTime(draft.night.endMinutes)}
              onChange={(event) => {
                const [hours, minutes] = event.target.value.split(":").map(Number);
                update("night", { ...draft.night, endMinutes: hours * 60 + minutes });
              }}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-white/55">
          Night hours apply Monday–Friday. Current window: {formatMinutesAsTime(draft.night.startMinutes)}{" "}
          to {formatMinutesAsTime(draft.night.endMinutes)}.
        </p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-white/70">Weekend pricing enabled</p>
          <Toggle
            id="weekend-enabled"
            label="Weekend pricing enabled"
            checked={draft.weekend.enabled}
            onChange={(enabled) => update("weekend", { ...draft.weekend, enabled })}
          />
        </div>
        <PercentField
          label="Weekend surcharge"
          value={Math.round(draft.weekend.surchargeRate * 1000) / 10}
          onChange={(value) => update("weekend", { ...draft.weekend, surchargeRate: value / 100 })}
        />
        <p className="mt-2 text-xs text-white/55">
          Qualifying weekend: {weekendDays}. Whole days, not hourly start/end times.
        </p>
        <p className="mt-3 text-sm text-white/80">{SURCHARGE_STACKING_EXPLANATION}</p>
        <p className="mt-4 text-sm font-semibold uppercase tracking-wider text-emerald">Bank Holidays</p>
        <p className="mt-2 text-sm text-white/70">{BANK_HOLIDAY_BEHAVIOUR_NOTE}</p>
        <p className="mt-3 text-xs text-white/55">{nightWeekendSurchargeExplanation(draft)}</p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-navy/50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald">
          Airport / fixed charges
        </h3>
        <p className="mt-2 text-xs text-white/55">
          Display only in this release. These values are already configuration-driven and can be
          made editable in a later PR.
        </p>
        <ul className="mt-3 space-y-2 text-sm text-white/80">
          {(["BFS", "BHD", "DUB", "LDY"] as const).map((code) => {
            const row = AIRPORT_FIXED_COSTS_GBP[code];
            const express =
              code === "BFS" || code === "BHD" ? EXPRESS_DROP_OFF_FEES_GBP[code] : 0;
            return (
              <li key={code}>
                <span className="font-semibold text-white">{code}</span>
                {`: drop-off £${row.dropOffFeeGbp}, pickup £${row.pickupFeeGbp}, parking £${row.parkingAllowanceGbp}, toll £${row.tollAllowanceGbp}. Express £${express}.`}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-white/10 bg-navy/50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald">Pricing preview</h3>
        {dirty ? (
          <p className="mt-2 text-sm font-semibold text-amber-100">Preview — unsaved settings</p>
        ) : isolatedPreview ? (
          <p className="mt-2 text-sm text-white/60">Preview — isolated test settings, not live pricing.</p>
        ) : (
          <p className="mt-2 text-sm text-white/60">Preview uses the saved settings.</p>
        )}
        <dl className="mt-3 space-y-2 text-sm text-white/85">
          <div className="flex justify-between gap-3">
            <dt>Saloon</dt>
            <dd>£{preview.saloonGbp.toFixed(2)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Estate</dt>
            <dd>£{preview.estateGbp.toFixed(2)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>7 Seater Minibus</dt>
            <dd>£{preview.minibusQuotedGbp.toFixed(2)}</dd>
          </div>
          <div className="flex justify-between gap-3 pt-2">
            <dt>Night {formatPercentFromRate(draft.night.surchargeRate)} on 7 Seater £{preview.minibusQuotedGbp.toFixed(2)}</dt>
            <dd>+£{nightOnMinibus.surchargeGbp.toFixed(2)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Night {formatPercentFromRate(draft.night.surchargeRate)} on £100</dt>
            <dd>+£{nightOnHundred.surchargeGbp.toFixed(2)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-white/10 bg-navy/50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald">Change history</h3>
        {audit.length === 0 ? (
          <p className="mt-2 text-sm text-white/60">No pricing changes recorded yet.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {audit.slice(0, 12).map((entry) => (
              <li key={entry.id} className="text-sm text-white/80">
                <p className="font-semibold text-white">
                  {new Date(entry.at).toLocaleString("en-GB", { timeZone: "Europe/London" })}
                </p>
                {entry.changes.map((change) => (
                  <p key={`${entry.id}-${change.setting}`}>
                    {change.setting}: {change.oldValue} → {change.newValue}
                  </p>
                ))}
              </li>
            ))}
          </ol>
        )}
      </section>

      {validation.ok === false ? (
        <div className="rounded-xl border border-red-300/40 bg-red-500/10 px-3 py-2 text-sm text-red-100" role="alert">
          {validation.errors.map((item) => (
            <p key={item.field}>{item.message}</p>
          ))}
        </div>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-300/40 bg-red-500/10 px-3 py-2 text-sm text-red-100" role="alert">
          {error}
        </p>
      ) : null}

      <div className="sticky bottom-3 z-10 grid grid-cols-1 gap-2 rounded-2xl border border-white/10 bg-navy/90 p-3">
        <button
          type="button"
          disabled={!dirty || saving || !validation.ok}
          onClick={() => setConfirm("save")}
          className="min-h-12 rounded-xl bg-emerald px-4 text-sm font-semibold text-navy disabled:opacity-40"
        >
          Save Changes
        </button>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => setDraft(cloneSettings(saved))}
          className="min-h-12 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          Discard Changes
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setConfirm("restore")}
          className="min-h-12 rounded-xl px-4 text-sm font-semibold text-white/70"
        >
          Restore default pricing settings
        </button>
      </div>

      {confirm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pricing-confirm-title"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-navy p-4"
          >
            <h3 id="pricing-confirm-title" className="text-lg font-bold text-white">
              {confirm === "restore" ? "Restore default pricing settings" : "Confirm pricing changes"}
            </h3>
            <ul className="mt-3 max-h-64 space-y-2 overflow-auto text-sm text-white/80">
              {(confirm === "restore" ? restoreChanges : changes).map((change) => (
                <li key={change.setting}>
                  <span className="font-semibold text-white">{change.setting}</span>
                  <br />
                  {change.oldValue} → {change.newValue}
                </li>
              ))}
              {(confirm === "restore" ? restoreChanges : changes).length === 0 ? (
                <li>No pricing values will change.</li>
              ) : null}
            </ul>
            {confirm === "restore" ? (
              <p className="mt-3 text-xs text-white/55">
                Public 7 Seater availability stays {draft.minibus.publicEnabled ? "ON" : "OFF"}.
                Restoring defaults does not turn it on.
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="min-h-11 rounded-xl border border-white/20 text-sm font-semibold text-white"
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="min-h-11 rounded-xl bg-emerald text-sm font-semibold text-navy"
                disabled={saving}
                onClick={() => void persist(confirm === "restore" ? "restore" : "save")}
              >
                {confirm === "restore" ? "Restore" : "Save Pricing"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
