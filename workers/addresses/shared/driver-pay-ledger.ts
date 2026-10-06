/**
 * Driver payment ledger. Accounting only.
 *
 * Each tracking journey is its own obligation. A return booking's outbound and
 * return legs are never one shared payment.
 *
 * This module does not send money. Do not pay drivers through SumUp refunds,
 * SumUp payouts, or any bank-payment provider.
 */

export const DRIVER_PAY_STATUSES = ["pending", "unpaid", "processing", "paid", "failed"] as const;
export type DriverPayStatus = (typeof DRIVER_PAY_STATUSES)[number];

export const DRIVER_PAY_METHODS = ["bank_transfer", "cash", "other"] as const;
export type DriverPayMethod = (typeof DRIVER_PAY_METHODS)[number];

export type DriverPayPeriod = "week" | "month" | "year";

export type DriverPayLedgerState = {
  driverPayAmount?: string;
  driverPayAmountPence?: number;
  driverPayStatus?: DriverPayStatus;
  driverPayPaidAt?: string;
  driverPayMethod?: DriverPayMethod;
  driverPayProviderReference?: string;
  driverPayStatusUpdatedAt?: string;
  driverPayDriverProfileKey?: string;
  driverPayDriverName?: string;
};

export const PAID_REASSIGN_ERROR =
  "This journey already has a recorded driver payment. Reassignment cannot overwrite it.";

export const PAID_DEASSIGN_ERROR =
  "This journey already has a recorded driver payment. Deassignment cannot remove it.";

/**
 * Accounting retention. Longer than the 45-day tracking job and longer than
 * the 370-day Money reporting window, so Year totals survive tracking expiry.
 * Tracking jobs themselves stay short-lived.
 */
export const DRIVER_PAY_LEDGER_TTL_SECONDS = 60 * 60 * 24 * 800;
export const DRIVER_PAY_JOURNEY_KEY_PREFIX = "driver-pay:journey:";
export const DRIVER_PAY_INDEX_KEY = "driver-pay:index";

export const MULTI_LEG_BOOKING_ASSIGN_ERROR =
  "This booking has separate outbound and return journeys. Assign each journey individually from Jobs so each leg has its own driver and pay amount.";

export function driverPayJourneyKey(trackingToken: string): string {
  return `${DRIVER_PAY_JOURNEY_KEY_PREFIX}${trackingToken.trim()}`;
}

export function bookingLevelDriverAssignDecision(
  linkedJourneyCount: number,
): { ok: true } | { ok: false; error: string } {
  if (linkedJourneyCount > 1) {
    return { ok: false, error: MULTI_LEG_BOOKING_ASSIGN_ERROR };
  }
  return { ok: true };
}

const PAY_FIELD_KEYS = [
  "driverPayAmount",
  "driverPayAmountPence",
  "driverPayStatus",
  "driverPayPaidAt",
  "driverPayMethod",
  "driverPayProviderReference",
  "driverPayStatusUpdatedAt",
  "driverPayDriverProfileKey",
  "driverPayDriverName",
] as const;

export function mutateDriverPayFields(
  target: DriverPayLedgerState,
  source: DriverPayLedgerState,
): void {
  const record = target as Record<string, unknown>;
  const next = source as Record<string, unknown>;
  for (const key of PAY_FIELD_KEYS) {
    const value = next[key];
    if (value === undefined || value === "") {
      delete record[key];
    } else {
      record[key] = value;
    }
  }
}

export function driverPayBlocksReassignment(record: DriverPayLedgerState): string | null {
  if (record.driverPayStatus === "paid") return PAID_REASSIGN_ERROR;
  return null;
}

export function driverPayBlocksDeassignment(record: DriverPayLedgerState): string | null {
  if (record.driverPayStatus === "paid") return PAID_DEASSIGN_ERROR;
  return null;
}

