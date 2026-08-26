/**
 * KV store for Personal Quote Codes (individually agreed fares).
 */

import {
  buildPersonalQuoteReservation,
  evaluatePersonalQuote,
  generatePersonalQuoteAttemptId,
  generatePersonalQuoteCode,
  generatePersonalQuoteCustomerToken,
  isPersonalQuoteReservationActive,
  normalizePersonalQuoteCode,
  normalizePersonalQuoteCustomerToken,
  personalQuoteCodeKey,
  personalQuoteCustomerError,
  personalQuoteOpenIndexKey,
  personalQuoteReservationKey,
  personalQuoteTokenKey,
  resolvePersonalQuotePricing,
  PERSONAL_QUOTE_RESERVATION_TTL_SECONDS,
  type PersonalQuoteRecord,
  type PersonalQuoteReservation,
} from "../shared/personal-quote";

const TTL_SECONDS = 60 * 60 * 24 * 120;

type OpenIndex = { codes: string[]; updatedAt: string };

async function readOpenIndex(store: KVNamespace): Promise<string[]> {
  const index = await store.get<OpenIndex>(personalQuoteOpenIndexKey(), "json");
  return Array.isArray(index?.codes) ? index.codes.map(String) : [];
}

async function writeOpenIndex(store: KVNamespace, codes: string[]): Promise<void> {
  const unique = [...new Set(codes.map((c) => normalizePersonalQuoteCode(c)).filter(Boolean))].slice(
    0,
    300,
  );
  const payload: OpenIndex = { codes: unique, updatedAt: new Date().toISOString() };
  await store.put(personalQuoteOpenIndexKey(), JSON.stringify(payload), {
    expirationTtl: TTL_SECONDS,
  });
}

export async function savePersonalQuote(
  store: KVNamespace,
  record: PersonalQuoteRecord,
): Promise<void> {
  const code = normalizePersonalQuoteCode(record.code);
  let customerToken = record.customerToken
    ? normalizePersonalQuoteCustomerToken(record.customerToken)
    : "";
  if (!customerToken || customerToken.length < 32) {
    customerToken = generatePersonalQuoteCustomerToken();
  }
  const toSave: PersonalQuoteRecord = { ...record, code, customerToken };
  await store.put(personalQuoteCodeKey(code), JSON.stringify(toSave), {
    expirationTtl: TTL_SECONDS,
  });
  await store.put(personalQuoteTokenKey(customerToken), code, {
    expirationTtl: TTL_SECONDS,
  });

  const open = await readOpenIndex(store);
  const redeemable = evaluatePersonalQuote(toSave).ok;
  const next = redeemable
    ? [code, ...open.filter((c) => c !== code)]
    : open.filter((c) => c !== code);
  await writeOpenIndex(store, next);
}

export async function getPersonalQuoteByCode(
  store: KVNamespace,
  code: string,
): Promise<PersonalQuoteRecord | null> {
  const normalized = normalizePersonalQuoteCode(code);
  if (!normalized) return null;
  const record = await store.get<PersonalQuoteRecord>(personalQuoteCodeKey(normalized), "json");
  if (!record?.code || !Number.isFinite(record.agreedAmount)) return null;
  return { ...record, code: normalizePersonalQuoteCode(record.code) };
}

export async function getPersonalQuoteByCustomerToken(
  store: KVNamespace,
  token: string,
): Promise<PersonalQuoteRecord | null> {
  const normalized = normalizePersonalQuoteCustomerToken(token);
  if (!normalized || normalized.length < 32) return null;
  const code = await store.get(personalQuoteTokenKey(normalized));
  if (!code) return null;
  const record = await getPersonalQuoteByCode(store, code);
  if (!record) return null;
  // Token on record must match (prevents stale token→code maps after rotation).
  if (
    record.customerToken &&
    normalizePersonalQuoteCustomerToken(record.customerToken) !== normalized
  ) {
    return null;
  }
  return record;
}

/** Ensure legacy records get a customerToken + token index entry. */
export async function ensurePersonalQuoteCustomerToken(
  store: KVNamespace,
  record: PersonalQuoteRecord,
): Promise<PersonalQuoteRecord> {
  const existing = record.customerToken
    ? normalizePersonalQuoteCustomerToken(record.customerToken)
    : "";
  if (existing.length >= 32) {
    const mapped = await store.get(personalQuoteTokenKey(existing));
    if (mapped === normalizePersonalQuoteCode(record.code)) {
      return { ...record, customerToken: existing };
    }
  }
  const customerToken = generatePersonalQuoteCustomerToken();
  const next: PersonalQuoteRecord = { ...record, customerToken };
  await savePersonalQuote(store, next);
  return next;
}

