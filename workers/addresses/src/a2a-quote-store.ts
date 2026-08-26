/**
 * KV store for Address-to-Address personalised quote requests.
 */

import type { A2aQuoteRequestRecord } from "../shared/a2a-personalised-quote";
import {
  a2aQuoteCheckoutKey,
  a2aQuoteOpenIndexKey,
  a2aQuoteRefKey,
  a2aQuoteTokenKey,
  isA2aQuoteOpenStatus,
} from "../shared/a2a-personalised-quote";

const TTL_SECONDS = 60 * 60 * 24 * 45;

type RefIndex = { references: string[]; updatedAt: string };

async function readRefIndex(store: KVNamespace, key: string): Promise<string[]> {
  const index = await store.get<RefIndex>(key, "json");
  return Array.isArray(index?.references) ? index.references.map(String) : [];
}

async function writeRefIndex(
  store: KVNamespace,
  key: string,
  references: string[],
): Promise<void> {
  const unique = [...new Set(references.map((r) => r.trim()).filter(Boolean))].slice(0, 300);
  const payload: RefIndex = { references: unique, updatedAt: new Date().toISOString() };
  await store.put(key, JSON.stringify(payload), { expirationTtl: TTL_SECONDS });
}

export async function saveA2aQuoteRequest(
  store: KVNamespace,
  record: A2aQuoteRequestRecord,
): Promise<void> {
  const json = JSON.stringify(record);
  await store.put(a2aQuoteRefKey(record.reference), json, { expirationTtl: TTL_SECONDS });
  await store.put(a2aQuoteTokenKey(record.paymentToken), record.reference, {
    expirationTtl: TTL_SECONDS,
  });
  if (record.checkoutId?.trim()) {
    await store.put(a2aQuoteCheckoutKey(record.checkoutId), record.reference, {
      expirationTtl: TTL_SECONDS,
    });
  }

  const open = await readRefIndex(store, a2aQuoteOpenIndexKey());
  const keepOpen = isA2aQuoteOpenStatus(record.status);
  const nextOpen = keepOpen
    ? [record.reference, ...open.filter((r) => r !== record.reference)]
    : open.filter((r) => r !== record.reference);
  await writeRefIndex(store, a2aQuoteOpenIndexKey(), nextOpen);
}

export async function getA2aQuoteByReference(
  store: KVNamespace,
  reference: string,
): Promise<A2aQuoteRequestRecord | null> {
  const record = await store.get<A2aQuoteRequestRecord>(a2aQuoteRefKey(reference), "json");
  if (!record?.reference || !record.paymentToken) return null;
  return record;
}

export async function getA2aQuoteByToken(
  store: KVNamespace,
  token: string,
): Promise<A2aQuoteRequestRecord | null> {
  const reference = await store.get(a2aQuoteTokenKey(token.trim()));
  if (!reference?.trim()) return null;
  return getA2aQuoteByReference(store, reference.trim());
}

export async function listOpenA2aQuoteRequests(
  store: KVNamespace,
): Promise<A2aQuoteRequestRecord[]> {
  const refs = await readRefIndex(store, a2aQuoteOpenIndexKey());
  const records: A2aQuoteRequestRecord[] = [];
  for (const reference of refs) {
    const record = await getA2aQuoteByReference(store, reference);
    if (record && isA2aQuoteOpenStatus(record.status)) {
      records.push(record);
    }
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function generateA2aQuoteReference(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MATNI-AQ-${stamp}-${rand}`;
}

export function generateA2aPaymentToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
