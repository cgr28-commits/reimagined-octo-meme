/**
 * KV persistence for abandoned booking recovery (TRACKING_STORE).
 */

import {
  ABANDONED_BOOKING_CLAIM_TTL_MS,
  ABANDONED_BOOKING_KV_TTL_SECONDS,
  ABANDONED_BOOKING_REMINDER_DELAY_MS,
  abandonedBookingFingerprintKey,
  abandonedBookingOpenIndexKey,
  abandonedBookingOptOutKey,
  abandonedBookingTokenKey,
  buildAbandonedBookingFingerprint,
  computeAbandonedExpiresAt,
  computeAbandonedReminderDueAt,
  generateAbandonedBookingId,
  generateAbandonedBookingToken,
  isAbandonedBookingExpired,
  normalizeAbandonedBookingToken,
  normalizeEmail,
  type AbandonedBookingJourneySnapshot,
  type AbandonedBookingRecord,
  type AbandonedBookingStatus,
} from "../shared/abandoned-booking-recovery";

type OpenIndex = { tokens: string[]; updatedAt: string };

async function readOpenIndex(store: KVNamespace): Promise<string[]> {
  const index = await store.get<OpenIndex>(abandonedBookingOpenIndexKey(), "json");
  return Array.isArray(index?.tokens)
    ? index.tokens.map((t) => normalizeAbandonedBookingToken(String(t))).filter(Boolean)
    : [];
}

async function writeOpenIndex(store: KVNamespace, tokens: string[]): Promise<void> {
  const unique = [
    ...new Set(tokens.map(normalizeAbandonedBookingToken).filter((t) => t.length >= 32)),
  ].slice(0, 2000);
  const payload: OpenIndex = { tokens: unique, updatedAt: new Date().toISOString() };
  await store.put(abandonedBookingOpenIndexKey(), JSON.stringify(payload), {
    expirationTtl: ABANDONED_BOOKING_KV_TTL_SECONDS,
  });
}

function keepInOpenIndex(status: AbandonedBookingStatus): boolean {
  return status === "awaiting_reminder" || status === "reminder_sent";
}

export async function saveAbandonedBookingRecord(
  store: KVNamespace,
  record: AbandonedBookingRecord,
): Promise<void> {
  const token = normalizeAbandonedBookingToken(record.token);
  const toSave: AbandonedBookingRecord = { ...record, token };
  await store.put(abandonedBookingTokenKey(token), JSON.stringify(toSave), {
    expirationTtl: ABANDONED_BOOKING_KV_TTL_SECONDS,
  });
  await store.put(abandonedBookingFingerprintKey(toSave.fingerprint), token, {
    expirationTtl: ABANDONED_BOOKING_KV_TTL_SECONDS,
  });

  const open = await readOpenIndex(store);
  const next = keepInOpenIndex(toSave.status)
    ? [token, ...open.filter((t) => t !== token)]
    : open.filter((t) => t !== token);
  await writeOpenIndex(store, next);
}

export async function getAbandonedBookingByToken(
  store: KVNamespace,
  token: string,
): Promise<AbandonedBookingRecord | null> {
  const normalized = normalizeAbandonedBookingToken(token);
  if (!normalized || normalized.length < 32) return null;
  const record = await store.get<AbandonedBookingRecord>(
    abandonedBookingTokenKey(normalized),
    "json",
  );
  if (!record?.token || !record.customerEmail) return null;
  return { ...record, token: normalizeAbandonedBookingToken(record.token) };
}

export async function getAbandonedBookingTokenByFingerprint(
  store: KVNamespace,
  fingerprint: string,
): Promise<string | null> {
  const token = await store.get(abandonedBookingFingerprintKey(fingerprint));
  if (!token) return null;
  const normalized = normalizeAbandonedBookingToken(token);
  return normalized.length >= 32 ? normalized : null;
}

export async function listOpenAbandonedBookingTokens(store: KVNamespace): Promise<string[]> {
  return readOpenIndex(store);
}

export async function isAbandonedBookingEmailOptedOut(
  store: KVNamespace,
  email: string,
): Promise<boolean> {
  const raw = await store.get(abandonedBookingOptOutKey(email));
  return Boolean(raw);
}

