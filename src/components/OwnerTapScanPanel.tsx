"use client";

import { useCallback, useEffect, useState } from "react";
import { emptyTapMetrics, type TapMetricsSnapshot } from "../../shared/tap-page";
import { formatTipGbp } from "../../shared/journey-tip";
import { fetchOwnerTapMetrics } from "@/lib/tap-api";

type OwnerTapScanPanelProps = {
  ownerKey: string;
};

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-white/45">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-white/50">{hint}</p> : null}
    </div>
  );
}

/** Read-only Tap & Scan metrics for the owner dashboard. */
export default function OwnerTapScanPanel({ ownerKey }: OwnerTapScanPanelProps) {
  const [metrics, setMetrics] = useState<TapMetricsSnapshot>(emptyTapMetrics());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchOwnerTapMetrics(ownerKey);
      setMetrics(result.metrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Tap & Scan metrics");
      setMetrics(emptyTapMetrics());
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-4" data-owner-tap-scan>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
          Tap &amp; Scan
        </p>
        <p className="mt-1 text-sm text-white/65">
          Read-only activity from the headrest NFC / QR page at{" "}
          <span className="text-white/85">/tap</span>. Button clicks are counted separately from
          verified tip payments.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-white/45">
          {loading
            ? "Loading…"
            : metrics.updatedAt
              ? `Updated ${new Date(metrics.updatedAt).toLocaleString("en-GB", {
                  timeZone: "Europe/London",
                })}`
              : "No Tap & Scan activity recorded yet"}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-10 rounded-xl border border-white/15 px-3 text-sm font-semibold text-white/80 hover:border-emerald hover:text-emerald"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MetricCard label="Page visits" value={String(metrics.visits)} hint="Landing opens" />
        <MetricCard
          label="Google Review clicks"
          value={String(metrics.reviewClicks)}
          hint="Button opens — not verified reviews"
        />
        <MetricCard
          label="Tip opens"
          value={String(metrics.tipOpens)}
          hint="Opened tip panel"
        />
        <MetricCard
          label="Tips completed"
          value={String(metrics.tipPaymentsCompleted)}
          hint="Verified payments only"
        />
        <MetricCard
          label="Total tips"
          value={formatTipGbp(metrics.tipTotalGbp) || "£0"}
          hint="Gross amount received"
        />
        <MetricCard
          label="Average tip"
          value={formatTipGbp(metrics.tipAverageGbp) || "£0"}
          hint="Completed tips only"
        />
        <MetricCard label="Save Contact clicks" value={String(metrics.contactClicks)} />
        <MetricCard label="Book Again clicks" value={String(metrics.bookClicks)} />
        <MetricCard label="WhatsApp clicks" value={String(metrics.whatsappClicks)} />
      </div>
    </section>
  );
}