function isPositiveIntegerPence(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function formatDriverPayFromPence(pence: number): string {
  const pounds = Math.floor(pence / 100);
  const remainder = Math.abs(pence % 100);
  return `£${pounds}.${String(remainder).padStart(2, "0")}`;
}

export function parseDriverPayToPence(
  input: string,
): { ok: true; pence: number } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter the driver pay amount in pounds, such as 45 or 45.50." };
  }
  const unsigned = trimmed.replace(/^£/, "").trim().replace(/,/g, "");
  if (unsigned.startsWith("-")) {
    return { ok: false, error: "Driver pay cannot be negative." };
  }
  if (!/^\d+(\.\d+)?$/.test(unsigned)) {
    return { ok: false, error: "Enter the driver pay amount in pounds, such as 45 or 45.50." };
  }
  const [poundsText, decimals = ""] = unsigned.split(".");
  if (decimals.length > 2) {
    return { ok: false, error: "Driver pay can only use up to 2 decimal places." };
  }
  const pounds = Number(poundsText);
  if (!Number.isSafeInteger(pounds)) {
    return { ok: false, error: "Enter the driver pay amount in pounds, such as 45 or 45.50." };
  }
  const padded = `${decimals}00`.slice(0, 2);
  const pence = pounds * 100 + Number(padded);
  if (!Number.isSafeInteger(pence) || pence < 0) {
    return { ok: false, error: "Enter the driver pay amount in pounds, such as 45 or 45.50." };
  }
  if (pence === 0) {
    return { ok: false, error: "Driver pay must be more than zero." };
  }
  return { ok: true, pence };
}

/** Display label. Pence wins when it is a valid amount, so the text cannot drift. */
export function driverPayAmountLabel(record: DriverPayLedgerState): string | undefined {
  if (isPositiveIntegerPence(record.driverPayAmountPence)) {
    return formatDriverPayFromPence(record.driverPayAmountPence);
  }
  const text = record.driverPayAmount?.trim();
  if (!text) return undefined;
  const parsed = parseDriverPayToPence(text);
  if (parsed.ok) return formatDriverPayFromPence(parsed.pence);
  return text;
}

export function resolvedDriverPayPence(record: DriverPayLedgerState): number | undefined {
  if (isPositiveIntegerPence(record.driverPayAmountPence)) return record.driverPayAmountPence;
  const text = record.driverPayAmount?.trim();
  if (!text) return undefined;
  const parsed = parseDriverPayToPence(text);
  return parsed.ok ? parsed.pence : undefined;
}

/**
 * When a record is legitimately written, store integer pence and a label derived
 * from those pence. Legacy text such as "£45" is parsed once. Invalid legacy text
 * is left untouched.
 */
export function alignDriverPayAmount<T extends DriverPayLedgerState>(record: T): T {
  if (isPositiveIntegerPence(record.driverPayAmountPence)) {
    const label = formatDriverPayFromPence(record.driverPayAmountPence);
    if (record.driverPayAmount === label) return record;
    return { ...record, driverPayAmount: label };
  }
  const text = record.driverPayAmount?.trim();
  if (!text) return record;
  const parsed = parseDriverPayToPence(text);
  if (!parsed.ok) return record;
  return {
    ...record,
    driverPayAmountPence: parsed.pence,
    driverPayAmount: formatDriverPayFromPence(parsed.pence),
  };
}

export function applyDriverPayAssignment<T extends DriverPayLedgerState>(
  record: T,
  input: {
    amountInput: string;
    driverName: string;
    profileKey?: string;
    nowIso: string;
  },
): { ok: true; record: T } | { ok: false; error: string } {
  const blocked = driverPayBlocksReassignment(record);
  if (blocked) return { ok: false, error: blocked };
  const parsed = parseDriverPayToPence(input.amountInput);
  if (!parsed.ok) return parsed;
  const profileKey = input.profileKey?.trim() || undefined;
  const driverName = input.driverName.trim() || undefined;
  return {
    ok: true,
    record: {
      ...record,
      driverPayAmountPence: parsed.pence,
      driverPayAmount: formatDriverPayFromPence(parsed.pence),
      driverPayStatus: "pending",
      driverPayStatusUpdatedAt: input.nowIso,
      driverPayDriverName: driverName,
      driverPayDriverProfileKey: profileKey,
      driverPayPaidAt: undefined,
      driverPayMethod: undefined,
      driverPayProviderReference: undefined,
    },
  };
}

export function clearDriverPayForDeassignment<T extends DriverPayLedgerState>(
  record: T,
): { ok: true; record: T } | { ok: false; error: string } {
  const blocked = driverPayBlocksDeassignment(record);
  if (blocked) return { ok: false, error: blocked };
  return {
    ok: true,
    record: {
      ...record,
      driverPayAmount: undefined,
      driverPayAmountPence: undefined,
      driverPayStatus: undefined,
      driverPayPaidAt: undefined,
      driverPayMethod: undefined,
      driverPayProviderReference: undefined,
      driverPayStatusUpdatedAt: undefined,
      driverPayDriverProfileKey: undefined,
      driverPayDriverName: undefined,
    },
  };
}

