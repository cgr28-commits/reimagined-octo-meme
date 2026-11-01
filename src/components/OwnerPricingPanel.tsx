"use client";

import {
  DEFAULT_CHRISTMAS_PRICING,
  DEFAULT_EVENING_PRICING,
  parseMonthDayInput,
} from "../../shared/owner-pricing-config";

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
import { addLongDistanceTiers, LONG_DISTANCE_TIER_MILES } from "@/lib/long-distance-pricing";
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
import {
  DEFAULT_MINIBUS_MINIMUM_BOOKING_NOTICE_HOURS,
  MAX_MINIBUS_MINIMUM_BOOKING_NOTICE_HOURS,
  MIN_MINIBUS_MINIMUM_BOOKING_NOTICE_HOURS,
  parseMinibusMinimumBookingNoticeHoursInput,
} from "../../shared/booking-notice";
import {
  addUnavailablePeriod,
  deleteUnavailablePeriod,
  fetchBookingSettings,
  updateMinibusMinimumBookingNoticeHours,
  type UnavailablePeriodSummary,
} from "@/lib/short-notice-api";
import {
  diffProfitabilitySettings,
  fuelCostPerMileGbp,
  positioningChargeFromMilesGbp,
  positioningA2aChargeFromMilesGbp,
  isProfitabilityProtectionActive,
  normalizeProfitabilitySettings,
  validateProfitabilitySettings,
  type ProfitabilitySettings,
} from "@/lib/owner-profitability-settings";
import OwnerProfitabilityTester from "@/components/OwnerProfitabilityTester";

type PricingDraft = OwnerPricingSettings & { profitability: ProfitabilitySettings };

function asDraft(
  settings: OwnerPricingSettings & { profitability?: ProfitabilitySettings | null },
): PricingDraft {
  return {
    ...settings,
    bfsMinimumSaloonFareGbp: settings.bfsMinimumSaloonFareGbp ?? defaultOwnerPricingSettings().bfsMinimumSaloonFareGbp,
    bhdMinimumSaloonFareGbp: settings.bhdMinimumSaloonFareGbp ?? defaultOwnerPricingSettings().bhdMinimumSaloonFareGbp,
    saloonFormula: settings.saloonFormula ?? defaultOwnerPricingSettings().saloonFormula,
    profitability: normalizeProfitabilitySettings(settings.profitability),
    dublinAirportFareAdjustment: {
      rate: settings.dublinAirportFareAdjustment?.rate ?? 0,
    },
    executive: {
      requestQuote: settings.executive?.requestQuote === true,
      multiplier:
        settings.executive?.multiplier ?? defaultOwnerPricingSettings().executive.multiplier,
      publicEnabled: settings.executive?.publicEnabled !== false,
      minimumFareGbp:
        settings.executive?.minimumFareGbp ??
        defaultOwnerPricingSettings().executive.minimumFareGbp,
    },
  };
}

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

function formatDecimalText(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "" : String(value);
}

/**
 * Number box that keeps exactly what the owner is typing ("1.", "0.0", "")
 * until they leave the box. Converting to a number on every keystroke turned
 * "1." into "1", so a decimal point could never be typed.
 */
function DecimalInput({
  value,
  onValue,
  className,
  placeholder,
}: {
  value: number | null | undefined;
  /** null when the box is empty. */
  onValue: (next: number | null) => void;
  className: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => formatDecimalText(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(formatDecimalText(value));
  }, [value, focused]);
  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(formatDecimalText(value));
      }}
      onChange={(event) => {
        const next = event.target.value.trim();
        if (!/^\d*\.?\d*$/.test(next)) return;
        setText(next);
        onValue(next === "" || next === "." ? null : Number(next));
      }}
    />
  );
}

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
        <DecimalInput
          className={prefixedFieldClass}
          value={value}
          onValue={(next) => onChange(next ?? 0)}
        />
      </span>
    </label>
  );
}

function BfsMinimumField({
  value,
  onChange,
  label = "Belfast International Airport — Minimum Saloon Fare",
  help = "Per leg, to or from Belfast International. Before Estate supplement, discounts and airport access charges.",
}: {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  help?: string;
}) {
  const [text, setText] = useState(value.toFixed(2));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused && Number.isFinite(value)) setText(value.toFixed(2)); }, [value, focused]);
  return <label className={`${labelClass} mt-3`}>
    {label}
    <span className="relative mt-1 block">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/55" aria-hidden>£</span>
      <input className={prefixedFieldClass} type="text" inputMode="decimal" autoComplete="off"
        value={text} aria-invalid={!Number.isFinite(value) || value < 0 || value > 1000}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={(event) => {
          const next = event.target.value;
          if (!/^\d*\.?\d{0,2}$/.test(next)) return;
          setText(next);
          onChange(next.trim() && next !== "." ? Number(next) : Number.NaN);
        }} />
    </span>
    <span className="mt-2 block text-xs text-white/60">{help}</span>
  </label>;
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
        <DecimalInput
          className={percentFieldClass}
          value={value}
          onValue={(next) => onChange(next ?? 0)}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/55" aria-hidden>
          %
        </span>
      </span>
    </label>
  );
}

/** Digits and at most one decimal point, including a trailing "." while typing. */
function isMultiplierTyping(value: string): boolean {
  return value === "" || /^\d*\.?\d*$/.test(value);
}

