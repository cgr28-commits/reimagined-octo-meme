/**
 * KV persistence for Return Journey Offers (TRACKING_STORE).
 * Tokens are stored by SHA-256 hash only — the raw token lives in the email URL.
 */

import {
  RETURN_OFFER_CLAIM_MS,
  RETURN_OFFER_TTL_SECONDS,
  normalizeReturnOfferToken,
  returnOfferBookingKey,
  returnOfferOpenIndexKey,
  returnOfferTokenKey,
  type ReturnOfferRecord,
  type ReturnOfferStatus,
} from "../shared/return-offer";

type OpenIndex = { refs: string[]; updatedAt: string };

const OPEN_STATUSES = new Set<ReturnOfferStatus>(["ELIGIBLE", "SCHEDULED", "SENT"]);

async function readOpenIndex(store: KVNamespace): Promise<string[]> {
  const index = await store.get<OpenIndex>(returnOfferOpenIndexKey(), "json");
  return Array.isArray(index?.refs)
    ? index.refs.map((ref) => String(ref).trim()).filter(Boolean)
    : [];
}

async function writeOpenIndex(store: KVNamespace, refs: string[]): Promise<void> {
  const unique = [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))].slice(0, 4000);
  const payload: OpenIndex = { refs: unique, updatedAt: new Date().toISOString() };
  await store.put(returnOfferOpenIndexKey(), JSON.stringify(payload), {
    expirationTtl: RETURN_OFFER_TTL_SECONDS,
  });
}

export async function saveReturnOfferRecord(
  store: KVNamespace,
  record: ReturnOfferRecord,
): Promise<void> {
  const toSave: ReturnOfferRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
  };
  const payload = JSON.stringify(toSave);
  await store.put(returnOfferBookingKey(toSave.originalPaymentReference), payload, {
    expirationTtl: RETURN_OFFER_TTL_SECONDS,
  });
  if (toSave.tokenHash) {
    await store.put(returnOfferTokenKey(toSave.tokenHash), payload, {
      expirationTtl: RETURN_OFFER_TTL_SECONDS,
    });
  }

  const open = await readOpenIndex(store);
  const keepOpen = OPEN_STATUSES.has(toSave.status);
  const next = keepOpen
    ? [toSave.originalPaymentReference, ...open.filter((ref) => ref !== toSave.originalPaymentReference)]
    : open.filter((ref) => ref !== toSave.originalPaymentReference);
  await writeOpenIndex(store, next);
}

export async function getReturnOfferByPaymentReference(
  store: KVNamespace,
  paymentReference: string,
): Promise<ReturnOfferRecord | null> {
  const ref = paymentReference.trim();
  if (!ref) return null;
  const record = await store.get<ReturnOfferRecord>(returnOfferBookingKey(ref), "json");
  if (!record?.originalPaymentReference) return null;
  return record;
}

export async function getReturnOfferByTokenHash(
  store: KVNamespace,
  tokenHash: string,
): Promise<ReturnOfferRecord | null> {
  const hash = tokenHash.trim();
  if (!hash || hash.length < 32) return null;
  const record = await store.get<ReturnOfferRecord>(returnOfferTokenKey(hash), "json");
  if (!record?.tokenHash || record.tokenHash !== hash) return null;
  return record;
}

export async function listOpenReturnOfferRefs(store: KVNamespace): Promise<string[]> {
  return readOpenIndex(store);
}

export async function tryClaimReturnOfferSend(
  store: KVNamespace,
  paymentReference: string,
): Promise<{ ok: true; claimId: string; record: ReturnOfferRecord } | { ok: false; reason: string }> {
  const record = await getReturnOfferByPaymentReference(store, paymentReference);
  if (!record) return { ok: false, reason: "missing" };
  if (record.emailSentAt || record.status === "SENT" || record.status === "REDEEMED") {
    return { ok: false, reason: "already_sent" };
  }
  if (record.status !== "SCHEDULED" && record.status !== "ELIGIBLE") {
    return { ok: false, reason: "status" };
  }
  if (record.sendClaimId && record.sendClaimedAt) {
    const claimedMs = Date.parse(record.sendClaimedAt);
    if (Number.isFinite(claimedMs) && Date.now() - claimedMs < RETURN_OFFER_CLAIM_MS) {
      return { ok: false, reason: "claimed" };
    }
  }

  const claimId = crypto.randomUUID();
  const claimedAt = new Date().toISOString();
  await saveReturnOfferRecord(store, {
    ...record,
    sendClaimId: claimId,
    sendClaimedAt: claimedAt,
    status: "SCHEDULED",
  });

  const verified = await getReturnOfferByPaymentReference(store, paymentReference);
  if (!verified || verified.sendClaimId !== claimId || verified.emailSentAt) {
    return { ok: false, reason: "lost_race" };
  }
  return { ok: true, claimId, record: verified };
}

export async function clearReturnOfferSendClaim(
  store: KVNamespace,
  paymentReference: string,
  claimId: string,
): Promise<void> {
  const record = await getReturnOfferByPaymentReference(store, paymentReference);
  if (!record) return;
  if (record.sendClaimId !== claimId || record.emailSentAt) return;
  await saveReturnOfferRecord(store, {
    ...record,
    sendClaimId: undefined,
    sendClaimedAt: undefined,
  });
}

export async function markReturnOfferSent(
  store: KVNamespace,
  paymentReference: string,
  input: { tokenHash: string; claimId: string; expiresAt: string },
): Promise<ReturnOfferRecord | null> {
  const record = await getReturnOfferByPaymentReference(store, paymentReference);
  if (!record) return null;
  if (record.emailSentAt || record.status === "SENT" || record.status === "REDEEMED") {
    return record;
  }
  if (record.sendClaimId !== input.claimId) return record;
  const sentAt = new Date().toISOString();
  const updated: ReturnOfferRecord = {
    ...record,
    tokenHash: input.tokenHash,
    status: "SENT",
    emailSentAt: sentAt,
    expiresAt: input.expiresAt,
  };
  await saveReturnOfferRecord(store, updated);
  return updated;
}

export async function markReturnOfferRedeemed(
  store: KVNamespace,
  paymentReference: string,
  returnBookingPaymentReference: string,
): Promise<ReturnOfferRecord | null> {
  const record = await getReturnOfferByPaymentReference(store, paymentReference);
  if (!record) return null;
  if (record.status === "REDEEMED") return record;
  const updated: ReturnOfferRecord = {
    ...record,
    status: "REDEEMED",
    redeemedAt: new Date().toISOString(),
    returnBookingPaymentReference,
  };
  await saveReturnOfferRecord(store, updated);
  return updated;
}

export function normalizeIncomingReturnOfferToken(token: string): string {
  return normalizeReturnOfferToken(token);
}