/**
 * Completed assigned work becomes owed. Repeated calls do not create another
 * record and do not alter a payment that is already paid. A cancelled journey
 * does not become owed.
 */
export function oweDriverPayOnCompletion<T extends DriverPayLedgerState>(
  record: T,
  input: { nowIso: string; cancelled: boolean },
): { job: T; changed: boolean } {
  if (input.cancelled || record.driverPayStatus === "paid") {
    return { job: record, changed: false };
  }
  const aligned = alignDriverPayAmount(record);
  if (!isPositiveIntegerPence(aligned.driverPayAmountPence)) {
    return { job: record, changed: false };
  }
  if (
    aligned.driverPayStatus === "unpaid" ||
    aligned.driverPayStatus === "processing" ||
    aligned.driverPayStatus === "failed"
  ) {
    const changed =
      aligned.driverPayAmount !== record.driverPayAmount ||
      aligned.driverPayAmountPence !== record.driverPayAmountPence;
    return { job: changed ? aligned : record, changed };
  }
  return {
    changed: true,
    job: {
      ...aligned,
      driverPayStatus: "unpaid",
      driverPayStatusUpdatedAt: input.nowIso,
    },
  };
}

/**
 * Reopening a completed unpaid journey returns the obligation to pending.
 * A paid record is left exactly as it was.
 */
export function reopenDriverPayObligation<T extends DriverPayLedgerState>(
  record: T,
  nowIso: string,
): { job: T; changed: boolean } {
  if (record.driverPayStatus !== "unpaid") {
    return { job: record, changed: false };
  }
  return {
    changed: true,
    job: {
      ...record,
      driverPayStatus: "pending",
      driverPayStatusUpdatedAt: nowIso,
    },
  };
}

function normalizePayMethod(input: string): DriverPayMethod | null {
  const method = input.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (method === "bank_transfer" || method === "cash" || method === "other") return method;
  return null;
}

export function recordDriverAsPaid<T extends DriverPayLedgerState>(
  record: T,
  input: {
    method: string;
    reference?: string;
    nowIso: string;
    journeyCompleted: boolean;
    cancelled: boolean;
  },
): { ok: true; idempotent: boolean; record: T } | { ok: false; status: number; error: string } {
  if (input.cancelled) {
    return {
      ok: false,
      status: 409,
      error: "A cancelled journey cannot be recorded as paid.",
    };
  }
  if (record.driverPayStatus === "paid") {
    return { ok: true, idempotent: true, record };
  }
  if (!input.journeyCompleted) {
    return {
      ok: false,
      status: 409,
      error: "Complete the journey before recording the driver as paid.",
    };
  }
  const aligned = alignDriverPayAmount(record);
  if (!isPositiveIntegerPence(aligned.driverPayAmountPence)) {
    return { ok: false, status: 409, error: "This journey has no driver pay amount to record." };
  }
  if (aligned.driverPayStatus !== "unpaid") {
    return { ok: false, status: 409, error: "Driver pay is not unpaid for this journey." };
  }
  const method = normalizePayMethod(input.method);
  if (!method) {
    return { ok: false, status: 400, error: "Payment method must be bank transfer, cash, or other." };
  }
  const reference = input.reference?.trim() ?? "";
  if (reference.length > 80) {
    return { ok: false, status: 400, error: "Payment reference must be 80 characters or fewer." };
  }
  return {
    ok: true,
    idempotent: false,
    record: {
      ...aligned,
      driverPayStatus: "paid",
      driverPayPaidAt: input.nowIso,
      driverPayMethod: method,
      driverPayProviderReference: reference || undefined,
      driverPayStatusUpdatedAt: input.nowIso,
    },
  };
}

export function correctDriverPayToUnpaid<T extends DriverPayLedgerState>(
  record: T,
  input: { nowIso: string; journeyCompleted: boolean },
): { ok: true; record: T } | { ok: false; status: number; error: string } {
  if (record.driverPayStatus !== "paid") {
    return { ok: false, status: 409, error: "This journey is not recorded as paid." };
  }
  return {
    ok: true,
    record: {
      ...record,
      driverPayStatus: input.journeyCompleted ? "unpaid" : "pending",
      driverPayStatusUpdatedAt: input.nowIso,
      driverPayPaidAt: undefined,
      driverPayMethod: undefined,
      driverPayProviderReference: undefined,
    },
  };
}

