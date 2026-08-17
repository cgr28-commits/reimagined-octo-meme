"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { formatUkInstant } from "../../shared/uk-time";
import type { MapMarker } from "@/components/LiveTrackMap";
import { SITE } from "@/lib/data";
import {
  fetchJourneyEvidence,
  type JourneyEvidencePack,
} from "@/lib/tracking-api";

const LiveTrackMap = dynamic(() => import("@/components/LiveTrackMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 w-full items-center justify-center rounded-xl bg-white/5 text-sm text-white/50">
      Loading map…
    </div>
  ),
});

const OWNER_KEY_STORAGE = "matni-owner-key";

/**
 * Owner auth for Journey Evidence matches the existing owner dashboard:
 * sessionStorage key `matni-owner-key` + Worker validation of X-Owner-Key.
 * There is no separate server-side owner session/proxy in this codebase yet;
 * redesigning that is a future hardening task, not in scope for this page.
 */

function yesNo(value: boolean | undefined): string {
  return value ? "YES" : "NO";
}

function recordedOrNot(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed ? formatUkInstant(trimmed) : "Not recorded";
}

function Fact({
  label,
  value,
  derived = false,
}: {
  label: string;
  value: string;
  derived?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-white/40">
        {label}
        {derived ? (
          <span className="ml-2 font-normal normal-case tracking-normal text-amber-200/70">
            (derived)
          </span>
        ) : null}
      </dt>
      <dd className="mt-1 break-words text-sm text-white/90 print:text-black">{value || "—"}</dd>
    </div>
  );
}

type OwnerJourneyEvidenceClientProps = {
  paymentReference?: string;
  token?: string;
};