/** A finished positive multiplier. "1." is still being typed and is not a number yet. */
function completePositiveMultiplier(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function withMinibusMultiplierText(draft: PricingDraft, text: string): PricingDraft {
  const parsed = completePositiveMultiplier(text);
  if (parsed == null || parsed === draft.minibus.multiplier) return draft;
  return { ...draft, minibus: { ...draft.minibus, multiplier: parsed } };
}

function withExecutiveMultiplierText(draft: PricingDraft, text: string): PricingDraft {
  const parsed = completePositiveMultiplier(text);
  const current = draft.executive?.multiplier;
  if (parsed == null || parsed === current) return draft;
  return { ...draft, executive: { ...draft.executive, multiplier: parsed } };
}

/** A finished non-negative money amount, including whole pounds while typing is finished. */
function completeNonNegativeMoney(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

function withExecutiveMinimumText(draft: PricingDraft, text: string): PricingDraft {
  const parsed = completeNonNegativeMoney(text);
  const current = draft.executive?.minimumFareGbp;
  if (parsed == null || parsed === current) return draft;
  return { ...draft, executive: { ...draft.executive, minimumFareGbp: parsed } };
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
  const [saved, setSaved] = useState<PricingDraft>(asDraft(defaultOwnerPricingSettings()));
  const [draft, setDraft] = useState<PricingDraft>(asDraft(defaultOwnerPricingSettings()));
  const [defaults, setDefaults] = useState<PricingDraft>(asDraft(defaultOwnerPricingSettings()));
  const [audit, setAudit] = useState<OwnerPricingAuditEntry[]>([]);
  const [loading, setLoading] = useState(!isolated);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"save" | "restore" | null>(null);
  /** Typed confirmation for the restore-defaults action, so it can't be pressed by mistake. */
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const restoreConfirmed = restoreConfirmText.trim().toUpperCase() === "RESTORE";
  const [multiplierText, setMultiplierText] = useState(() =>
    String(defaultOwnerPricingSettings().minibus.multiplier),
  );
  const [executiveMultiplierText, setExecutiveMultiplierText] = useState(() =>
    String(defaultOwnerPricingSettings().executive.multiplier),
  );
  const [executiveMinimumText, setExecutiveMinimumText] = useState(() =>
    defaultOwnerPricingSettings().executive.minimumFareGbp.toFixed(2),
  );
  const [mileageRateText, setMileageRateText] = useState(() =>
    defaultOwnerPricingSettings().saloonFormula!.ratePerMileGbp.toFixed(2),
  );
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [minibusNoticeDraft, setMinibusNoticeDraft] = useState(
    String(DEFAULT_MINIBUS_MINIMUM_BOOKING_NOTICE_HOURS),
  );
  const [minibusNoticeSaved, setMinibusNoticeSaved] = useState(
    DEFAULT_MINIBUS_MINIMUM_BOOKING_NOTICE_HOURS,
  );
  const [minibusBlocks, setMinibusBlocks] = useState<UnavailablePeriodSummary[]>([]);
  const [minibusNoticeSaving, setMinibusNoticeSaving] = useState(false);
  const [minibusNoticeMessage, setMinibusNoticeMessage] = useState("");
  const [minibusNoticeError, setMinibusNoticeError] = useState("");
  const [minibusBlock, setMinibusBlock] = useState({
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
  });
  const [executiveBlocks, setExecutiveBlocks] = useState<UnavailablePeriodSummary[]>([]);
  const [executiveBlockSaving, setExecutiveBlockSaving] = useState(false);
  const [executiveBlockMessage, setExecutiveBlockMessage] = useState("");
  const [executiveBlockError, setExecutiveBlockError] = useState("");
  const [executiveBlock, setExecutiveBlock] = useState({
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
  });

  const [formulaSupported, setFormulaSupported] = useState(isolated === true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOwnerPricing(ownerKey);
      setFormulaSupported(result.saloonFormulaEditorVersion === 1 || isolated === true);
      const loaded = asDraft(result.settings);
      setSaved(loaded);
      setDraft(loaded);
      setMileageRateText(loaded.saloonFormula!.ratePerMileGbp.toFixed(2));
      setMultiplierText(String(loaded.minibus.multiplier));
      setExecutiveMultiplierText(String(loaded.executive.multiplier));
      setExecutiveMinimumText(loaded.executive.minimumFareGbp.toFixed(2));
      setDefaults(asDraft(result.defaults));
      setAudit(result.audit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load pricing settings.");
    } finally {
      setLoading(false);
    }
  }, [ownerKey, isolated]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyMinibusAvailability = useCallback((periods: UnavailablePeriodSummary[], hours: number) => {
    setMinibusNoticeSaved(hours);
    setMinibusNoticeDraft(String(hours));
    setMinibusBlocks(periods.filter((period) => period.resource === "minibus"));
    setExecutiveBlocks(periods.filter((period) => period.resource === "executive"));
  }, []);

  useEffect(() => {
    if (isolated || !ownerKey) return;
    let cancelled = false;
    void fetchBookingSettings(ownerKey)
      .then((settings) => {
        if (cancelled) return;
        applyMinibusAvailability(
          settings.unavailablePeriods ?? [],
          settings.minibusMinimumBookingNoticeHours ?? DEFAULT_MINIBUS_MINIMUM_BOOKING_NOTICE_HOURS,
        );
      })
      .catch(() => {
        if (!cancelled) setMinibusNoticeError("Could not load 7-Seater availability settings.");
      });
    return () => {
      cancelled = true;
    };
  }, [applyMinibusAvailability, isolated, ownerKey]);

  async function saveMinibusNoticeHours() {
    setMinibusNoticeSaving(true);
    setMinibusNoticeMessage("");
    setMinibusNoticeError("");
    try {
      const parsed = parseMinibusMinimumBookingNoticeHoursInput(minibusNoticeDraft);
      if (parsed == null) {
        throw new Error(
          `Enter a whole number of hours between ${MIN_MINIBUS_MINIMUM_BOOKING_NOTICE_HOURS} and ${MAX_MINIBUS_MINIMUM_BOOKING_NOTICE_HOURS}.`,
        );
      }
      if (isolatedPreview) {
        setMinibusNoticeSaved(parsed);
        setMinibusNoticeMessage("Preview only — 7-Seater notice was not saved to live settings.");
        return;
      }
      const settings = await updateMinibusMinimumBookingNoticeHours(ownerKey, parsed);
      applyMinibusAvailability(
        settings.unavailablePeriods ?? [],
        settings.minibusMinimumBookingNoticeHours ?? parsed,
      );
      setMinibusNoticeMessage(`7-Seater minimum booking notice saved: ${parsed} hours.`);
    } catch (err) {
      setMinibusNoticeError(
        err instanceof Error ? err.message : "Could not save 7-Seater minimum booking notice",
      );
    } finally {
      setMinibusNoticeSaving(false);
    }
  }

  async function saveMinibusBlock() {
    setMinibusNoticeSaving(true);
    setMinibusNoticeMessage("");
    setMinibusNoticeError("");
    try {
      if (!minibusBlock.startDate || !minibusBlock.startTime || !minibusBlock.endDate || !minibusBlock.endTime) {
        throw new Error("Choose a start and end date and time for the 7-Seater block.");
      }
      if (isolatedPreview) {
        setMinibusNoticeMessage("Preview only — 7-Seater block was not saved.");
        return;
      }
      const settings = await addUnavailablePeriod(ownerKey, {
        ...minibusBlock,
        mode: "no_availability",
        resource: "minibus",
        note: "7-Seater unavailable",
      });
      applyMinibusAvailability(
        settings.unavailablePeriods ?? [],
        settings.minibusMinimumBookingNoticeHours ?? minibusNoticeSaved,
      );
      setMinibusBlock({ startDate: "", startTime: "", endDate: "", endTime: "" });
      setMinibusNoticeMessage("7-Seater blocked for that period. Saloon and Estate stay available. Executive keeps its own diary.");
    } catch (err) {
      setMinibusNoticeError(err instanceof Error ? err.message : "Could not block the 7-Seater");
    } finally {
      setMinibusNoticeSaving(false);
    }
  }

  async function removeMinibusBlock(id: string) {
    setMinibusNoticeSaving(true);
    setMinibusNoticeMessage("");
    setMinibusNoticeError("");
    try {
      if (isolatedPreview) return;
      const settings = await deleteUnavailablePeriod(ownerKey, id);
      applyMinibusAvailability(
        settings.unavailablePeriods ?? [],
        settings.minibusMinimumBookingNoticeHours ?? minibusNoticeSaved,
      );
      setMinibusNoticeMessage("7-Seater block removed.");
    } catch (err) {
      setMinibusNoticeError(err instanceof Error ? err.message : "Could not remove the 7-Seater block");
    } finally {
      setMinibusNoticeSaving(false);
    }
  }

  async function saveExecutiveBlock() {
    setExecutiveBlockSaving(true);
    setExecutiveBlockMessage("");
    setExecutiveBlockError("");
    try {
      if (!executiveBlock.startDate || !executiveBlock.startTime || !executiveBlock.endDate || !executiveBlock.endTime) {
        throw new Error("Choose a start and end date and time for the Executive block.");
      }
      if (isolatedPreview) {
        setExecutiveBlockMessage("Preview only — Executive block was not saved.");
        return;
      }
      const settings = await addUnavailablePeriod(ownerKey, {
        ...executiveBlock,
        mode: "no_availability",
        resource: "executive",
        note: "Executive unavailable",
      });
      applyMinibusAvailability(
        settings.unavailablePeriods ?? [],
        settings.minibusMinimumBookingNoticeHours ?? minibusNoticeSaved,
      );
      setExecutiveBlock({ startDate: "", startTime: "", endDate: "", endTime: "" });
      setExecutiveBlockMessage(
        "Executive blocked for that period. Saloon, Estate and the 7-Seater stay on their own diaries.",
      );
    } catch (err) {
      setExecutiveBlockError(err instanceof Error ? err.message : "Could not block Executive");
    } finally {
      setExecutiveBlockSaving(false);
    }
  }

  async function removeExecutiveBlock(id: string) {
    setExecutiveBlockSaving(true);
    setExecutiveBlockMessage("");
    setExecutiveBlockError("");
    try {
      if (isolatedPreview) return;
      const settings = await deleteUnavailablePeriod(ownerKey, id);
      applyMinibusAvailability(
        settings.unavailablePeriods ?? [],
        settings.minibusMinimumBookingNoticeHours ?? minibusNoticeSaved,
      );
      setExecutiveBlockMessage("Executive block removed.");
    } catch (err) {
      setExecutiveBlockError(err instanceof Error ? err.message : "Could not remove the Executive block");
    } finally {
      setExecutiveBlockSaving(false);
    }
  }

  const editingDraft = useMemo(
    () =>
      withExecutiveMinimumText(
        withExecutiveMultiplierText(
          withMinibusMultiplierText(draft, multiplierText),
          executiveMultiplierText,
        ),
        executiveMinimumText,
      ),
    [draft, multiplierText, executiveMultiplierText, executiveMinimumText],
  );
  const dirty = useMemo(
    () => !settingsEqual(saved, editingDraft)
      || mileageRateText !== saved.saloonFormula!.ratePerMileGbp.toFixed(2),
    [saved, editingDraft, mileageRateText],
  );
  const validation = useMemo(() => {
    const base = validateOwnerPricingInput(editingDraft);
    const profit = validateProfitabilitySettings(editingDraft.profitability);
    const mileageError = completeNonNegativeMoney(mileageRateText) == null
      ? [{ field: "saloonFormula.ratePerMileGbp", message: "Enter a complete mileage rate with up to two decimal places." }]
      : [];
    const minimumError =
      completeNonNegativeMoney(executiveMinimumText) == null
        ? [
            {
              field: "executive.minimumFareGbp",
              message: "Business Class minimum fare must be £0.00 or more, up to £2,000.00.",
            },
          ]
        : [];
    if (base.ok && profit.ok && minimumError.length === 0 && mileageError.length === 0) return { ok: true as const, errors: [] };
    return {
      ok: false as const,
      errors: [
        ...minimumError,
        ...mileageError,
        ...(base.ok ? [] : base.errors),
        ...(profit.ok ? [] : profit.errors),
      ],
    };
  }, [editingDraft, executiveMinimumText, mileageRateText]);
  const changes = useMemo(
    () => [
      ...diffOwnerPricingSettings(saved, editingDraft),
      ...diffProfitabilitySettings(saved.profitability, editingDraft.profitability),
    ],
    [saved, editingDraft],
  );
  const restoreChanges = useMemo(() => {
    const restored = {
      ...defaults,
      minibus: { ...defaults.minibus, publicEnabled: draft.minibus.publicEnabled, requestQuote: draft.minibus.requestQuote === true },
      executive: { ...defaults.executive, publicEnabled: draft.executive.publicEnabled, requestQuote: draft.executive.requestQuote === true },
    };
    return [
      ...diffOwnerPricingSettings(draft, restored),
      ...diffProfitabilitySettings(draft.profitability, restored.profitability),
    ];
  }, [defaults, draft]);
  const preview = useMemo(
    () => previewVehicleFaresFromSaloon(50, editingDraft),
    [editingDraft],
  );
  const evening = draft.evening ?? DEFAULT_EVENING_PRICING;
  const christmas = draft.christmas ?? DEFAULT_CHRISTMAS_PRICING;
  /** Stored as MM-DD; shown and typed as DD/MM. */
  const dayMonth = (monthDay: string) => /^\d{2}-\d{2}$/.test(monthDay) ? `${monthDay.slice(3)}/${monthDay.slice(0, 2)}` : monthDay;
  const nightOnHundred = previewSurchargeOnBase(100, draft.night.surchargeRate);
  const nightOnMinibus = previewSurchargeOnBase(preview.minibusQuotedGbp, draft.night.surchargeRate);
  const weekendDays = draft.weekend.days.includes(6) && draft.weekend.days.includes(0)
    ? "Saturday and Sunday, all day (Europe/London)"
    : `Days ${draft.weekend.days.join(", ")}`;
  const isolatedPreview = isolated || isBrowserPricingPreview();

  const update = <K extends keyof PricingDraft>(key: K, value: PricingDraft[K]) => {
    setSaveNotice(null);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const persist = async (mode: "save" | "restore") => {
    if (mode === "save" && !validation.ok) return;
    setSaving(true);
    setError(null);
    try {
      const toSave = withExecutiveMinimumText(
        withExecutiveMultiplierText(
          withMinibusMultiplierText(draft, multiplierText),
          executiveMultiplierText,
        ),
        executiveMinimumText,
      );
      const result =
        mode === "restore"
          ? await restoreOwnerPricingDefaults(ownerKey, saved.version)
          : await saveOwnerPricing(ownerKey, toSave, saved.version);
      const stored = asDraft(result.settings);
      setSaved(stored);
      setDraft(stored);
      setMileageRateText(stored.saloonFormula!.ratePerMileGbp.toFixed(2));
      setMultiplierText(String(stored.minibus.multiplier));
      setExecutiveMultiplierText(String(stored.executive.multiplier));
      setExecutiveMinimumText(stored.executive.minimumFareGbp.toFixed(2));
      setDefaults(asDraft(result.defaults));
      setAudit(result.audit);
      setConfirm(null);
      setSaveNotice(
        mode === "restore"
          ? `Default pricing restored. Business Class minimum fare is £${stored.executive.minimumFareGbp.toFixed(2)}.`
          : `Saved. Business Class minimum fare is £${stored.executive.minimumFareGbp.toFixed(2)}. New quotes use this amount.`,
      );
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
            <fieldset disabled={!formulaSupported} className="mt-3 space-y-3">
              <label className={labelClass}>
                <input type="checkbox" checked={draft.saloonFormula?.enabled === true}
                  onChange={(event) => update("saloonFormula", { ...draft.saloonFormula!, enabled: event.target.checked })} />
                Use mileage formula for new quotes
              </label>
              <p className="text-sm text-white/60">OFF keeps existing tiers and postcode fares. ON uses the formula instead of tiers, postcode fares and profitability floors. Saved rules are retained.</p>
              <MoneyField label="Starting charge" value={draft.saloonFormula!.startingChargeGbp}
                onChange={(startingChargeGbp) => update("saloonFormula", { ...draft.saloonFormula!, startingChargeGbp })} />
              <label className={`${labelClass} mt-3`}>
                Price per passenger road mile
                <span className="relative mt-1 block">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/55" aria-hidden>£</span>
                  <input
                    className={prefixedFieldClass}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    enterKeyHint="done"
                    aria-invalid={validation.errors.some((item) => item.field === "saloonFormula.ratePerMileGbp")}
                    value={mileageRateText}
                    onChange={(event) => {
                      const text = event.target.value;
                      // Keep intermediate text (especially "2.") instead of coercing each keystroke.
                      if (!/^\d*\.?\d{0,2}$/.test(text)) return;
                      setMileageRateText(text);
                      setSaveNotice(null);
                      const rate = completeNonNegativeMoney(text);
                      if (rate != null) update("saloonFormula", { ...draft.saloonFormula!, ratePerMileGbp: rate });
                    }}
                    onBlur={() => {
                      const rate = completeNonNegativeMoney(mileageRateText);
                      if (rate != null) setMileageRateText(rate.toFixed(2));
                    }}
                  />
                </span>
              </label>
              <MoneyField label="Formula minimum fare" value={draft.saloonFormula!.minimumFareGbp}
                onChange={(minimumFareGbp) => update("saloonFormula", { ...draft.saloonFormula!, minimumFareGbp })} />
              {!formulaSupported && <p className="text-sm text-white/60">The Worker must support formula settings before they can be edited.</p>}
            </fieldset>
            <BfsMinimumField value={draft.bfsMinimumSaloonFareGbp!} onChange={(value) => update("bfsMinimumSaloonFareGbp", value)} />
            <BfsMinimumField
              value={draft.bhdMinimumSaloonFareGbp ?? 0}
              onChange={(value) => update("bhdMinimumSaloonFareGbp", value)}
              label="Belfast City Airport — Minimum Saloon Fare"
              help="Per leg, to or from Belfast City Airport. £0 means no minimum. Before Estate supplement, discounts and airport access charges."
            />
            <MoneyField
              label="Tier minimum fare (formula OFF)"
              value={draft.saloon.minimumFareGbp}
              onChange={(minimumFareGbp) => update("saloon", { ...draft.saloon, minimumFareGbp })}
            />
            <label className={`${labelClass} mt-3`}>
              Floor distance (miles)
              <DecimalInput
                className={fieldClass}
                value={draft.saloon.floorMiles}
                onValue={(next) => update("saloon", { ...draft.saloon, floorMiles: next ?? 0 })}
              />
            </label>
            <div className="mt-4 rounded-xl border border-emerald/30 bg-emerald/5 p-3">
              <p className="text-sm font-semibold text-white">Long-distance pricing</p>
              <p className="mt-2 text-sm text-white/70">
                Add adjustable fares at 125, 150, 200, 250 and 300 miles for longer journeys.
                Starting values follow your current mileage curve. Raise the fares you want,
                then review and save. Your profitability protection stays in place.
              </p>
              <button
                type="button"
                data-add-long-distance-tiers
                disabled={loading || saving || LONG_DISTANCE_TIER_MILES.every(miles =>
                  draft.saloon.knots.some(knot => knot.miles === miles))}
                onClick={() => {
                  try {
                    update("saloon", addLongDistanceTiers(draft.saloon));
                    setError(null);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not add mileage tiers.");
                  }
                }}
                className="mt-3 min-h-12 w-full rounded-xl bg-emerald px-3 py-2 text-sm font-semibold text-navy disabled:opacity-40"
              >
                {LONG_DISTANCE_TIER_MILES.every(miles => draft.saloon.knots.some(knot => knot.miles === miles))
                  ? "Long-distance tiers added" : "Add 125–300 mile tiers"}
              </button>
              <p className="mt-2 text-xs text-white/60">
                Fares between tiers increase smoothly. Beyond your final tier, its per-mile increase continues.
              </p>
            </div>
            <p className="mt-3 text-xs text-white/55">Current Saloon distance rates</p>
            <div className="mt-2 space-y-3">
              {draft.saloon.knots.map((knot, index) => (
                <div key={index} className="min-w-0" data-mileage-tier={knot.miles}>
                  <p className="text-sm font-medium text-white/80">{knotLabel(index, draft.saloon.knots)}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={labelClass}>
                      Miles
                      <DecimalInput
                        className={fieldClass}
                        value={knot.miles}
                        onValue={(next) => {
                          const knots = draft.saloon.knots.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, miles: next ?? 0 } : row,
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
            <p className="text-lg font-semibold text-white">Profitability protection</p>
            <p
              className={`mt-2 rounded-xl px-3 py-2 text-sm font-semibold ${
                isProfitabilityProtectionActive(draft.profitability)
                  ? "bg-emerald/20 text-emerald"
                  : "bg-amber-300/10 text-amber-100"
              }`}
            >
              {isProfitabilityProtectionActive(draft.profitability)
                ? "PROFITABILITY PROTECTION ACTIVE"
                : "PROFITABILITY PROTECTION NOT ACTIVE — VEHICLE MPG REQUIRED"}
            </p>
            <p className="mt-2 text-xs text-white/55">
              The £{draft.saloon.minimumFareGbp.toFixed(2)} Saloon curve floor above stays as it is.
              The minimum here is a separate all-distance Saloon protection and applies only after a
              vehicle MPG is saved.
            </p>
            <MoneyField
              label="Target earnings after direct costs (£/hour)"
              value={draft.profitability.targetHourlyEarningsGbp}
              onChange={(targetHourlyEarningsGbp) =>
                update("profitability", { ...draft.profitability, targetHourlyEarningsGbp })
              }
            />
            <MoneyField
              label="Minimum Saloon one-way fare"
              value={draft.profitability.minimumSaloonOneWayGbp}
              onChange={(minimumSaloonOneWayGbp) =>
                update("profitability", { ...draft.profitability, minimumSaloonOneWayGbp })
              }
            />
            <MoneyField
              label="Diesel price (£/litre)"
              value={draft.profitability.dieselPricePerLitreGbp}
              onChange={(dieselPricePerLitreGbp) =>
                update("profitability", { ...draft.profitability, dieselPricePerLitreGbp })
              }
            />
            <label className={`${labelClass} mt-3`}>
              Vehicle MPG
              <DecimalInput
                className={fieldClass}
                placeholder="Not set"
                value={draft.profitability.vehicleMpg}
                onValue={(next) =>
                  update("profitability", { ...draft.profitability, vehicleMpg: next })
                }
              />
            </label>
            <MoneyField
              label="Vehicle wear and maintenance (£/mile)"
              value={draft.profitability.wearAllowancePerMileGbp}
              onChange={(wearAllowancePerMileGbp) =>
                update("profitability", { ...draft.profitability, wearAllowancePerMileGbp })
              }
            />
            <p className="mt-3 text-sm text-white/80">
              Fuel cost per mile{" "}
              <span className="font-semibold text-white">
                {(() => {
                  const fuel = fuelCostPerMileGbp(
                    draft.profitability.dieselPricePerLitreGbp,
                    draft.profitability.vehicleMpg,
                  );
                  return fuel == null ? "Set vehicle MPG to calculate" : `£${fuel.toFixed(4)}`;
                })()}
              </span>
            </p>
          </div>

          <div>
            <p className="text-lg font-semibold text-white">Drive-to-pickup charge</p>
            <p className="mt-1 text-sm text-white/70">
              Adds a charge for the road miles between your base and the customer&apos;s address,
              beyond the free miles, to each leg of an airport transfer. It is included in the
              journey fare (Night &amp; Weekend surcharge and the return discount apply as normal)
              and is never shown as a separate line. Address-to-address and airport-to-airport
              journeys are not affected. Works whether or not vehicle MPG is set.
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-sm text-white/80">Charge for the drive to the pickup</p>
              <Toggle
                id="positioning-charge-enabled"
                label="Charge for the drive to the pickup"
                checked={draft.profitability.positioningChargeEnabled}
                onChange={(positioningChargeEnabled) =>
                  update("profitability", { ...draft.profitability, positioningChargeEnabled })
                }
              />
            </div>
            <label className={`${labelClass} mt-3`}>
              Free miles from your base
              <DecimalInput
                className={fieldClass}
                value={draft.profitability.positioningFreeMiles}
                onValue={(next) =>
                  update("profitability", { ...draft.profitability, positioningFreeMiles: next ?? 0 })
                }
              />
            </label>
            <MoneyField
              label="Charge per mile beyond the free miles (£/mile)"
              value={draft.profitability.positioningRatePerMileGbp}
              onChange={(positioningRatePerMileGbp) =>
                update("profitability", { ...draft.profitability, positioningRatePerMileGbp })
              }
            />
            <p className="mt-2 text-xs text-white/55">
              Example: {draft.profitability.positioningFreeMiles} free miles at £
              {draft.profitability.positioningRatePerMileGbp.toFixed(2)}/mile — an address 10 road
              miles from base adds £
              {positioningChargeFromMilesGbp(10, { ...draft.profitability, positioningChargeEnabled: true })}
              {" "}per leg. Rounded to whole pounds. Use the Profitability tester to check a real address.
            </p>
          </div>

          <div>
            <p className="text-lg font-semibold text-white">Address-to-address drive charge</p>
            <p className="mt-1 text-sm text-white/70">
              For journeys with no airport (e.g. Belfast to Glenarm). Charges for the road miles from
              your base to whichever end of the journey is further away, beyond the free miles, so the
              price is the same whichever way round it is booked. Included in the journey fare and never
              shown as a separate line. Separate from the airport setting above.
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-sm text-white/80">Charge on address-to-address jobs</p>
              <Toggle
                id="positioning-a2a-enabled"
                label="Charge on address-to-address jobs"
                checked={draft.profitability.positioningA2aEnabled}
                onChange={(positioningA2aEnabled) =>
                  update("profitability", { ...draft.profitability, positioningA2aEnabled })
                }
              />
            </div>
            <label className={`${labelClass} mt-3`}>
              Free miles from your base
              <DecimalInput
                className={fieldClass}
                value={draft.profitability.positioningA2aFreeMiles}
                onValue={(next) =>
                  update("profitability", { ...draft.profitability, positioningA2aFreeMiles: next ?? 0 })
                }
              />
            </label>
            <MoneyField
              label="Charge per mile beyond the free miles (£/mile)"
              value={draft.profitability.positioningA2aRatePerMileGbp}
              onChange={(positioningA2aRatePerMileGbp) =>
                update("profitability", { ...draft.profitability, positioningA2aRatePerMileGbp })
              }
            />
            <p className="mt-2 text-xs text-white/55">
              Example: {draft.profitability.positioningA2aFreeMiles} free miles at £
              {draft.profitability.positioningA2aRatePerMileGbp.toFixed(2)}/mile — a journey whose far
              end is 29 road miles from base (e.g. Glenarm) adds £
              {positioningA2aChargeFromMilesGbp(29, { ...draft.profitability, positioningA2aEnabled: true })}
              {" "}per leg. Rounded to whole pounds.
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
            <label className={`${labelClass} mt-3`} htmlFor="minibus-quote-mode">
              7-Seater quote mode
              <select
                id="minibus-quote-mode"
                className={fieldClass}
                value={draft.minibus.requestQuote ? "personal" : "instant"}
                onChange={(event) => update("minibus", { ...draft.minibus, requestQuote: event.target.value === "personal" })}
              >
                <option value="instant">Instant price</option>
                <option value="personal">Request a personal quote</option>
              </select>
            </label>
            <p className="mt-1 text-xs text-white/55">
              Personal quote keeps the 7-Seater visible when offered online. Customers send their
              journey details; you set the fare and send a payment link from A2A Quotes.
              Save pricing settings below to apply this choice.
            </p>
            <label className={`${labelClass} mt-3`}>
              Pricing: Estate fare ×
              <input
                className={fieldClass}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                value={multiplierText}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isMultiplierTyping(next)) setMultiplierText(next);
                }}
                onBlur={() => {
                  const parsed = completePositiveMultiplier(multiplierText);
                  if (parsed == null) {
                    setMultiplierText(String(draft.minibus.multiplier));
                    return;
                  }
                  if (parsed !== draft.minibus.multiplier) {
                    update("minibus", { ...draft.minibus, multiplier: parsed });
                  }
                  setMultiplierText(String(parsed));
                }}
              />
            </label>
            <p className="mt-1 text-xs text-white/55">
              Estate × {editingDraft.minibus.multiplier.toFixed(2)}, nearest penny only. Not
              rounded to the nearest £5.
            </p>
            <div className="mt-4 rounded-xl border border-white/10 bg-navy/40 p-3" data-minibus-notice-setting>
              <label className={labelClass} htmlFor="minibus-minimum-booking-notice">
                7-Seater minimum booking notice
                <input
                  id="minibus-minimum-booking-notice"
                  className={fieldClass}
                  type="number"
                  inputMode="numeric"
                  min={MIN_MINIBUS_MINIMUM_BOOKING_NOTICE_HOURS}
                  max={MAX_MINIBUS_MINIMUM_BOOKING_NOTICE_HOURS}
                  step={1}
                  value={minibusNoticeDraft}
                  onChange={(event) => setMinibusNoticeDraft(event.target.value)}
                  aria-describedby="minibus-notice-help"
                />
              </label>
              <p id="minibus-notice-help" className="mt-1 text-xs text-white/55">
                Bookings inside this period require confirmation before payment. This is separate
                from the Saloon and Estate short-notice period. Executive has its own availability. Current value:{" "}
                {minibusNoticeSaved} hours.
              </p>
              <button
                type="button"
                disabled={minibusNoticeSaving}
                onClick={() => void saveMinibusNoticeHours()}
                className="mt-3 min-h-11 rounded-xl bg-emerald px-4 py-2 text-sm font-bold text-navy disabled:opacity-60"
              >
                {minibusNoticeSaving ? "Saving…" : "Save 7-Seater notice"}
              </button>
              <div className="mt-4 border-t border-white/10 pt-3">
                <p className="text-sm font-medium text-white">Block 7-Seater only</p>
                <p className="mt-1 text-xs text-white/55">
                  Makes the 7-Seater unavailable for these times. Saloon and Estate stay on the normal
                  diary. Executive availability is separate.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className={labelClass}>
                    From date
                    <input
                      className={fieldClass}
                      type="date"
                      value={minibusBlock.startDate}
                      onChange={(event) =>
                        setMinibusBlock((current) => ({ ...current, startDate: event.target.value }))
                      }
                    />
                  </label>
                  <label className={labelClass}>
                    From time
                    <input
                      className={fieldClass}
                      type="time"
                      value={minibusBlock.startTime}
                      onChange={(event) =>
                        setMinibusBlock((current) => ({ ...current, startTime: event.target.value }))
                      }
                    />
                  </label>
                  <label className={labelClass}>
                    Until date
                    <input
                      className={fieldClass}
                      type="date"
                      value={minibusBlock.endDate}
                      onChange={(event) =>
                        setMinibusBlock((current) => ({ ...current, endDate: event.target.value }))
                      }
                    />
                  </label>
                  <label className={labelClass}>
                    Until time
                    <input
                      className={fieldClass}
                      type="time"
                      value={minibusBlock.endTime}
                      onChange={(event) =>
                        setMinibusBlock((current) => ({ ...current, endTime: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={minibusNoticeSaving}
                  onClick={() => void saveMinibusBlock()}
                  className="mt-3 min-h-11 rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Block 7-Seater
                </button>
                {minibusBlocks.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-sm text-white/80">
                    {minibusBlocks.map((period) => (
                      <li key={period.id} className="flex items-center justify-between gap-2">
                        <span>
                          {period.startLocal.replace("T", " ")} – {period.endLocal.replace("T", " ")}
                        </span>
                        <button
                          type="button"
                          className="text-xs font-semibold text-amber-200 underline-offset-2 hover:underline"
                          onClick={() => void removeMinibusBlock(period.id)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-white/45">No 7-Seater blocks saved.</p>
                )}
              </div>
              {minibusNoticeMessage ? (
                <p className="mt-2 text-sm text-emerald" role="status">
                  {minibusNoticeMessage}
                </p>
              ) : null}
              {minibusNoticeError ? (
                <p className="mt-2 text-sm text-red-200" role="alert">
                  {minibusNoticeError}
                </p>
              ) : null}
            </div>
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
          Evening / Night / Weekend / Bank Holiday
        </h3>
        <div className="mt-3" data-christmas-pricing>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-white/70">Christmas pricing enabled</p>
            <Toggle id="christmas-enabled" label="Christmas pricing enabled" checked={christmas.enabled}
              onChange={(enabled) => update("christmas", { ...christmas, enabled })} />
          </div>
          <PercentField label="Christmas surcharge" value={Math.round(christmas.surchargeRate * 1000) / 10}
            onChange={(value) => update("christmas", { ...christmas, surchargeRate: value / 100 })} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["startMonthDay", "endMonthDay"] as const).map((field) => (
              <label key={field} className={labelClass}>
                {field === "startMonthDay" ? "Christmas starts (day/month)" : "Christmas ends (day/month)"}
                <input className={fieldClass} type="text" inputMode="numeric" placeholder={field === "startMonthDay" ? "14/12" : "31/12"}
                  value={dayMonth(christmas[field])}
                  onChange={(event) => update("christmas", { ...christmas, [field]: parseMonthDayInput(event.target.value) ?? event.target.value })} />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/55">Applies every year to pickups between these dates (inclusive, Europe/London). The highest applicable Christmas, Evening, Night or Weekend percentage applies once per leg.</p>
        </div>
        <div className="mt-4" data-evening-pricing>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-white/70">Evening pricing enabled</p>
            <Toggle id="evening-enabled" label="Evening pricing enabled" checked={evening.enabled}
              onChange={(enabled) => update("evening", { ...evening, enabled })} />
          </div>
          <PercentField label="Evening surcharge" value={Math.round(evening.surchargeRate * 1000) / 10}
            onChange={(value) => update("evening", { ...evening, surchargeRate: value / 100 })} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["startMinutes", "endMinutes"] as const).map((field) => (
              <label key={field} className={labelClass}>
                {field === "startMinutes" ? "Evening starts" : "Evening ends"}
                <input className={fieldClass} type="time" value={formatMinutesAsTime(evening[field])}
                  onChange={(event) => {
                    const [hours, minutes] = event.target.value.split(":").map(Number);
                    update("evening", { ...evening, [field]: hours * 60 + minutes });
                  }} />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/55">Disabled by default. Times use Europe/London; the highest applicable Evening, Night or Weekend percentage applies once per leg.</p>
        </div>
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
          Night hours apply every day; overlapping Weekend pricing uses the higher rate. Current window: {formatMinutesAsTime(draft.night.startMinutes)}{" "}
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

      <section className="rounded-2xl border border-white/10 bg-navy/50 p-4" data-executive-multiplier>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald">Business Class</h3>
        <p className="mt-2 text-sm text-white/70">
          Executive fare = Saloon journey fare × multiplier, nearest penny. Change 1.40, 1.50, 1.75
          or 2.00 here without a code change. When Executive is on and available, customers can
          select it for an instant price or request a personal quote, depending on the mode below. Airport Executive pickups include Meet &amp; Greet, a
          personalised name board, luggage assistance, barrier and parking, bottled water and phone
          charging. Executive availability is separate from Saloon, Estate and the 7-Seater.
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-white/80">Offer Executive online</p>
          <Toggle
            id="public-executive-enabled"
            label="Offer Executive online"
            checked={draft.executive.publicEnabled !== false}
            onChange={(publicEnabled) =>
              update("executive", { ...draft.executive, publicEnabled })
            }
          />
        </div>
        <label className={`${labelClass} mt-3`} htmlFor="business-class-quote-mode">
          Business Class quote mode
          <select
            id="business-class-quote-mode"
            className={fieldClass}
            value={draft.executive.requestQuote ? "personal" : "instant"}
            onChange={(event) => update("executive", { ...draft.executive, requestQuote: event.target.value === "personal" })}
          >
            <option value="instant">Instant price</option>
            <option value="personal">Request a personal quote</option>
          </select>
        </label>
        <p className="mt-1 text-xs text-white/55">
          Business Class stays visible for 1–3 passengers with up to 2 large suitcases.
          Request mode sends the journey details to A2A Quotes for your price and payment link.
          Saloon, Estate and the 7-Seater keep their own booking modes. Save pricing settings below.
        </p>
        <label className={`${labelClass} mt-3`}>
          Pricing: Saloon fare ×
          <input
            className={fieldClass}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            value={executiveMultiplierText}
            onChange={(event) => {
              const next = event.target.value;
              if (isMultiplierTyping(next)) setExecutiveMultiplierText(next);
            }}
            onBlur={() => {
              const parsed = completePositiveMultiplier(executiveMultiplierText);
              if (parsed == null) {
                setExecutiveMultiplierText(String(draft.executive.multiplier));
                return;
              }
              if (parsed !== draft.executive.multiplier) {
                update("executive", { ...draft.executive, multiplier: parsed });
              }
              setExecutiveMultiplierText(String(parsed));
            }}
          />
        </label>
        <p className="mt-1 text-xs text-white/55">
          Saloon × {editingDraft.executive.multiplier.toFixed(2)}. A £{preview.saloonGbp} Saloon fare
          is £{preview.executiveGbp.toFixed(2)} Executive before Night and Weekend.
        </p>
        <label className={`${labelClass} mt-3`} data-business-class-minimum>
          Business Class Minimum Fare (£)
          <span className="relative mt-1 block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/55" aria-hidden>
              £
            </span>
            <input
              className={prefixedFieldClass}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              aria-label="Business Class Minimum Fare (£)"
              value={executiveMinimumText}
              onChange={(event) => {
                const next = event.target.value;
                if (next === "" || /^\d*\.?\d{0,2}$/.test(next)) {
                  setSaveNotice(null);
                  setExecutiveMinimumText(next);
                }
              }}
              onBlur={() => {
                const parsed = completeNonNegativeMoney(executiveMinimumText);
                if (parsed == null) {
                  setExecutiveMinimumText(draft.executive.minimumFareGbp.toFixed(2));
                  return;
                }
                if (parsed !== draft.executive.minimumFareGbp) {
                  update("executive", { ...draft.executive, minimumFareGbp: parsed });
                }
                setExecutiveMinimumText(parsed.toFixed(2));
              }}
            />
          </span>
        </label>
        <p className="mt-1 text-xs text-white/55">
          One-way Business Class fare is at least £{editingDraft.executive.minimumFareGbp.toFixed(2)},
          including airport access. Fares already above this stay as calculated. Change it here
          without a code change.
        </p>
        <div className="mt-4 border-t border-white/10 pt-3" data-executive-availability>
          <p className="text-sm font-medium text-white">Block Executive only</p>
          <p className="mt-1 text-xs text-white/55">
            Makes Executive unavailable for these times. Saloon, Estate and the 7-Seater stay available.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className={labelClass}>
              From date
              <input
                className={fieldClass}
                type="date"
                value={executiveBlock.startDate}
                onChange={(event) =>
                  setExecutiveBlock((current) => ({ ...current, startDate: event.target.value }))
                }
              />
            </label>
            <label className={labelClass}>
              From time
              <input
                className={fieldClass}
                type="time"
                value={executiveBlock.startTime}
                onChange={(event) =>
                  setExecutiveBlock((current) => ({ ...current, startTime: event.target.value }))
                }
              />
            </label>
            <label className={labelClass}>
              Until date
              <input
                className={fieldClass}
                type="date"
                value={executiveBlock.endDate}
                onChange={(event) =>
                  setExecutiveBlock((current) => ({ ...current, endDate: event.target.value }))
                }
              />
            </label>
            <label className={labelClass}>
              Until time
              <input
                className={fieldClass}
                type="time"
                value={executiveBlock.endTime}
                onChange={(event) =>
                  setExecutiveBlock((current) => ({ ...current, endTime: event.target.value }))
                }
              />
            </label>
          </div>
          <button
            type="button"
            disabled={executiveBlockSaving}
            onClick={() => void saveExecutiveBlock()}
            className="mt-3 min-h-11 rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Block Executive
          </button>
          {executiveBlocks.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              {executiveBlocks.map((period) => (
                <li key={period.id} className="flex items-center justify-between gap-2">
                  <span>
                    {period.startLocal.replace("T", " ")} – {period.endLocal.replace("T", " ")}
                  </span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-amber-200 underline-offset-2 hover:underline"
                    onClick={() => void removeExecutiveBlock(period.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-white/45">No Executive blocks saved.</p>
          )}
          {executiveBlockMessage ? (
            <p className="mt-2 text-sm text-emerald" role="status">
              {executiveBlockMessage}
            </p>
          ) : null}
          {executiveBlockError ? (
            <p className="mt-2 text-sm text-red-200" role="alert">
              {executiveBlockError}
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-navy/50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald">
          Airport / fixed charges
        </h3>
        <div data-dublin-fare-adjustment>
          <PercentField
            label="Dublin Airport Fare Adjustment (%)"
            value={Math.round((draft.dublinAirportFareAdjustment?.rate ?? 0) * 1000) / 10}
            onChange={(value) => update("dublinAirportFareAdjustment", { rate: value / 100 })}
          />
          <p className="mt-1 text-xs text-white/55">
            Increases the journey fare for transfers to and from Dublin Airport. Tolls, parking,
            airport access fees and optional extras stay the same. The 5% return discount is
            calculated on the adjusted journey fare. 0% keeps current fares.
          </p>
        </div>
        <p className="mt-3 text-xs text-white/55">
          Fixed airport charges below stay display-only. Meet &amp; Greet pickup fees can be changed
          here and apply to new email offers.
        </p>
        <div className="mt-4 space-y-3" data-meet-greet-email-settings>
          <p className="text-sm text-white/80">Offer Meet &amp; Greet by email 30 minutes after booking confirmation. Airport collections only; customers pay separately against their original booking. Existing included Meet &amp; Greet is excluded.</p>
          {([['BFS', 'Belfast International'], ['BHD', 'Belfast City'], ['DUB', 'Dublin Airport']] as const).map(([code, name]) => (
            <div key={code} className="flex items-center justify-between gap-3">
              <span className="text-sm text-white/80">{name} email offer</span>
              <Toggle id={`meet-greet-email-${code}`} label={`${name} Meet & Greet email offer`}
                checked={draft.meetGreetEmail?.enabled[code] === true}
                onChange={(enabled) => update("meetGreetEmail", {
                  enabled: { BFS: false, BHD: false, DUB: false, ...draft.meetGreetEmail?.enabled, [code]: enabled },
                  enabledSince: draft.meetGreetEmail?.enabledSince ?? {},
                })} />
            </div>
          ))}
          <p className="text-xs text-white/60">Applies to new paid bookings after switching on. Prices below are per airport collection for the whole party, including Meet &amp; Greet parking. Save pricing settings to apply.</p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <MoneyField
            label="Meet & Greet — Belfast International"
            value={draft.meetGreet.bfsGbp}
            onChange={(bfsGbp) => update("meetGreet", { ...draft.meetGreet, bfsGbp })}
          />
          <MoneyField
            label="Meet & Greet — Belfast City"
            value={draft.meetGreet.bhdGbp}
            onChange={(bhdGbp) => update("meetGreet", { ...draft.meetGreet, bhdGbp })}
          />
          <MoneyField
            label="Meet & Greet — Dublin Airport"
            value={draft.meetGreet.dubGbp}
            onChange={(dubGbp) => update("meetGreet", { ...draft.meetGreet, dubGbp })}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <MoneyField label="Terminal Access — Belfast International" value={draft.terminalAccess.bfsGbp}
            onChange={(bfsGbp) => update("terminalAccess", { ...draft.terminalAccess, bfsGbp })} />
          <MoneyField label="Terminal Access — Belfast City" value={draft.terminalAccess.bhdGbp}
            onChange={(bhdGbp) => update("terminalAccess", { ...draft.terminalAccess, bhdGbp })} />
        </div>
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

      <OwnerProfitabilityTester ownerKey={ownerKey} isolated={isolatedPreview} />

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
      {saveNotice ? (
        <p className="rounded-xl border border-emerald/40 bg-emerald/15 px-3 py-2 text-sm font-semibold text-emerald" role="status">
          {saveNotice}
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
          onClick={() => {
            setDraft(asDraft(cloneSettings(saved)));
            setMileageRateText(saved.saloonFormula!.ratePerMileGbp.toFixed(2));
            setMultiplierText(String(saved.minibus.multiplier));
            setExecutiveMultiplierText(String(saved.executive.multiplier));
            setExecutiveMinimumText(saved.executive.minimumFareGbp.toFixed(2));
            setSaveNotice(null);
          }}
          className="min-h-12 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          Discard Changes
        </button>
      </div>
      <details className="rounded-2xl border border-red-300/20 bg-red-500/5 p-4" data-restore-defaults-section>
        <summary className="cursor-pointer text-sm font-semibold text-white/70">
          Advanced: restore factory pricing
        </summary>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          This replaces <strong className="text-white">all</strong> of your own pricing settings
          (mileage rate, minimum fares, surcharges, drive-to-pickup charges and more) with the
          website&apos;s original factory values. It cannot be undone automatically. To undo a recent
          change, use Change history above and edit that one setting instead.
        </p>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setRestoreConfirmText("");
            setConfirm("restore");
          }}
          className="mt-3 min-h-11 rounded-xl border border-red-300/50 px-4 text-sm font-semibold text-red-200 disabled:opacity-40"
        >
          Restore default pricing settings…
        </button>
      </details>

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
              <>
                <p className="mt-3 text-xs text-white/55">
                  Public 7 Seater availability stays {draft.minibus.publicEnabled ? "ON" : "OFF"}.
                  Restoring defaults does not turn it on.
                </p>
                <label className="mt-4 block text-sm font-semibold text-red-200" htmlFor="restore-confirm-input">
                  Type RESTORE to confirm
                </label>
                <input
                  id="restore-confirm-input"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  value={restoreConfirmText}
                  onChange={(event) => setRestoreConfirmText(event.target.value)}
                  className="mt-1 h-11 w-full rounded-lg border border-white/20 bg-white px-3 text-base font-semibold text-navy outline-none focus:border-red-400"
                />
              </>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="min-h-11 rounded-xl border border-white/20 text-sm font-semibold text-white"
                onClick={() => {
                  setConfirm(null);
                  setRestoreConfirmText("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`min-h-11 rounded-xl text-sm font-semibold disabled:opacity-40 ${
                  confirm === "restore" ? "bg-red-500 text-white" : "bg-emerald text-navy"
                }`}
                disabled={saving || (confirm === "restore" && !restoreConfirmed)}
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
