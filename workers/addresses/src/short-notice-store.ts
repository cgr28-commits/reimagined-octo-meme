/**
 * KV store for short-notice booking requests (awaiting Owner approval → SumUp).
 */

import type { ShortNoticeBookingRecord } from "../shared/short-notice-booking";
import {
  isShortNoticeOpenStatus,
  shortNoticeAcceptTokenKey,
  shortNoticeOpenIndexKey,
  shortNoticeRefKey,
  shortNoticeTokenKey,
} from "../shared/short-notice-booking";

const TTL_SECONDS = 60 * 60 * 24 * 45;

type OpenIndex = { references: string[]; updatedAt: string };

async function readOpenIndex(store: KVNamespace): Promise<string[]> {
  const index = await store.get<OpenIndex>(shortNoticeOpenIndexKey(), "json");
  return Array.isArray(index?.references) ? index.references.map(String) : [];
}

async function writeOpenIndex(store: KVNamespace, references: string[]): Promise<void> {
  const unique = [...new Set(references.map((r) => r.trim()).filter(Boolean))].slice(0, 200);
  const payload: OpenIndex = { references: unique, updatedAt: new Date().toISOString() };
  await store.put(shortNoticeOpenIndexKey(), JSON.stringify(payload), {
    expirationTtl: TTL_SECONDS,
  });
}

export async function saveShortNoticeBooking(
  store: KVNamespace,
  record: ShortNoticeBookingRecord,
): Promise<void> {
  const json = JSON.stringify(record);
  await store.put(shortNoticeRefKey(record.reference), json, { expirationTtl: TTL_SECONDS });
  await store.put(shortNoticeTokenKey(record.paymentToken), record.reference, {
    expirationTtl: TTL_SECONDS,
  });
  if (record.acceptToken?.trim()) {
    await store.put(shortNoticeAcceptTokenKey(record.acceptToken), record.reference, {
      expirationTtl: TTL_SECONDS,
    });
  }

  const open = await readOpenIndex(store);
  const keepOpen = isShortNoticeOpenStatus(record.status);
  const next = keepOpen
    ? [record.reference, ...open.filter((r) => r !== record.reference)]
    : open.filter((r) => r !== record.reference);
  await writeOpenIndex(store, next);
}

export async function getShortNoticeByReference(
  store: KVNamespace,
  reference: string,
): Promise<ShortNoticeBookingRecord | null> {
  const record = await store.get<ShortNoticeBookingRecord>(
    shortNoticeRefKey(reference),
    "json",
  );
  if (!record?.reference || !record.paymentToken) return null;
  return record;
}

export async function getShortNoticeByToken(
  store: KVNamespace,
  token: string,
): Promise<ShortNoticeBookingRecord | null> {
  const reference = await store.get(shortNoticeTokenKey(token.trim()));
  if (!reference?.trim()) return null;
  return getShortNoticeByReference(store, reference.trim());
}

export async function getShortNoticeByAcceptToken(
  store: KVNamespace,
  token: string,
): Promise<ShortNoticeBookingRecord | null> {
  const reference = await store.get(shortNoticeAcceptTokenKey(token.trim()));
  if (!reference?.trim()) return null;
  return getShortNoticeByReference(store, reference.trim());
}

export async function listOpenShortNoticeBookings(
  store: KVNamespace,
): Promise<ShortNoticeBookingRecord[]> {
  const refs = await readOpenIndex(store);
  const records: ShortNoticeBookingRecord[] = [];
  for (const reference of refs) {
    const record = await getShortNoticeByReference(store, reference);
    if (record && isShortNoticeOpenStatus(record.status)) {
      records.push(record);
    }
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function generateShortNoticeReference(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MATNI-SN-${stamp}-${rand}`;
}

export function generatePaymentToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