export function driverPayStatusText(status: DriverPayStatus | undefined): string | undefined {
  switch (status) {
    case "pending":
      return "Pending";
    case "unpaid":
      return "UNPAID";
    case "paid":
      return "PAID";
    case "processing":
      return "Processing";
    case "failed":
      return "Failed";
    default:
      return undefined;
  }
}

export function driverPayMethodLabel(method: DriverPayMethod | undefined): string | undefined {
  switch (method) {
    case "bank_transfer":
      return "Bank transfer";
    case "cash":
      return "Cash";
    case "other":
      return "Other";
    default:
      return undefined;
  }
}

export function formatDriverPayPaidAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const datePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${datePart} at ${timePart}`;
}

export function londonCalendarDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(year, (month ?? 1) - 1, (day ?? 1) + days));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

export function driverPayPeriodBounds(
  period: DriverPayPeriod,
  now: Date,
): { fromDay: string; toDay: string; label: string } {
  const today = londonCalendarDay(now);
  if (period === "year") {
    const year = today.slice(0, 4);
    return { fromDay: `${year}-01-01`, toDay: `${year}-12-31`, label: "This year" };
  }
  if (period === "month") {
    const [year, month] = today.split("-");
    const fromDay = `${year}-${month}-01`;
    const end = new Date(Date.UTC(Number(year), Number(month), 0));
    const toDay = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-${String(end.getUTCDate()).padStart(2, "0")}`;
    return { fromDay, toDay, label: "This month" };
  }
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
  }).format(now);
  const index = WEEKDAY_INDEX[weekday] ?? 0;
  const fromDay = addCalendarDays(today, -index);
  return { fromDay, toDay: addCalendarDays(fromDay, 6), label: "This week" };
}

export type DriverPayOutstandingItem = {
  token: string;
  tripDate: string;
  driverName: string;
  pickupLabel: string;
  dropoffLabel: string;
  amountPence: number;
  amountLabel: string;
  bookingReference?: string;
  journeyLeg?: "outbound" | "return";
};

export type DriverPaySummaryJob = DriverPayLedgerState & {
  token: string;
  tripDate: string;
  pickupLabel: string;
  dropoffLabel: string;
  journeyStatus?: string;
  refundedAt?: string;
  assignedDriverName?: string;
  bookingReference?: string;
  journeyLeg?: "outbound" | "return";
  cancelled?: boolean;
};

function jobIsCancelled(job: DriverPaySummaryJob): boolean {
  return Boolean(job.cancelled || job.refundedAt?.trim());
}

function paidInPeriod(job: DriverPaySummaryJob, fromDay: string, toDay: string): boolean {
  if (job.driverPayStatus !== "paid" || !job.driverPayPaidAt) return false;
  const paidDay = londonCalendarDay(new Date(job.driverPayPaidAt));
  return paidDay >= fromDay && paidDay <= toDay;
}

/**
 * Outstanding is the sum of completed journeys currently unpaid.
 * Paid is the sum recorded as paid inside the reporting period.
 * Each job is counted on its own. Two legs of one booking are two amounts.
 */
export function summariseDriverPay(
  jobs: DriverPaySummaryJob[],
  period: DriverPayPeriod,
  now: Date = new Date(),
): {
  outstandingPence: number;
  outstandingLabel: string;
  paidPence: number;
  paidLabel: string;
  period: DriverPayPeriod;
  periodLabel: string;
  periodFrom: string;
  periodTo: string;
  outstanding: DriverPayOutstandingItem[];
} {
  const bounds = driverPayPeriodBounds(period, now);
  const outstanding: DriverPayOutstandingItem[] = [];
  let outstandingPence = 0;
  let paidPence = 0;

  for (const job of jobs) {
    const pence = resolvedDriverPayPence(job);
    if (!pence) continue;
    if (job.driverPayStatus === "paid" && paidInPeriod(job, bounds.fromDay, bounds.toDay)) {
      paidPence += pence;
    }
    if (jobIsCancelled(job)) continue;
    if (job.journeyStatus !== "completed") continue;
    if (job.driverPayStatus !== "unpaid") continue;
    outstandingPence += pence;
    outstanding.push({
      token: job.token,
      tripDate: job.tripDate,
      driverName: job.driverPayDriverName?.trim() || job.assignedDriverName?.trim() || "Driver",
      pickupLabel: job.pickupLabel,
      dropoffLabel: job.dropoffLabel,
      amountPence: pence,
      amountLabel: formatDriverPayFromPence(pence),
      ...(job.bookingReference?.trim() ? { bookingReference: job.bookingReference.trim() } : {}),
      ...(job.journeyLeg ? { journeyLeg: job.journeyLeg } : {}),
    });
  }

  outstanding.sort((left, right) => {
    const byDate = left.tripDate.localeCompare(right.tripDate);
    if (byDate !== 0) return byDate;
    return left.token.localeCompare(right.token);
  });

  return {
    outstandingPence,
    outstandingLabel: formatDriverPayFromPence(outstandingPence),
    paidPence,
    paidLabel: formatDriverPayFromPence(paidPence),
    period,
    periodLabel: bounds.label,
    periodFrom: bounds.fromDay,
    periodTo: bounds.toDay,
    outstanding,
  };
}

