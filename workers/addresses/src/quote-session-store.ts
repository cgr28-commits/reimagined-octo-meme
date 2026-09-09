/**
 * KV persistence for website quote sessions (daily owner report).
 * Each session writes its own day-membership marker so concurrent customers
 * cannot overwrite one another. Failures must never block quotes or bookings.
 */

import {
  QUOTE_SESSION_TTL_SECONDS,
  collectQuoteTransactionIdsFromMarkerKeys,
  isQuoteTransactionId,
  markQuoteSessionBooked,
  mergeQuoteSessionRecord,
  quoteSessionDayMarkerKey,
  quoteSessionDayMarkerPrefix,
  quoteSessionKey,
  quoteDailyReportSentKey,
  type DailyQuoteSessionInput,
  type DailyQuoteSessionRecord,
} from "../shared/quote-session";

export function quoteSessionStoreConfigured(store?: KVNamespace): store is KVNamespace {
  return Boolean(store);
}

async function writeDayMembershipMarker(
  store: KVNamespace,
  londonDay: string,
  quoteTransactionId: string,
): Promise<void> {
  await store.put(quoteSessionDayMarkerKey(londonDay, quoteTransactionId), "1", {
    expirationTtl: QUOTE_SESSION_TTL_SECONDS,
  });
}

export async function getQuoteSession(
  store: KVNamespace,
  quoteTransactionId: string,
): Promise<DailyQuoteSessionRecord | null> {
  if (!isQuoteTransactionId(quoteTransactionId)) return null;
  try {
    const record = await store.get<DailyQuoteSessionRecord>(
      quoteSessionKey(quoteTransactionId),
      "json",
    );
    if (!record?.quoteTransactionId || !isQuoteTransactionId(record.quoteTransactionId)) {
      return null;
    }
    return record;
  } catch (error) {
    console.error("Quote session read failed", error);
    return null;
  }
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
  await writeDayMembershipMarker(store, record.londonDay, record.quoteTransactionId);
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
  await writeDayMembershipMarker(store, record.londonDay, record.quoteTransactionId);
  return record;
}

async function listAllDayMarkerKeys(
  store: KVNamespace,
  londonDay: string,
): Promise<string[]> {
  const prefix = quoteSessionDayMarkerPrefix(londonDay);
  const names: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = cursor
      ? await store.list({ prefix, cursor })
      : await store.list({ prefix });
    for (const key of page.keys) {
      names.push(key.name);
    }
    if (page.list_complete || !("cursor" in page) || !page.cursor) {
      break;
    }
    cursor = page.cursor;
  }
  return names;
}

export async function listQuoteSessionsForLondonDay(
  store: KVNamespace,
  londonDay: string,
): Promise<DailyQuoteSessionRecord[]> {
  const markerKeys = await listAllDayMarkerKeys(store, londonDay);
  const ids = collectQuoteTransactionIdsFromMarkerKeys(markerKeys);
  const records: DailyQuoteSessionRecord[] = [];
  for (const id of ids) {
    const record = await getQuoteSession(store, id);
    if (!record) continue;
    records.push(record);
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
