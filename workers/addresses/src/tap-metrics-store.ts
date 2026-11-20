/**
 * Owner Tap & Scan counters in KV. Click events are anonymous; tip totals
 * only increase after a verified paid tip with source=tap.
 */
import {
  applyTapEvent,
  applyTapTipPaid,
  emptyTapMetrics,
  type TapEventName,
  type TapMetricsSnapshot,
} from "../shared/tap-page";
import type { JourneyTipRecord } from "../shared/journey-tip";

const TAP_METRICS_KEY = "tap-metrics:v1";
const TIP_PREFIX = "tip:";
const METRICS_TTL_SECONDS = 60 * 60 * 24 * 400;
const TIP_TTL_SECONDS = 60 * 60 * 24 * 45;

export async function readTapMetrics(store: KVNamespace): Promise<TapMetricsSnapshot> {
  const stored = await store.get<TapMetricsSnapshot>(TAP_METRICS_KEY, "json");
  if (!stored || typeof stored !== "object") return emptyTapMetrics();
  return {
    ...emptyTapMetrics(),
    ...stored,
    tipAverageGbp: Number(stored.tipAverageGbp) || 0,
    tipTotalGbp: Number(stored.tipTotalGbp) || 0,
  };
}

export async function writeTapMetrics(store: KVNamespace, metrics: TapMetricsSnapshot): Promise<void> {
  await store.put(TAP_METRICS_KEY, JSON.stringify(metrics), {
    expirationTtl: METRICS_TTL_SECONDS,
  });
}

export async function recordTapClickEvent(
  store: KVNamespace,
  event: TapEventName,
  nowIso = new Date().toISOString(),
): Promise<void> {
  const next = applyTapEvent(await readTapMetrics(store), event, nowIso);
  await writeTapMetrics(store, next);
}

/** Count a verified paid NFC tip once. Returns the record with tapMetricsRecordedAt set. */
export async function recordTapTipMetricsIfNeeded(
  store: KVNamespace,
  record: JourneyTipRecord,
): Promise<JourneyTipRecord> {
  if (record.source !== "tap" || record.status !== "paid") return record;
  if (record.tapMetricsRecordedAt) return record;
  if (typeof record.amountGbp !== "number" || record.amountGbp <= 0) return record;
  const nowIso = new Date().toISOString();
  const metrics = applyTapTipPaid(await readTapMetrics(store), record.amountGbp, nowIso);
  await writeTapMetrics(store, metrics);
  const next = { ...record, tapMetricsRecordedAt: nowIso };
  await store.put(`${TIP_PREFIX}${next.tipToken}`, JSON.stringify(next), {
    expirationTtl: TIP_TTL_SECONDS,
  });
  return next;
}