/**
 * Durable accounting record for one journey. This is the only copy that must
 * outlive the tracking job. It deliberately has no customer contact details,
 * customer fare, margin, refund, or payment-provider identifiers.
 */
export type DurableDriverPayRecord = {
  trackingToken: string;
  bookingReference?: string;
  journeyLeg?: "outbound" | "return";
  tripDate: string;
  pickupLabel: string;
  dropoffLabel: string;
  driverProfileKey?: string;
  driverName?: string;
  driverPayAmountPence: number;
  status: DriverPayStatus;
  paidAt?: string;
  paymentMethod?: DriverPayMethod;
  paymentReference?: string;
  statusUpdatedAt?: string;
};

const DURABLE_DRIVER_PAY_KEYS = [
  "trackingToken",
  "bookingReference",
  "journeyLeg",
  "tripDate",
  "pickupLabel",
  "dropoffLabel",
  "driverProfileKey",
  "driverName",
  "driverPayAmountPence",
  "status",
  "paidAt",
  "paymentMethod",
  "paymentReference",
  "statusUpdatedAt",
] as const;

export function legHasOwnDriverPayLedger(record: DriverPayLedgerState): boolean {
  return Boolean(record.driverPayStatus) || isPositiveIntegerPence(record.driverPayAmountPence);
}

/**
 * A booking-level amount may fill in a single enquiry journey that has no
 * ledger of its own. It must never be shown on a return booking's other leg.
 */
export function legMayUseBookingPayFallback(input: {
  hasOwnLedgerAmount: boolean;
  linkedJourneyCount: number;
  journeyLeg?: "outbound" | "return";
  pairedToken?: string;
}): boolean {
  if (input.hasOwnLedgerAmount) return false;
  if (input.linkedJourneyCount > 1) return false;
  if (input.pairedToken?.trim()) return false;
  if (input.journeyLeg === "return") return false;
  return true;
}

export function driverPayShownForLeg(input: {
  job: DriverPayLedgerState;
  bookingPayAmount?: string;
  linkedJourneyCount: number;
  journeyLeg?: "outbound" | "return";
  pairedToken?: string;
}): string | undefined {
  if (legHasOwnDriverPayLedger(input.job)) {
    return driverPayAmountLabel(input.job);
  }
  if (
    !legMayUseBookingPayFallback({
      hasOwnLedgerAmount: false,
      linkedJourneyCount: input.linkedJourneyCount,
      journeyLeg: input.journeyLeg,
      pairedToken: input.pairedToken,
    })
  ) {
    return undefined;
  }
  const booking = input.bookingPayAmount?.trim();
  return booking || undefined;
}