export async function optOutAbandonedBookingEmail(
  store: KVNamespace,
  email: string,
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) return;
  await store.put(
    abandonedBookingOptOutKey(normalized),
    JSON.stringify({ email: normalized, optedOutAt: new Date().toISOString() }),
    { expirationTtl: ABANDONED_BOOKING_KV_TTL_SECONDS * 6 },
  );
}

export async function createOrUpdateAbandonedBooking(
  store: KVNamespace,
  input: {
    customerName: string;
    customerEmail: string;
    mobileNumber?: string;
    journey: AbandonedBookingJourneySnapshot;
    checkoutId?: string;
    checkoutReference?: string;
    quoteReference?: string;
    delayMs?: number;
    now?: Date;
  },
): Promise<AbandonedBookingRecord> {
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.customerEmail);
  if (!email || !email.includes("@")) {
    throw new Error("Valid customer email is required");
  }

  const fingerprint = buildAbandonedBookingFingerprint({
    customerEmail: email,
    journey: input.journey,
  });

  const existingToken = await getAbandonedBookingTokenByFingerprint(store, fingerprint);
  const existing = existingToken ? await getAbandonedBookingByToken(store, existingToken) : null;

  // Never reopen a recovered / opted-out record via upsert.
  if (existing && (existing.status === "recovered" || existing.status === "opted_out")) {
    return existing;
  }

  if (existing && !isAbandonedBookingExpired(existing, now)) {
    const updated: AbandonedBookingRecord = {
      ...existing,
      customerName: input.customerName.trim() || existing.customerName,
      customerEmail: email,
      mobileNumber: input.mobileNumber?.trim() || existing.mobileNumber,
      journey: { ...existing.journey, ...input.journey },
      checkoutId: input.checkoutId || existing.checkoutId,
      checkoutReference: input.checkoutReference || existing.checkoutReference,
      quoteReference: input.quoteReference || existing.quoteReference,
      // Keep original createdAt / reminderDueAt so the 1-hour clock does not reset forever.
    };
    await saveAbandonedBookingRecord(store, updated);
    return updated;
  }

  const createdAt = now;
  const record: AbandonedBookingRecord = {
    id: generateAbandonedBookingId(),
    token: generateAbandonedBookingToken(),
    customerName: input.customerName.trim() || "Customer",
    customerEmail: email,
    mobileNumber: input.mobileNumber?.trim() || undefined,
    journey: input.journey,
    fingerprint,
    checkoutId: input.checkoutId,
    checkoutReference: input.checkoutReference,
    quoteReference: input.quoteReference,
    status: "awaiting_reminder",
    createdAt: createdAt.toISOString(),
    reminderDueAt: computeAbandonedReminderDueAt(
      createdAt,
      input.delayMs ?? ABANDONED_BOOKING_REMINDER_DELAY_MS,
    ),
    expiresAt: computeAbandonedExpiresAt(createdAt),
  };
  await saveAbandonedBookingRecord(store, record);
  return record;
}

export async function markAbandonedBookingExpiredIfNeeded(
  store: KVNamespace,
  record: AbandonedBookingRecord,
  now = new Date(),
): Promise<AbandonedBookingRecord> {
  if (record.status === "recovered" || record.status === "opted_out") return record;
  if (record.status === "expired") return record;
  if (!isAbandonedBookingExpired(record, now)) return record;
  const updated: AbandonedBookingRecord = { ...record, status: "expired" };
  await saveAbandonedBookingRecord(store, updated);
  // Hard-delete PII after expiry window — retention policy for unconverted records.
  await store.delete(abandonedBookingTokenKey(updated.token));
  return updated;
}

