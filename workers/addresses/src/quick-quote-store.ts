/**
 * KV persistence for Quick Quote booking links.
 */

import {
  QUICK_QUOTE_TTL_SECONDS,
  generateQuickQuoteId,
  isQuickQuoteExpired,
  normalizeQuickQuoteId,
  quickQuoteKey,
  quickQuoteRateLimitKey,
  type QuickQuoteRecord,
} from "../shared/quick-quote";

export async function getQuickQuote(
  store: KVNamespace,
  id: string,
): Promise<QuickQuoteRecord | null> {
  const key = normalizeQuickQuoteId(id);
  if (!key || key.length < 24) return null;
  const record = await store.get<QuickQuoteRecord>(quickQuoteKey(key), "json");
  if (!record?.id || typeof record.quotedAmount !== "number") return null;
  return record;
}

export async function saveQuickQuote(
  store: KVNamespace,
  record: QuickQuoteRecord,
): Promise<void> {
  const id = normalizeQuickQuoteId(record.id);
  const payload = JSON.stringify({ ...record, id });

  // No time limit — persist without a KV expiration setting.
  if (record.expiresAt == null || record.expiresAt === "") {
    await store.put(quickQuoteKey(id), payload);
    return;
  }

  const ttl = Math.max(
    60,
    Math.min(
      QUICK_QUOTE_TTL_SECONDS + 60 * 60 * 24 * 7,
      Math.floor((Date.parse(record.expiresAt) - Date.now()) / 1000) + 60 * 60 * 24 * 7,
    ),
  );
  await store.put(quickQuoteKey(id), payload, {
    expirationTtl: Number.isFinite(ttl) && ttl > 0 ? ttl : QUICK_QUOTE_TTL_SECONDS + 60 * 60,
  });
}

export async function createQuickQuoteRecord(
  store: KVNamespace,
  input: Omit<QuickQuoteRecord, "id" | "createdAt" | "expiresAt" | "status"> & {
    /** Seconds until expiry, or `null` for no expiry. Defaults to legacy 24h. */
    ttlSeconds?: number | null;
  },
): Promise<QuickQuoteRecord> {
  const id = generateQuickQuoteId();
  const now = Date.now();
  const ttl =
    input.ttlSeconds === null
      ? null
      : typeof input.ttlSeconds === "number"
        ? input.ttlSeconds
        : QUICK_QUOTE_TTL_SECONDS;
  const { ttlSeconds: _omit, ...rest } = input;
  const record: QuickQuoteRecord = {
    ...rest,
    id,
    createdAt: new Date(now).toISOString(),
    expiresAt: ttl == null ? null : new Date(now + ttl * 1000).toISOString(),
    status: "open",
  };
  await saveQuickQuote(store, record);
  return record;
}

export async function markQuickQuoteCheckout(
  store: KVNamespace,
  id: string,
  checkout: { checkoutId: string; checkoutReference: string; paymentUrl?: string },
): Promise<QuickQuoteRecord | null> {
  const existing = await getQuickQuote(store, id);
  if (!existing) return null;
  if (isQuickQuoteExpired(existing) && existing.status !== "checkout_created") {
    return null;
  }
  // Idempotent reuse of same unpaid checkout.
  if (
    existing.checkoutId &&
    existing.checkoutId === checkout.checkoutId &&
    existing.status !== "paid"
  ) {
    return existing;
  }
  if (existing.status === "paid") {
    return existing;
  }
  if (existing.checkoutId && existing.checkoutId !== checkout.checkoutId) {
    // Keep original unpaid checkout — caller should reuse it.
    return existing;
  }
  const next: QuickQuoteRecord = {
    ...existing,
    status: "checkout_created",
    checkoutId: checkout.checkoutId,
    checkoutReference: checkout.checkoutReference,
    ...(checkout.paymentUrl ? { paymentUrl: checkout.paymentUrl } : {}),
  };
  await saveQuickQuote(store, next);
  return next;
}

export async function markQuickQuotePaid(
  store: KVNamespace,
  id: string,
  paymentReference: string,
): Promise<QuickQuoteRecord | null> {
  const existing = await getQuickQuote(store, id);
  if (!existing) return null;
  if (existing.status === "paid" && existing.paymentReference === paymentReference) {
    return existing;
  }
  const next: QuickQuoteRecord = {
    ...existing,
    status: "paid",
    paymentReference,
    paidAt: new Date().toISOString(),
  };
  await saveQuickQuote(store, next);
  return next;
}

/** Simple per-owner hourly rate limit for link creation. */
export async function consumeQuickQuoteCreateQuota(
  store: KVNamespace,
  ownerKeyMaterial: string,
  limit: number,
): Promise<"ok" | "limited"> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ownerKeyMaterial),
  );
  const hash = [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const key = quickQuoteRateLimitKey(hash);
  const hour = new Date().toISOString().slice(0, 13);
  const raw = await store.get<{ hour: string; count: number }>(key, "json");
  const count = raw?.hour === hour ? Number(raw.count) || 0 : 0;
  if (count >= limit) return "limited";
  await store.put(key, JSON.stringify({ hour, count: count + 1 }), {
    expirationTtl: 60 * 60 * 2,
  });
  return "ok";
}
