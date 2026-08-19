/**
 * KV persistence for Saved Quotes (TRACKING_STORE).
 */

import {
  SAVED_QUOTE_TTL_SECONDS,
  generateSavedQuoteId,
  generateSavedQuoteReference,
  generateSavedQuoteToken,
  normalizeSavedQuoteToken,
  savedQuoteOpenIndexKey,
  savedQuoteTokenKey,
  computeSavedQuoteExpiresAt,
  formatSavedQuoteAmount,
  isSavedQuoteExpired,
  type SavedQuoteJourneySnapshot,
  type SavedQuotePricingSnapshot,
  type SavedQuoteRecord,
} from "../shared/saved-quote";

type OpenIndex = { tokens: string[]; updatedAt: string };

async function readOpenIndex(store: KVNamespace): Promise<string[]> {
  const index = await store.get<OpenIndex>(savedQuoteOpenIndexKey(), "json");
  return Array.isArray(index?.tokens)
    ? index.tokens.map((t) => normalizeSavedQuoteToken(String(t))).filter(Boolean)
    : [];
}

async function writeOpenIndex(store: KVNamespace, tokens: string[]): Promise<void> {
  const unique = [...new Set(tokens.map(normalizeSavedQuoteToken).filter((t) => t.length >= 32))].slice(
    0,
    2000,
  );
  const payload: OpenIndex = { tokens: unique, updatedAt: new Date().toISOString() };
  await store.put(savedQuoteOpenIndexKey(), JSON.stringify(payload), {
    expirationTtl: SAVED_QUOTE_TTL_SECONDS,
  });
}

export async function saveSavedQuoteRecord(
  store: KVNamespace,
  record: SavedQuoteRecord,
): Promise<void> {
  const token = normalizeSavedQuoteToken(record.token);
  const toSave: SavedQuoteRecord = { ...record, token };
  await store.put(savedQuoteTokenKey(token), JSON.stringify(toSave), {
    expirationTtl: SAVED_QUOTE_TTL_SECONDS,
  });

  const open = await readOpenIndex(store);
  const keepOpen = toSave.status === "saved" && !isSavedQuoteExpired(toSave);
  const next = keepOpen
    ? [token, ...open.filter((t) => t !== token)]
    : open.filter((t) => t !== token);
  await writeOpenIndex(store, next);
}

export async function getSavedQuoteByToken(
  store: KVNamespace,
  token: string,
): Promise<SavedQuoteRecord | null> {
  const normalized = normalizeSavedQuoteToken(token);
  if (!normalized || normalized.length < 32) return null;
  const record = await store.get<SavedQuoteRecord>(savedQuoteTokenKey(normalized), "json");
  if (!record?.token || !record.reference) return null;
  return { ...record, token: normalizeSavedQuoteToken(record.token) };
}

export async function createSavedQuote(
  store: KVNamespace,
  input: {
    customerName: string;
    customerEmail: string;
    journey: SavedQuoteJourneySnapshot;
    pricing: SavedQuotePricingSnapshot;
  },
): Promise<SavedQuoteRecord> {
  const now = new Date();
  const createdAt = now.toISOString();
  const total = Math.round(Number(input.pricing.totalAmount) * 100) / 100;
  if (!Number.isFinite(total) || total < 1) {
    throw new Error("Invalid quote amount");
  }

  const record: SavedQuoteRecord = {
    id: generateSavedQuoteId(),
    reference: generateSavedQuoteReference(now),
    token: generateSavedQuoteToken(),
    customerName: input.customerName.trim(),
    customerEmail: input.customerEmail.trim().toLowerCase(),
    journey: input.journey,
    pricing: {
      ...input.pricing,
      totalAmount: total,
      currency: "GBP",
      amountLabel: input.pricing.amountLabel || formatSavedQuoteAmount(total),
    },
    status: "saved",
    createdAt,
    expiresAt: computeSavedQuoteExpiresAt(now),
  };

  await saveSavedQuoteRecord(store, record);
  return record;
}

export async function markSavedQuoteExpiredIfNeeded(
  store: KVNamespace,
  record: SavedQuoteRecord,
  now = new Date(),
): Promise<SavedQuoteRecord> {
  if (record.status === "booked") return record;
  if (record.status === "expired") return record;
  if (!isSavedQuoteExpired(record, now)) return record;
  const updated: SavedQuoteRecord = { ...record, status: "expired" };
  await saveSavedQuoteRecord(store, updated);
  return updated;
}

export async function markSavedQuoteBooked(
  store: KVNamespace,
  token: string,
  input: {
    paymentReference: string;
    checkoutId?: string;
    bookedAt?: string;
  },
): Promise<SavedQuoteRecord | null> {
  const record = await getSavedQuoteByToken(store, token);
  if (!record) return null;
  if (record.status === "booked") {
    return record;
  }
  const updated: SavedQuoteRecord = {
    ...record,
    status: "booked",
    bookedAt: input.bookedAt ?? new Date().toISOString(),
    bookingId: input.paymentReference,
    paymentReference: input.paymentReference,
    checkoutId: input.checkoutId ?? record.checkoutId,
  };
  await saveSavedQuoteRecord(store, updated);
  return updated;
}

export async function patchSavedQuoteEmailTimestamps(
  store: KVNamespace,
  token: string,
  patch: Partial<
    Pick<
      SavedQuoteRecord,
      | "initialEmailSentAt"
      | "firstReminderSentAt"
      | "finalReminderSentAt"
      | "lastEmailError"
    >
  >,
): Promise<SavedQuoteRecord | null> {
  const record = await getSavedQuoteByToken(store, token);
  if (!record) return null;
  const updated: SavedQuoteRecord = { ...record, ...patch };
  await saveSavedQuoteRecord(store, updated);
  return updated;
}

/** Open (still-saved) tokens for the hourly reminder processor. */
export async function listOpenSavedQuoteTokens(store: KVNamespace): Promise<string[]> {
  return readOpenIndex(store);
}
