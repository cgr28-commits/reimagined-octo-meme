/**
 * KV owner-list index for bespoke quote requests.
 *
 * The Durable Object holds the authoritative record; KV only holds one small
 * index entry per request (key + list metadata) so the Owner Dashboard can list
 * requests without visiting every Durable Object. One key per request means no
 * shared read-modify-write list, so concurrent requests cannot overwrite each
 * other. KV is eventually consistent: the list may lag by up to ~60 seconds.
 */

import {
  toBespokeQuoteOwnerSummary,
  type BespokeQuoteOwnerSummary,
  type BespokeQuoteRecord,
} from "../shared/bespoke-quote";

export const BESPOKE_INDEX_PREFIX = "bq:idx:";
const INDEX_TTL_SECONDS = 60 * 60 * 24 * 400;
const MAX_TIME = 9_999_999_999_999;

/** Newest first: KV lists keys in ascending order, so invert the timestamp. */
export function bespokeIndexKey(record: Pick<BespokeQuoteRecord, "createdAt" | "reference">): string {
  const ms = Date.parse(record.createdAt);
  const inverted = String(MAX_TIME - (Number.isFinite(ms) ? ms : 0)).padStart(13, "0");
  return `${BESPOKE_INDEX_PREFIX}${inverted}:${record.reference}`;
}

export async function writeBespokeIndexEntry(store: KVNamespace, record: BespokeQuoteRecord): Promise<void> {
  const summary = toBespokeQuoteOwnerSummary(record);
  await store.put(bespokeIndexKey(record), "", { metadata: summary, expirationTtl: INDEX_TTL_SECONDS });
}

export async function listBespokeIndex(
  store: KVNamespace,
  options: { cursor?: string; limit?: number } = {},
): Promise<{ items: BespokeQuoteOwnerSummary[]; cursor?: string }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const page = await store.list<BespokeQuoteOwnerSummary>({
    prefix: BESPOKE_INDEX_PREFIX,
    limit,
    ...(options.cursor ? { cursor: options.cursor } : {}),
  });
  const items = page.keys
    .map((k) => k.metadata)
    .filter((m): m is BespokeQuoteOwnerSummary => Boolean(m && typeof m.reference === "string"));
  return { items, ...(page.list_complete ? {} : { cursor: (page as { cursor?: string }).cursor }) };
}