export default function OwnerJourneyEvidenceClient({
  paymentReference = "",
  token = "",
}: OwnerJourneyEvidenceClientProps) {
  const [ownerKey, setOwnerKey] = useState("");
  const [unlockInput, setUnlockInput] = useState("");
  const [evidence, setEvidence] = useState<JourneyEvidencePack | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = sessionStorage.getItem(OWNER_KEY_STORAGE)?.trim() ?? "";
    if (stored) {
      setOwnerKey(stored);
    }
  }, []);

  const loadEvidence = useCallback(
    async (key: string) => {
      if (!paymentReference && !token) {
        setError("Missing booking reference. Open this page from a paid booking.");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const result = await fetchJourneyEvidence(key, {
          // Prefer payment reference. Token query is only used when the page was
          // opened for a legacy/unlinked job that has no payment reference.
          paymentReference: paymentReference || undefined,
          token: paymentReference ? undefined : token || undefined,
        });
        setEvidence(result.evidence);
      } catch (err) {
        setEvidence(null);
        setError(err instanceof Error ? err.message : "Could not load journey evidence");
      } finally {
        setLoading(false);
      }
    },
    [paymentReference, token],
  );

  useEffect(() => {
    if (!ownerKey) return;
    void loadEvidence(ownerKey);
  }, [ownerKey, loadEvidence]);

  const route = useMemo(
    () => (evidence?.points ?? []).map((point) => ({ lat: point.lat, lng: point.lng })),
    [evidence],
  );

  const markers = useMemo((): MapMarker[] => {
    if (!evidence?.points.length) return [];
    const first = evidence.points[0];
    const last = evidence.points[evidence.points.length - 1];
    const list: MapMarker[] = [
      { lat: first.lat, lng: first.lng, label: "Tracking start" },
    ];
    if (last && (last.lat !== first.lat || last.lng !== first.lng)) {
      list.push({ lat: last.lat, lng: last.lng, label: "Tracking end" });
    }
    return list;
  }, [evidence]);

  function unlock(event: FormEvent) {
    event.preventDefault();
    const key = unlockInput.trim();
    if (!key) {
      setError("Enter your owner access key");
      return;
    }
    sessionStorage.setItem(OWNER_KEY_STORAGE, key);
    setOwnerKey(key);
    setUnlockInput("");
  }

  function downloadPdf() {
    window.print();
  }

  if (!ownerKey) {
    return (
      <main className="mx-auto min-h-screen max-w-lg px-4 py-10 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald">Owner only</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Journey Evidence</h1>
        <p className="mt-2 text-sm text-white/60">{SITE.name}</p>
        <p className="mt-4 text-sm text-white/70">
          Sign in with the same owner access key used on the owner dashboard. This page reuses the
          existing owner sessionStorage pattern — it does not introduce a new auth system. Historical
          GPS evidence is never shown to customers.
        </p>
        <form onSubmit={unlock} className="mt-6 space-y-3">
          <label className="block text-sm text-white/70">
            Owner access key
            <input
              type="password"
              autoComplete="current-password"
              value={unlockInput}
              onChange={(event) => setUnlockInput(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-navy-light px-3 py-2.5 text-white"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy"
          >
            Unlock evidence
          </button>
        </form>
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
        <Link href="/owner/" className="mt-6 inline-block text-sm text-emerald underline">
          Back to owner dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl overflow-x-clip px-4 py-6 text-white sm:px-6 sm:py-8 lg:px-8 print:max-w-none print:bg-white print:text-black">
      <div className="print:hidden mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/owner/" className="text-sm text-emerald underline">
          ← Owner dashboard
        </Link>
        <button
          type="button"
          onClick={() => void loadEvidence(ownerKey)}
          disabled={loading}
          className="min-h-11 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      <header className="border-b border-white/10 pb-5 print:border-black/20">
        <div className="flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-light.png"
            alt={SITE.name}
            className="h-12 w-auto print:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt={SITE.name}
            className="hidden h-14 w-auto print:block"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald print:text-navy">
              Owner only · Confidential
            </p>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">Journey Evidence</h1>
            <p className="mt-1 text-sm text-white/65 print:text-black/70">{SITE.name}</p>
          </div>
        </div>
        {evidence?.generatedAt ? (
          <p className="mt-3 text-xs text-white/45 print:text-black/60">
            Evidence generated {formatUkInstant(evidence.generatedAt)} (UK local time)
          </p>
        ) : null}
      </header>

      {loading ? (
        <p className="mt-8 text-sm text-white/60">Loading journey evidence…</p>
      ) : null}
      {error ? <p className="mt-6 text-sm text-red-300 print:text-red-700">{error}</p> : null}

      {evidence ? (
        <div className="mt-6 space-y-8">
          <section className="rounded-2xl border border-emerald/30 bg-emerald/10 p-4 sm:p-5 print:border print:border-black/20 print:bg-transparent">
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald print:text-black">
              Evidence summary
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              <Fact
                label="Journey recorded"
                value={yesNo(evidence.summary?.journeyRecorded ?? evidence.pointCount > 0)}
              />
              <Fact
                label="GPS points"
                value={String(evidence.summary?.gpsPointCount ?? evidence.pointCount)}
              />
              <Fact
                label="Route reconstructable"
                value={yesNo(
                  evidence.summary?.routeReconstructable ?? evidence.routeReconstructable,
                )}
              />
              <Fact
                label="Payment linked"
                value={yesNo(evidence.summary?.paymentLinked)}
              />
              <Fact
                label="Journey completed"
                value={yesNo(evidence.summary?.journeyCompleted)}
              />
            </dl>
          </section>

          {/* Mobile: summary → map → journey → booking → payment → timeline → notes → PDF
              Desktop: map + details side-by-side */}
          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start">
            <section className="order-1 min-w-0 print:break-inside-avoid lg:order-2 lg:sticky lg:top-24">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white/50 print:text-black/70">
                Historical route map
              </h2>
              <p className="mt-2 text-xs text-white/45 print:text-black/60">
                Owner only. Markers show tracking start and tracking end from stored GPS points.
                Pickup and destination addresses are text records and are not geocoded onto this
                map.
              </p>
              {route.length >= 2 ? (
                <div className="mt-3 w-full max-w-full overflow-hidden rounded-xl border border-white/10 print:border-black/20">
                  <LiveTrackMap
                    markers={markers}
                    route={route}
                    className="h-72 w-full max-w-full sm:h-96 lg:h-[32rem]"
                  />
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/60 print:border-black/20 print:text-black/70">
                  Route not reconstructable — fewer than two GPS points with coordinates.
                </p>
              )}
              <p className="mt-2 text-xs text-white/40 print:text-black/50">
                Map tiles may not appear in printed PDFs. The GPS point count and timestamps remain
                the primary recorded evidence.
              </p>
            </section>

            <div className="order-2 min-w-0 space-y-6 lg:order-1">
              <section>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white/50 print:text-black/70">
                  Journey record
                </h2>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Fact label="Status" value={evidence.journeyStatusLabel} />
                  <Fact label="Tracking start" value={recordedOrNot(evidence.trackingStartedAt)} />
                  <Fact label="First GPS point" value={recordedOrNot(evidence.recordedFrom)} />
                  <Fact label="Last GPS point" value={recordedOrNot(evidence.recordedTo)} />
                  <Fact label="Tracking stopped" value={recordedOrNot(evidence.trackingStoppedAt)} />
                  <Fact
                    label="Journey completed time"
                    value={recordedOrNot(evidence.journeyCompletedAt)}
                  />
                  <Fact
                    label="Total tracking duration"
                    value={
                      typeof evidence.durationMinutes === "number"
                        ? `${evidence.durationMinutes} min`
                        : typeof evidence.gpsTrailDurationMinutes === "number"
                          ? `${evidence.gpsTrailDurationMinutes} min`
                          : "Not recorded"
                    }
                    derived={
                      typeof evidence.durationMinutes === "number" ||
                      typeof evidence.gpsTrailDurationMinutes === "number"
                    }
                  />
                  <Fact label="Total GPS points" value={String(evidence.pointCount)} />
                  <Fact
                    label="Route reconstructable"
                    value={yesNo(evidence.routeReconstructable)}
                  />
                  <Fact
                    label="GPS accuracy available"
                    value={yesNo(evidence.fieldsStored?.accuracyMeters)}
                  />
                  <Fact
                    label="Speed data available"
                    value={yesNo(evidence.fieldsStored?.speedMps)}
                  />
                  <Fact
                    label="Heading data available"
                    value={yesNo(evidence.fieldsStored?.headingDegrees)}
                  />
                </dl>
              </section>

              <section>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white/50 print:text-black/70">
                  Booking
                </h2>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Fact label="Booking reference" value={evidence.bookingReference} />
                  <Fact label="Customer name" value={evidence.customerName} />
                  <Fact label="Customer email" value={evidence.customerEmail || "—"} />
                  <Fact label="Customer mobile" value={evidence.customerMobile || "—"} />
                  <Fact
                    label="Booking date"
                    value={
                      evidence.bookingCreatedAt
                        ? formatUkInstant(evidence.bookingCreatedAt)
                        : "Not recorded"
                    }
                  />
                  <Fact
                    label="Scheduled pickup"
                    value={evidence.pickupDisplay || `${evidence.tripDate} ${evidence.tripTime}`}
                  />
                  <Fact label="Pickup address" value={evidence.pickupLabel} />
                  <Fact label="Destination address" value={evidence.dropoffLabel} />
                  <Fact label="Trip type" value={evidence.tripType || evidence.tripLabel || "—"} />
                  <Fact label="Fare" value={evidence.amountPaid || "—"} />
                  {evidence.flightNumber ? (
                    <Fact label="Flight number" value={evidence.flightNumber} />
                  ) : null}
                  {evidence.vehicle ? <Fact label="Vehicle" value={evidence.vehicle} /> : null}
                </dl>
              </section>

              <section>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white/50 print:text-black/70">
                  Payment
                </h2>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Fact label="Payment status" value={evidence.paymentStatus || "Not recorded"} />
                  <Fact label="Amount" value={evidence.amountPaid || "—"} />
                  <Fact
                    label="SumUp / payment reference"
                    value={evidence.paymentReference || "Not recorded"}
                  />
                  <Fact
                    label="Payment date/time"
                    value={
                      evidence.paymentCreatedAt
                        ? formatUkInstant(evidence.paymentCreatedAt)
                        : "Not recorded"
                    }
                  />
                  <Fact
                    label="Booking/payment linkage"
                    value={evidence.paymentLinkageStatus || "Not recorded"}
                  />
                  {evidence.checkoutId ? (
                    <Fact label="Checkout ID" value={evidence.checkoutId} />
                  ) : null}
                  {evidence.transactionCode ? (
                    <Fact label="Transaction code" value={evidence.transactionCode} />
                  ) : null}
                  {evidence.transactionId ? (
                    <Fact label="Transaction ID" value={evidence.transactionId} />
                  ) : null}
                </dl>
              </section>
            </div>
          </div>

          <section className="min-w-0">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white/50 print:text-black/70">
              Journey timeline
            </h2>
            <ol className="mt-3 space-y-3">
              {(evidence.timeline ?? []).map((event) => (
                <li
                  key={event.id}
                  className="flex gap-3 border-l-2 border-white/15 pl-3 print:border-black/20"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white print:text-black">
                      {event.label}
                    </p>
                    <p className="break-words text-xs text-white/55 print:text-black/60">
                      {event.at?.trim() ? formatUkInstant(event.at) : "Not recorded"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 print:border-black/20 print:bg-transparent">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white/50 print:text-black/70">
              Evidence notes
            </h2>
            <p className="mt-2 text-sm text-white/70 print:text-black/80">{evidence.disclaimer}</p>
            <p className="mt-3 text-sm text-white/70 print:text-black/80">
              Recorded facts only: GPS was captured by the driver’s device for this booking session.
              This does not prove the identity of any passenger, and does not claim a named customer
              was in the vehicle.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-white/65 print:text-black/70">
              {(evidence.integrityNotes ?? []).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-white/40 print:text-black/50">
              PDF export uses your browser print dialog (Save as PDF). No owner secrets are included
              in this page URL or evidence payload. Server-rendered branded PDF with embedded map
              image remains a separate stage if needed.
            </p>
          </section>

          <div className="print:hidden pb-8">
            <button
              type="button"
              onClick={downloadPdf}
              className="min-h-12 w-full rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy transition-colors hover:bg-emerald-light sm:w-auto"
            >
              Download Journey Evidence PDF
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
