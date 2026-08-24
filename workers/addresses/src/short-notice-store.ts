/**
 * KV store for short-notice booking requests (awaiting Owner approval → SumUp).
 */

import type { ShortNoticeBookingRecord } from "../shared/short-notice-booking";
import {
  isShortNoticeActiveOnDashboard,
  isShortNoticeArchivedRecord,
  shortNoticeAcceptTokenKey,
  shortNoticeArchivedIndexKey,
  shortNoticeOpenIndexKey,
  shortNoticeRefKey,
  shortNoticeTokenKey,
} from "../shared/short-notice-booking";

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
  await store.put(key, JSON.stringify(payload), {
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

  const open = await readRefIndex(store, shortNoticeOpenIndexKey());
  const keepOpen = isShortNoticeActiveOnDashboard(record);
  const nextOpen = keepOpen
    ? [record.reference, ...open.filter((r) => r !== record.reference)]
    : open.filter((r) => r !== record.reference);
  await writeRefIndex(store, shortNoticeOpenIndexKey(), nextOpen);

  const archived = await readRefIndex(store, shortNoticeArchivedIndexKey());
  const keepArchived = isShortNoticeArchivedRecord(record);
  const nextArchived = keepArchived
    ? [record.reference, ...archived.filter((r) => r !== record.reference)]
    : archived.filter((r) => r !== record.reference);
  await writeRefIndex(store, shortNoticeArchivedIndexKey(), nextArchived);
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
  const refs = await readRefIndex(store, shortNoticeOpenIndexKey());
  const records: ShortNoticeBookingRecord[] = [];
  for (const reference of refs) {
    const record = await getShortNoticeByReference(store, reference);
    if (record && isShortNoticeActiveOnDashboard(record)) {
      records.push(record);
    }
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listArchivedShortNoticeBookings(
  store: KVNamespace,
): Promise<ShortNoticeBookingRecord[]> {
  const refs = await readRefIndex(store, shortNoticeArchivedIndexKey());
  const records: ShortNoticeBookingRecord[] = [];
  for (const reference of refs) {
    const record = await getShortNoticeByReference(store, reference);
    if (record && isShortNoticeArchivedRecord(record)) {
      records.push(record);
    }
  }
  return records.sort((a, b) => {
    const aAt = a.removedFromDashboardAt || a.declinedAlternativeAt || a.declinedAt || a.updatedAt;
    const bAt = b.removedFromDashboardAt || b.declinedAlternativeAt || b.declinedAt || b.updatedAt;
    return bAt.localeCompare(aAt);
  });
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