export async function markAbandonedBookingRecovered(
  store: KVNamespace,
  input: {
    token?: string;
    checkoutId?: string;
    paymentReference?: string;
    recoveredAt?: string;
  },
): Promise<AbandonedBookingRecord | null> {
  let record: AbandonedBookingRecord | null = null;
  if (input.token) {
    record = await getAbandonedBookingByToken(store, input.token);
  }
  if (!record && input.checkoutId) {
    const tokens = await listOpenAbandonedBookingTokens(store);
    for (const token of tokens) {
      const candidate = await getAbandonedBookingByToken(store, token);
      if (candidate?.checkoutId && candidate.checkoutId === input.checkoutId) {
        record = candidate;
        break;
      }
    }
  }
  if (!record) return null;
  if (record.status === "recovered") return record;

  const updated: AbandonedBookingRecord = {
    ...record,
    status: "recovered",
    recoveredAt: input.recoveredAt ?? new Date().toISOString(),
    paymentReference: input.paymentReference ?? record.paymentReference,
  };
  await saveAbandonedBookingRecord(store, updated);
  return updated;
}

export async function markAbandonedBookingOptedOut(
  store: KVNamespace,
  token: string,
): Promise<AbandonedBookingRecord | null> {
  const record = await getAbandonedBookingByToken(store, token);
  if (!record) return null;
  await optOutAbandonedBookingEmail(store, record.customerEmail);
  const updated: AbandonedBookingRecord = {
    ...record,
    status: "opted_out",
    optedOutAt: new Date().toISOString(),
  };
  await saveAbandonedBookingRecord(store, updated);
  return updated;
}

export async function tryClaimAbandonedBookingReminder(
  store: KVNamespace,
  token: string,
): Promise<
  { ok: true; claimId: string; record: AbandonedBookingRecord } | { ok: false; reason: string }
> {
  const record = await getAbandonedBookingByToken(store, token);
  if (!record) return { ok: false, reason: "missing" };
  if (record.status !== "awaiting_reminder") return { ok: false, reason: "status" };
  if (record.reminderSentAt) return { ok: false, reason: "already_sent" };
  if (isAbandonedBookingExpired(record)) return { ok: false, reason: "expired" };

  if (record.reminderClaimId && record.reminderClaimedAt) {
    const claimedMs = Date.parse(record.reminderClaimedAt);
    if (Number.isFinite(claimedMs) && Date.now() - claimedMs < ABANDONED_BOOKING_CLAIM_TTL_MS) {
      return { ok: false, reason: "claimed" };
    }
  }

  const claimId = generateAbandonedBookingId();
  const claimedAt = new Date().toISOString();
  await saveAbandonedBookingRecord(store, {
    ...record,
    reminderClaimId: claimId,
    reminderClaimedAt: claimedAt,
  });

  const reloaded = await getAbandonedBookingByToken(store, token);
  if (!reloaded || reloaded.reminderClaimId !== claimId) {
    return { ok: false, reason: "lost_claim" };
  }
  if (reloaded.reminderSentAt) return { ok: false, reason: "already_sent" };
  return { ok: true, claimId, record: reloaded };
}

export async function clearAbandonedBookingReminderClaim(
  store: KVNamespace,
  token: string,
  claimId: string,
): Promise<void> {
  const record = await getAbandonedBookingByToken(store, token);
  if (!record || record.reminderClaimId !== claimId) return;
  await saveAbandonedBookingRecord(store, {
    ...record,
    reminderClaimId: undefined,
    reminderClaimedAt: undefined,
  });
}

export async function patchAbandonedBookingReminderSent(
  store: KVNamespace,
  token: string,
  sentAt = new Date().toISOString(),
): Promise<AbandonedBookingRecord | null> {
  const record = await getAbandonedBookingByToken(store, token);
  if (!record) return null;
  const updated: AbandonedBookingRecord = {
    ...record,
    status: "reminder_sent",
    reminderSentAt: sentAt,
    reminderClaimId: undefined,
    reminderClaimedAt: undefined,
    lastEmailError: undefined,
  };
  await saveAbandonedBookingRecord(store, updated);
  return updated;
}

export async function listAbandonedBookingsForOwner(
  store: KVNamespace,
  limit = 40,
): Promise<AbandonedBookingRecord[]> {
  const tokens = await listOpenAbandonedBookingTokens(store);
  const records: AbandonedBookingRecord[] = [];
  for (const token of tokens.slice(0, Math.max(1, Math.min(limit, 100)))) {
    const record = await getAbandonedBookingByToken(store, token);
    if (record) records.push(record);
  }
  records.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return records;
}