export function toDurableDriverPayRecord(
  source: DriverPayLedgerState & {
    token: string;
    tripDate: string;
    pickupLabel: string;
    dropoffLabel: string;
    journeyLeg?: "outbound" | "return";
    bookingReference?: string;
  },
): DurableDriverPayRecord | null {
  const token = source.token.trim();
  const pence = isPositiveIntegerPence(source.driverPayAmountPence)
    ? source.driverPayAmountPence
    : undefined;
  const status = source.driverPayStatus;
  if (!token || !pence || !status || !DRIVER_PAY_STATUSES.includes(status)) return null;
  const record: DurableDriverPayRecord = {
    trackingToken: token,
    tripDate: source.tripDate,
    pickupLabel: source.pickupLabel,
    dropoffLabel: source.dropoffLabel,
    driverPayAmountPence: pence,
    status,
  };
  const bookingReference = source.bookingReference?.trim();
  if (bookingReference) record.bookingReference = bookingReference;
  if (source.journeyLeg === "outbound" || source.journeyLeg === "return") {
    record.journeyLeg = source.journeyLeg;
  }
  const driverProfileKey = source.driverPayDriverProfileKey?.trim();
  if (driverProfileKey) record.driverProfileKey = driverProfileKey;
  const driverName = source.driverPayDriverName?.trim();
  if (driverName) record.driverName = driverName;
  const paidAt = source.driverPayPaidAt?.trim();
  if (paidAt) record.paidAt = paidAt;
  if (source.driverPayMethod) record.paymentMethod = source.driverPayMethod;
  const paymentReference = source.driverPayProviderReference?.trim();
  if (paymentReference) record.paymentReference = paymentReference;
  const statusUpdatedAt = source.driverPayStatusUpdatedAt?.trim();
  if (statusUpdatedAt) record.statusUpdatedAt = statusUpdatedAt;
  return record;
}

export function sanitizeDurableDriverPayRecord(value: unknown): DurableDriverPayRecord | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const status = source.status;
  if (typeof status !== "string" || !DRIVER_PAY_STATUSES.includes(status as DriverPayStatus)) {
    return null;
  }
  const built = toDurableDriverPayRecord({
    token: typeof source.trackingToken === "string" ? source.trackingToken : "",
    tripDate: typeof source.tripDate === "string" ? source.tripDate : "",
    pickupLabel: typeof source.pickupLabel === "string" ? source.pickupLabel : "",
    dropoffLabel: typeof source.dropoffLabel === "string" ? source.dropoffLabel : "",
    journeyLeg:
      source.journeyLeg === "outbound" || source.journeyLeg === "return" ? source.journeyLeg : undefined,
    bookingReference: typeof source.bookingReference === "string" ? source.bookingReference : undefined,
    driverPayAmountPence:
      typeof source.driverPayAmountPence === "number" ? source.driverPayAmountPence : undefined,
    driverPayStatus: status as DriverPayStatus,
    driverPayPaidAt: typeof source.paidAt === "string" ? source.paidAt : undefined,
    driverPayMethod:
      source.paymentMethod === "bank_transfer" ||
      source.paymentMethod === "cash" ||
      source.paymentMethod === "other"
        ? source.paymentMethod
        : undefined,
    driverPayProviderReference:
      typeof source.paymentReference === "string" ? source.paymentReference : undefined,
    driverPayStatusUpdatedAt:
      typeof source.statusUpdatedAt === "string" ? source.statusUpdatedAt : undefined,
    driverPayDriverProfileKey:
      typeof source.driverProfileKey === "string" ? source.driverProfileKey : undefined,
    driverPayDriverName: typeof source.driverName === "string" ? source.driverName : undefined,
  });
  if (!built) return null;
  const sanitized = {} as DurableDriverPayRecord;
  const record = built as unknown as Record<string, unknown>;
  const target = sanitized as unknown as Record<string, unknown>;
  for (const key of DURABLE_DRIVER_PAY_KEYS) {
    if (record[key] !== undefined) target[key] = record[key];
  }
  return sanitized;
}

/** Pending work is not yet owed. Unpaid and paid rows report as completed obligations. */
export function durableRecordToSummaryJob(record: DurableDriverPayRecord): DriverPaySummaryJob {
  const owed = record.status === "unpaid" || record.status === "paid" || record.status === "processing" || record.status === "failed";
  return {
    token: record.trackingToken,
    tripDate: record.tripDate,
    pickupLabel: record.pickupLabel,
    dropoffLabel: record.dropoffLabel,
    journeyStatus: owed ? "completed" : "pending",
    journeyLeg: record.journeyLeg,
    bookingReference: record.bookingReference,
    assignedDriverName: record.driverName,
    driverPayAmountPence: record.driverPayAmountPence,
    driverPayAmount: formatDriverPayFromPence(record.driverPayAmountPence),
    driverPayStatus: record.status,
    driverPayPaidAt: record.paidAt,
    driverPayMethod: record.paymentMethod,
    driverPayProviderReference: record.paymentReference,
    driverPayStatusUpdatedAt: record.statusUpdatedAt,
    driverPayDriverProfileKey: record.driverProfileKey,
    driverPayDriverName: record.driverName,
  };
}