export async function listOpenPersonalQuotes(
  store: KVNamespace,
): Promise<PersonalQuoteRecord[]> {
  const codes = await readOpenIndex(store);
  const records: PersonalQuoteRecord[] = [];
  for (const code of codes) {
    const record = await getPersonalQuoteByCode(store, code);
    if (record && evaluatePersonalQuote(record).ok) {
      records.push(await ensurePersonalQuoteCustomerToken(store, record));
    }
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createPersonalQuote(
  store: KVNamespace,
  input: {
    customerName: string;
    customerEmail?: string;
    customerMobile?: string;
    agreedAmount: number;
    standardWebsiteAmount?: number;
    discountAmount?: number;
    pickupLabel?: string;
    dropoffLabel?: string;
    notes?: string;
    singleUse: boolean;
    expiresOn: string;
    expressDropOffSelected?: boolean;
    expressDropOffFee?: number;
    expressDropOffAirport?: "BFS" | "BHD" | null;
    airportCode?: "BFS" | "BHD" | "DUB" | "LDY" | null;
    fromAirport?: boolean;
  },
): Promise<PersonalQuoteRecord> {
  const pricing = resolvePersonalQuotePricing({
    agreedAmount: input.agreedAmount,
    standardWebsiteAmount: input.standardWebsiteAmount,
    discountAmount: input.discountAmount,
  });
  if (!pricing.ok) {
    throw new Error(pricing.error);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn)) {
    throw new Error("Expiry date must be YYYY-MM-DD");
  }
  const customerName = input.customerName.trim();
  if (!customerName) {
    throw new Error("Customer name is required");
  }

  let code = generatePersonalQuoteCode();
  for (let attempt = 0; attempt < 8; attempt++) {
    const existing = await getPersonalQuoteByCode(store, code);
    if (!existing) break;
    code = generatePersonalQuoteCode();
  }

  let customerToken = generatePersonalQuoteCustomerToken();
  for (let attempt = 0; attempt < 8; attempt++) {
    const existingCode = await store.get(personalQuoteTokenKey(customerToken));
    if (!existingCode) break;
    customerToken = generatePersonalQuoteCustomerToken();
  }

  const record: PersonalQuoteRecord = {
    code,
    customerToken,
    customerName,
    ...(input.customerEmail?.trim() ? { customerEmail: input.customerEmail.trim() } : {}),
    ...(input.customerMobile?.trim() ? { customerMobile: input.customerMobile.trim() } : {}),
    agreedAmount: pricing.agreedAmount,
    ...(typeof pricing.standardWebsiteAmount === "number"
      ? { standardWebsiteAmount: pricing.standardWebsiteAmount }
      : {}),
    ...(typeof pricing.discountAmount === "number"
      ? { discountAmount: pricing.discountAmount }
      : {}),
    ...(input.pickupLabel?.trim() ? { pickupLabel: input.pickupLabel.trim() } : {}),
    ...(input.dropoffLabel?.trim() ? { dropoffLabel: input.dropoffLabel.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim().slice(0, 500) } : {}),
    ...(typeof input.expressDropOffSelected === "boolean"
      ? { expressDropOffSelected: input.expressDropOffSelected }
      : {}),
    ...(typeof input.expressDropOffFee === "number"
      ? { expressDropOffFee: Math.round(input.expressDropOffFee * 100) / 100 }
      : {}),
    ...(input.expressDropOffAirport !== undefined
      ? { expressDropOffAirport: input.expressDropOffAirport }
      : {}),
    ...(input.airportCode !== undefined ? { airportCode: input.airportCode } : {}),
    ...(typeof input.fromAirport === "boolean" ? { fromAirport: input.fromAirport } : {}),
    singleUse: Boolean(input.singleUse),
    active: true,
    createdAt: new Date().toISOString(),
    expiresOn: input.expiresOn,
  };

  await savePersonalQuote(store, record);
  return record;
}

/**
 * Mark single-use quote consumed after successful payment only.
 * Idempotent for the same checkout / payment reference.
 */
export async function markPersonalQuoteUsed(
  store: KVNamespace,
  code: string,
  paymentReference: string,
  checkoutId: string,
): Promise<void> {
  const record = await getPersonalQuoteByCode(store, code);
  if (!record) return;

  if (record.usedAt) {
    if (
      record.associatedCheckoutId === checkoutId ||
      record.associatedPaymentReference === paymentReference
    ) {
      await clearPersonalQuoteReservation(store, code);
      return;
    }
    return;
  }

  if (!record.singleUse) {
    // Multi-use quotes stay active; still stamp last successful payment for audit.
    await savePersonalQuote(store, {
      ...record,
      associatedPaymentReference: paymentReference,
      associatedCheckoutId: checkoutId,
    });
    await clearPersonalQuoteReservation(store, code);
    return;
  }

  await savePersonalQuote(store, {
    ...record,
    usedAt: new Date().toISOString(),
    associatedPaymentReference: paymentReference,
    associatedCheckoutId: checkoutId,
  });
  await clearPersonalQuoteReservation(store, code);
}

export async function deactivatePersonalQuote(
  store: KVNamespace,
  code: string,
): Promise<PersonalQuoteRecord | null> {
  const record = await getPersonalQuoteByCode(store, code);
  if (!record) return null;
  const next = { ...record, active: false };
  await savePersonalQuote(store, next);
  return next;
}

export async function getPersonalQuoteReservation(
  store: KVNamespace,
  code: string,
): Promise<PersonalQuoteReservation | null> {
  const normalized = normalizePersonalQuoteCode(code);
  if (!normalized) return null;
  const reservation = await store.get<PersonalQuoteReservation>(
    personalQuoteReservationKey(normalized),
    "json",
  );
  if (!reservation?.code || !reservation.attemptId) return null;
  return {
    ...reservation,
    code: normalizePersonalQuoteCode(reservation.code),
  };
}

async function putPersonalQuoteReservation(
  store: KVNamespace,
  reservation: PersonalQuoteReservation,
): Promise<void> {
  const code = normalizePersonalQuoteCode(reservation.code);
  const ttlMs = Math.max(60_000, Date.parse(reservation.expiresAt) - Date.now());
  const expirationTtl = Math.min(
    PERSONAL_QUOTE_RESERVATION_TTL_SECONDS,
    Math.ceil(ttlMs / 1000),
  );
  await store.put(
    personalQuoteReservationKey(code),
    JSON.stringify({ ...reservation, code }),
    { expirationTtl: Math.max(60, expirationTtl) },
  );
}

export async function clearPersonalQuoteReservation(
  store: KVNamespace,
  code: string,
  options?: { attemptId?: string; checkoutId?: string },
): Promise<void> {
  const normalized = normalizePersonalQuoteCode(code);
  if (!normalized) return;
  const existing = await getPersonalQuoteReservation(store, normalized);
  if (!existing) return;
  if (options?.attemptId && existing.attemptId !== options.attemptId) return;
  if (options?.checkoutId && existing.checkoutId && existing.checkoutId !== options.checkoutId) {
    return;
  }
  await store.delete(personalQuoteReservationKey(normalized));
}

/**
 * Acquire a short-lived reservation for a single-use quote before SumUp create.
 * Best-effort under KV (no Durable Objects / conditional writes in this project).
 *
 * Returns:
 * - acquired: caller may create a new SumUp checkout
 * - reserved: another active attempt holds the lock
 */
export async function tryAcquirePersonalQuoteReservation(
  store: KVNamespace,
  code: string,
  options?: { checkoutReference?: string; now?: Date },
): Promise<
  | { ok: true; reservation: PersonalQuoteReservation }
  | { ok: false; error: "reserved"; message: string; reservation: PersonalQuoteReservation }
> {
  const normalized = normalizePersonalQuoteCode(code);
  const now = options?.now ?? new Date();
  const existing = await getPersonalQuoteReservation(store, normalized);

  if (isPersonalQuoteReservationActive(existing, now)) {
    return {
      ok: false,
      error: "reserved",
      message: personalQuoteCustomerError("reserved"),
      reservation: existing!,
    };
  }

  const reservation = buildPersonalQuoteReservation({
    code: normalized,
    attemptId: generatePersonalQuoteAttemptId(),
    checkoutReference: options?.checkoutReference,
    now,
  });
  await putPersonalQuoteReservation(store, reservation);

  // Best-effort race check: if another writer won, abort before SumUp create.
  const verified = await getPersonalQuoteReservation(store, normalized);
  if (
    !verified ||
    verified.attemptId !== reservation.attemptId ||
    !isPersonalQuoteReservationActive(verified, now)
  ) {
    return {
      ok: false,
      error: "reserved",
      message: personalQuoteCustomerError("reserved"),
      reservation:
        verified && isPersonalQuoteReservationActive(verified, now) ? verified : reservation,
    };
  }

  return { ok: true, reservation: verified };
}

/** Attach SumUp checkout id to an existing reservation owned by this attempt. */
export async function bindPersonalQuoteReservationCheckout(
  store: KVNamespace,
  code: string,
  attemptId: string,
  checkoutId: string,
  options?: { checkoutReference?: string; paymentUrl?: string },
): Promise<void> {
  const existing = await getPersonalQuoteReservation(store, code);
  if (!existing || existing.attemptId !== attemptId) return;
  if (!isPersonalQuoteReservationActive(existing)) return;
  await putPersonalQuoteReservation(store, {
    ...existing,
    checkoutId: checkoutId.trim(),
    ...(options?.checkoutReference ? { checkoutReference: options.checkoutReference } : {}),
    ...(options?.paymentUrl ? { paymentUrl: options.paymentUrl } : {}),
  });
}
