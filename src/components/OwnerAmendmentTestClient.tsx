"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Footer from "@/components/Footer";
import OwnerPortalHeader from "@/components/OwnerPortalHeader";
import {
  listAmendmentTestFixtures,
  seedAmendmentTestFixture,
  type AmendmentTestFixtureSummary,
} from "@/lib/amendment-test-api";
import { SITE } from "@/lib/data";

const OWNER_KEY_STORAGE = "matni-owner-key";

/** Read the existing Owner Dashboard session — never render the value. */
function readOwnerSessionKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return (
      sessionStorage.getItem(OWNER_KEY_STORAGE)?.trim() ||
      localStorage.getItem(OWNER_KEY_STORAGE)?.trim() ||
      ""
    );
  } catch {
    return "";
  }
}

function FixtureDetails({ fixture }: { fixture: AmendmentTestFixtureSummary }) {
  return (
    <section className="mt-8 space-y-3 rounded-xl border border-[var(--line)] bg-white p-5">
      <h2 className="text-lg font-semibold">Ready for iPhone test</h2>
      <p className="text-sm text-[var(--muted)]">{fixture.warning}</p>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="font-medium">MAT reference</dt>
          <dd className="font-mono text-base">{fixture.customerReference}</dd>
        </div>
        <div>
          <dt className="font-medium">Trip</dt>
          <dd>
            {fixture.tripDate} at {fixture.tripTime}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Route</dt>
          <dd>
            {fixture.pickupLabel} → {fixture.dropoffLabel}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Fare / paid</dt>
          <dd>
            {fixture.amountPaidLabel} (payment status: {fixture.paymentStatus || "paid"})
          </dd>
        </div>
        <div>
          <dt className="font-medium">Manage Booking link</dt>
          <dd className="break-all">
            {fixture.manageBookingUrl ? (
              <a className="text-[var(--navy)] underline" href={fixture.manageBookingUrl}>
                {fixture.manageBookingUrl}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
      <p className="text-sm">
        Change only <strong>10:00 → 10:15</strong>, then Review Changes — expect £0 additional
        payment. No live card charge.
      </p>
    </section>
  );
}

export default function OwnerAmendmentTestClient() {
  const [sessionReady, setSessionReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [fixtures, setFixtures] = useState<AmendmentTestFixtureSummary[]>([]);
  const [latest, setLatest] = useState<AmendmentTestFixtureSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const manageBase = useMemo(() => {
    if (typeof window === "undefined") {
      return SITE.url.replace(/\/$/, "");
    }
    return window.location.origin.replace(/\/$/, "");
  }, []);

  const ownerDashboardHref = useMemo(() => {
    const returnTo = encodeURIComponent("/owner/amendment-test/");
    return `/owner/?returnTo=${returnTo}`;
  }, []);

  const load = useCallback(async () => {
    const key = readOwnerSessionKey();
    if (!key) {
      setHasSession(false);
      setSessionReady(true);
      return;
    }
    setHasSession(true);
    setLoading(true);
    setError("");
    try {
      const next = await listAmendmentTestFixtures(key, manageBase);
      setFixtures(next);
      if (next[0]) setLatest(next[0]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load fixtures — unlock the Owner Dashboard on this preview site first.",
      );
      setHasSession(false);
    } finally {
      setLoading(false);
      setSessionReady(true);
    }
  }, [manageBase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSeed() {
    const key = readOwnerSessionKey();
    if (!key) {
      setError("Unlock the Owner Dashboard on this preview site first, then return here.");
      setHasSession(false);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await seedAmendmentTestFixture({
        ownerKey: key,
        manageBookingBaseUrl: manageBase,
      });
      setLatest(result.fixture);
      setMessage(
        `Created ${result.fixture.customerReference} at ${result.fixture.amountPaidLabel} (live quote; no SumUp charge).`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--cream)] text-[var(--navy)]">
      <OwnerPortalHeader title="Same-fare amendment test" />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Creates an isolated Manage Booking fixture: Five Corners Guest Inn → Belfast
          International, fully paid at the live website fare, with free amendment available.
          No SumUp checkout and no live card charge. Excluded from Upcoming Jobs. Does not
          change MAT-3817 or production pricing.
        </p>

        {!sessionReady ? (
          <p className="mt-6 text-sm text-[var(--muted)]">Checking Owner Dashboard session…</p>
        ) : !hasSession ? (
          <div className="mt-6 space-y-3 rounded-xl border border-[var(--line)] bg-white p-4">
            <p className="text-sm leading-relaxed">
              This page uses your existing Owner Dashboard session on this preview site. It does
              not ask you to type or display any access key.
            </p>
            <Link
              href={ownerDashboardHref}
              className="inline-flex rounded-lg bg-[var(--navy)] px-4 py-3 text-sm font-semibold text-white"
            >
              Open Owner Dashboard to unlock
            </Link>
            <p className="text-xs text-[var(--muted)]">
              After you unlock the dashboard once on this preview, return here — or use the
              “Same-fare amendment test” button on the dashboard.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSeed()}
              className="rounded-lg bg-[var(--navy)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create same-fare test booking"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void load()}
              className="ml-3 rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold"
            >
              Refresh
            </button>
          </div>
        )}

        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="mt-4 text-sm text-emerald-800">{message}</p> : null}
        {latest ? <FixtureDetails fixture={latest} /> : null}

        {fixtures.length > 1 ? (
          <section className="mt-8">
            <h3 className="text-sm font-semibold">Recent fixtures</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {fixtures.map((item) => (
                <li
                  key={item.paymentReference}
                  className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
                >
                  {item.customerReference} · {item.tripDate} {item.tripTime} ·{" "}
                  {item.amountPaidLabel}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}
