/**
 * KV persistence for website quote sessions (daily owner report).
 * Failures must never block quotes or bookings — callers catch.
 */

import {
  QUOTE_SESSION_TTL_SECONDS,
  isQuoteTransactionId,
  markQuoteSessionBooked,
  mergeQuoteSessionRecord,
  normalizeQuoteTransactionId,
  quoteSessionDayIndexKey,
  quoteSessionKey,
  quoteDailyReportSentKey,
  type DailyQuoteSessionInput,
  type DailyQuoteSessionRecord,
} from "../shared/quote-session";

type DayIndex = { ids: string[]; updatedAt: string };

export function quoteSessionStoreConfigured(store?: KVNamespace): store is KVNamespace {
  return Boolean(store);
}

async function readDayIndex(store: KVNamespace, londonDay: string): Promise<string[]> {
  const index = await store.get<DayIndex>(quoteSessionDayIndexKey(londonDay), "json");
  return Array.isArray(index?.ids)
    ? index.ids.map((id) => normalizeQuoteTransactionId(String(id))).filter(Boolean)
    : [];
}

async function writeDayIndex(
  store: KVNamespace,
  londonDay: string,
  ids: string[],
): Promise<void> {
  const unique = [...new Set(ids.map(normalizeQuoteTransactionId).filter(Boolean))].slice(0, 2000);
  const payload: DayIndex = { ids: unique, updatedAt: new Date().toISOString() };
  await store.put(quoteSessionDayIndexKey(londonDay), JSON.stringify(payload), {
    expirationTtl: QUOTE_SESSION_TTL_SECONDS,
  });
}

export async function getQuoteSession(
  store: KVNamespace,
  quoteTransactionId: string,
): Promise<DailyQuoteSessionRecord | null> {
  if (!isQuoteTransactionId(quoteTransactionId)) return null;
  const record = await store.get<DailyQuoteSessionRecord>(
    quoteSessionKey(quoteTransactionId),
    "json",
  );
  if (!record?.quoteTransactionId) return null;
  return record;
}

export async function upsertQuoteSession(
  store: KVNamespace,
  input: DailyQuoteSessionInput,
): Promise<{ record: DailyQuoteSessionRecord; created: boolean }> {
  const existing = await getQuoteSession(store, input.quoteTransactionId);
  const record = mergeQuoteSessionRecord(existing, input);
  await store.put(quoteSessionKey(record.quoteTransactionId), JSON.stringify(record), {
    expirationTtl: QUOTE_SESSION_TTL_SECONDS,
  });
  const index = await readDayIndex(store, record.londonDay);
  if (!index.includes(normalizeQuoteTransactionId(record.quoteTransactionId))) {
    await writeDayIndex(store, record.londonDay, [
      normalizeQuoteTransactionId(record.quoteTransactionId),
      ...index,
    ]);
  }
  return { record, created: !existing };
}

export async function markQuoteSessionBookedInStore(
  store: KVNamespace,
  input: {
    quoteTransactionId: string;
    bookingReference: string;
    fallback?: Partial<DailyQuoteSessionInput>;
    now?: Date;
  },
): Promise<DailyQuoteSessionRecord | null> {
  if (!isQuoteTransactionId(input.quoteTransactionId)) return null;
  const existing = await getQuoteSession(store, input.quoteTransactionId);
  const record = markQuoteSessionBooked(existing, input);
  await store.put(quoteSessionKey(record.quoteTransactionId), JSON.stringify(record), {
    expirationTtl: QUOTE_SESSION_TTL_SECONDS,
  });
  const index = await readDayIndex(store, record.londonDay);
  if (!index.includes(normalizeQuoteTransactionId(record.quoteTransactionId))) {
    await writeDayIndex(store, record.londonDay, [
      normalizeQuoteTransactionId(record.quoteTransactionId),
      ...index,
    ]);
  }
  return record;
}

export async function listQuoteSessionsForLondonDay(
  store: KVNamespace,
  londonDay: string,
): Promise<DailyQuoteSessionRecord[]> {
  const ids = await readDayIndex(store, londonDay);
  const records: DailyQuoteSessionRecord[] = [];
  for (const id of ids) {
    const record = await getQuoteSession(store, id);
    if (record) records.push(record);
  }
  return records.sort((a, b) => a.firstQuotedAt.localeCompare(b.firstQuotedAt));
}

export async function hasDailyQuoteReportBeenSent(
  store: KVNamespace,
  londonDay: string,
): Promise<boolean> {
  const existing = await store.get(quoteDailyReportSentKey(londonDay));
  return Boolean(existing);
}

export async function markDailyQuoteReportSent(
  store: KVNamespace,
  londonDay: string,
): Promise<void> {
  await store.put(quoteDailyReportSentKey(londonDay), new Date().toISOString(), {
    expirationTtl: QUOTE_SESSION_TTL_SECONDS,
  });
}
