/**
 * KV store for Personal Quote Codes (individually agreed fares).
 */

import {
  evaluatePersonalQuote,
  generatePersonalQuoteCode,
  normalizePersonalQuoteCode,
  personalQuoteCodeKey,
  personalQuoteOpenIndexKey,
  type PersonalQuoteRecord,
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
  const toSave: PersonalQuoteRecord = { ...record, code };
  await store.put(personalQuoteCodeKey(code), JSON.stringify(toSave), {
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

export async function listOpenPersonalQuotes(
  store: KVNamespace,
): Promise<PersonalQuoteRecord[]> {
  const codes = await readOpenIndex(store);
  const records: PersonalQuoteRecord[] = [];
  for (const code of codes) {
    const record = await getPersonalQuoteByCode(store, code);
    if (record && evaluatePersonalQuote(record).ok) {
      records.push(record);
    }
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createPersonalQuote(
  store: KVNamespace,
  input: {
    customerName: string;
    customerEmail?: string;
    agreedAmount: number;
    standardWebsiteAmount?: number;
    pickupLabel?: string;
    dropoffLabel?: string;
    notes?: string;
    singleUse: boolean;
    expiresOn: string;
  },
): Promise<PersonalQuoteRecord> {
  const agreedAmount = Math.round(Number(input.agreedAmount) * 100) / 100;
  if (!Number.isFinite(agreedAmount) || agreedAmount < 1 || agreedAmount > 5000) {
    throw new Error("Agreed price must be between £1 and £5000");
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

  const record: PersonalQuoteRecord = {
    code,
    customerName,
    ...(input.customerEmail?.trim() ? { customerEmail: input.customerEmail.trim() } : {}),
    agreedAmount,
    ...(typeof input.standardWebsiteAmount === "number" && Number.isFinite(input.standardWebsiteAmount)
      ? { standardWebsiteAmount: Math.round(input.standardWebsiteAmount * 100) / 100 }
      : {}),
    ...(input.pickupLabel?.trim() ? { pickupLabel: input.pickupLabel.trim() } : {}),
    ...(input.dropoffLabel?.trim() ? { dropoffLabel: input.dropoffLabel.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim().slice(0, 500) } : {}),
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
    return;
  }

  await savePersonalQuote(store, {
    ...record,
    usedAt: new Date().toISOString(),
    associatedPaymentReference: paymentReference,
    associatedCheckoutId: checkoutId,
  });
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
