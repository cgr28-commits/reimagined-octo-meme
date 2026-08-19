"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  seedAmendmentTestFixture,
  type AmendmentTestFixtureSummary,
} from "@/lib/amendment-test-api";

type OwnerAmendmentTestPanelProps = {
  ownerKey: string;
};

/**
 * Owner Dashboard control — uses the already-authenticated dashboard session.
 * Never displays or asks for OWNER_ACCESS_KEY.
 */
export default function OwnerAmendmentTestPanel({ ownerKey }: OwnerAmendmentTestPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fixture, setFixture] = useState<AmendmentTestFixtureSummary | null>(null);

  const manageBase = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin.replace(/\/$/, "");
  }, []);

  async function onCreate() {
    if (!ownerKey.trim()) {
      setError("Owner session missing — unlock the Owner Dashboard first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await seedAmendmentTestFixture({
        ownerKey,
        manageBookingBaseUrl: manageBase,
      });
      setFixture(result.fixture);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create test fixture");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 text-white">
      <h2 className="text-base font-semibold">Same-fare amendment test</h2>
      <p className="mt-1 text-sm text-white/60">
        Preview/test only. Creates a fully-paid Five Corners → BFS fixture at the live website
        fare — no SumUp / no card charge. Does not change MAT-3817 or pricing.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onCreate()}
          className="rounded-lg bg-emerald px-4 py-2 text-sm font-semibold text-navy disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create same-fare test booking"}
        </button>
        <Link
          href="/owner/amendment-test/"
          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white/80"
        >
          Open test page
        </Link>
      </div>
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      {fixture ? (
        <div className="mt-4 space-y-2 rounded-lg border border-white/15 bg-black/20 p-3 text-sm">
          <p>
            <span className="text-white/50">MAT:</span>{" "}
            <span className="font-mono font-semibold">{fixture.customerReference}</span>
          </p>
          <p>
            <span className="text-white/50">Schedule:</span> {fixture.tripDate} at{" "}
            {fixture.tripTime}
          </p>
          <p>
            <span className="text-white/50">Paid:</span> {fixture.amountPaidLabel} (fixture — no
            live card)
          </p>
          {fixture.manageBookingUrl ? (
            <p className="break-all">
              <span className="text-white/50">Manage Booking:</span>{" "}
              <a className="underline text-emerald" href={fixture.manageBookingUrl}>
                {fixture.manageBookingUrl}
              </a>
            </p>
          ) : null}
          <p className="text-white/55">
            iPhone test: change only 10:00 → 10:15, then Review Changes (expect £0 top-up).
          </p>
        </div>
      ) : null}
    </section>
  );
}
