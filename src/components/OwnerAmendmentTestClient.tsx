"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Footer from "@/components/Footer";
import OwnerPortalHeader from "@/components/OwnerPortalHeader";
import {
  listAmendmentTestFixtures,
  seedAmendmentTestFixture,
  type AmendmentTestFixtureSummary,
} from "@/lib/amendment-test-api";
import { SITE } from "@/lib/data";

const OWNER_KEY_STORAGE = "matni-owner-key";

export default function OwnerAmendmentTestClient() {
  const [ownerKey, setOwnerKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
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

  const load = useCallback(
    async (key: string) => {
      setLoading(true);
      setError("");
      try {
        const next = await listAmendmentTestFixtures(key, manageBase);
        setFixtures(next);
        if (next[0]) setLatest(next[0]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load fixtures");
      } finally {
        setLoading(false);
      }
    },
    [manageBase],
  );

  useEffect(() => {
    const stored = sessionStorage.getItem(OWNER_KEY_STORAGE)?.trim() ?? "";
    if (stored) {
      setOwnerKey(stored);
      setSavedKey(stored);
      void load(stored);
    }
  }, [load]);

  async function onUnlock(event: FormEvent) {
    event.preventDefault();
    const key = ownerKey.trim();
    if (!key) {
      setError("Enter OWNER_ACCESS_KEY");
      return;
    }
    sessionStorage.setItem(OWNER_KEY_STORAGE, key);
    setSavedKey(key);
    setMessage("");
    await load(key);
  }

  async function onSeed() {
    if (!savedKey) {
      setError("Unlock with OWNER_ACCESS_KEY first");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await seedAmendmentTestFixture({
        ownerKey: savedKey,
        manageBookingBaseUrl: manageBase,
      });
      setLatest(result.fixture);
      setMessage(
        `Created ${result.fixture.customerReference} at ${result.fixture.amountPaidLabel} (live quote; no SumUp charge).`,
      );
      await load(savedKey);
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

        {!savedKey ? (
          <form onSubmit={onUnlock} className="mt-6 space-y-3 rounded-xl border border-[var(--line)] bg-white p-4">
            <label className="block text-sm font-medium">
              OWNER_ACCESS_KEY
              <input
                className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2"
                value={ownerKey}
                onChange={(e) => setOwnerKey(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-[var(--navy)] px-4 py-2 text-sm font-semibold text-white"
            >
              Unlock
            </button>
          </form>
        ) : (
          <div className="mt-6 space-y-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSeed()}
              className="rounded-lg bg-[var(--navy)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create same-fare £45-style test booking"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void load(savedKey)}
              className="ml-3 rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold"
            >
              Refresh list
            </button>
          </div>
        )}

        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="mt-4 text-sm text-emerald-800">{message}</p> : null}

        {latest ? (
          <section className="mt-8 space-y-3 rounded-xl border border-[var(--line)] bg-white p-5">
            <h2 className="text-lg font-semibold">Ready for iPhone test</h2>
            <p className="text-sm text-[var(--muted)]">{latest.warning}</p>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="font-medium">MAT reference</dt>
                <dd className="font-mono text-base">{latest.customerReference}</dd>
              </div>
              <div>
                <dt className="font-medium">Trip</dt>
                <dd>
                  {latest.tripDate} at {latest.tripTime}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Route</dt>
                <dd>
                  {latest.pickupLabel} → {latest.dropoffLabel}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Fare / paid</dt>
                <dd>
                  {latest.amountPaidLabel} (payment status: {latest.paymentStatus || "paid"})
                </dd>
              </div>
              <div>
                <dt className="font-medium">Manage Booking link</dt>
                <dd className="break-all">
                  {latest.manageBookingUrl ? (
                    <a className="text-[var(--navy)] underline" href={latest.manageBookingUrl}>
                      {latest.manageBookingUrl}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
            <p className="text-sm">
              Change <strong>only</strong> 10:00 → 10:15, then Review Changes — expect £0 additional
              payment.
            </p>
          </section>
        ) : null}

        {fixtures.length > 1 ? (
          <section className="mt-8">
            <h3 className="text-sm font-semibold">Recent fixtures</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {fixtures.map((item) => (
                <li key={item.paymentReference} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2">
                  {item.customerReference} · {item.tripDate} {item.tripTime} · {item.amountPaidLabel}
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
