/**
 * Durable driver-payment ledger.
 *
 * One accounting row per journey, kept apart from the 45-day tracking job.
 * The row stores journey labels and the payment obligation only.
 */

import {
  DRIVER_PAY_INDEX_KEY,
  DRIVER_PAY_LEDGER_TTL_SECONDS,
  driverPayJourneyKey,
  sanitizeDurableDriverPayRecord,
  toDurableDriverPayRecord,
  type DriverPayLedgerState,
  type DurableDriverPayRecord,
} from "../shared/driver-pay-ledger";

async function readIndex(store: KVNamespace): Promise<string[]> {
  const value = await store.get(DRIVER_PAY_INDEX_KEY, "json");
  if (!Array.isArray(value)) return [];
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const token = entry.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

async function writeIndex(store: KVNamespace, tokens: string[]): Promise<void> {
  await store.put(DRIVER_PAY_INDEX_KEY, JSON.stringify(tokens), {
    expirationTtl: DRIVER_PAY_LEDGER_TTL_SECONDS,
  });
}

export async function upsertDriverPayLedger(
  store: KVNamespace,
  record: DurableDriverPayRecord,
): Promise<void> {
  const sanitized = sanitizeDurableDriverPayRecord(record);
  if (!sanitized) return;
  await store.put(driverPayJourneyKey(sanitized.trackingToken), JSON.stringify(sanitized), {
    expirationTtl: DRIVER_PAY_LEDGER_TTL_SECONDS,
  });
  const index = await readIndex(store);
  if (!index.includes(sanitized.trackingToken)) {
    index.push(sanitized.trackingToken);
  }
  await writeIndex(store, index);
}

export async function removeDriverPayLedger(store: KVNamespace, trackingToken: string): Promise<void> {
  const token = trackingToken.trim();
  if (!token) return;
  await store.delete(driverPayJourneyKey(token));
  const index = (await readIndex(store)).filter((entry) => entry !== token);
  await writeIndex(store, index);
}

export async function getDurableDriverPay(
  store: KVNamespace,
  trackingToken: string,
): Promise<DurableDriverPayRecord | null> {
  const token = trackingToken.trim();
  if (!token) return null;
  const value = await store.get(driverPayJourneyKey(token), "json");
  return sanitizeDurableDriverPayRecord(value);
}

export async function listDurableDriverPay(store: KVNamespace): Promise<DurableDriverPayRecord[]> {
  const index = await readIndex(store);
  const records: DurableDriverPayRecord[] = [];
  for (const token of index) {
    const record = await getDurableDriverPay(store, token);
    if (record) records.push(record);
  }
  return records;
}

export async function persistTrackingDriverPay(
  store: KVNamespace,
  job: DriverPayLedgerState & {
    token: string;
    tripDate: string;
    pickupLabel: string;
    dropoffLabel: string;
    journeyLeg?: "outbound" | "return";
  },
  options?: { bookingReference?: string },
): Promise<void> {
  const existing = await getDurableDriverPay(store, job.token);
  const bookingReference = options?.bookingReference?.trim() || existing?.bookingReference;
  const next = toDurableDriverPayRecord({
    ...job,
    bookingReference,
  });
  if (!next) {
    if (existing) await removeDriverPayLedger(store, job.token);
    return;
  }
  await upsertDriverPayLedger(store, next);
}
