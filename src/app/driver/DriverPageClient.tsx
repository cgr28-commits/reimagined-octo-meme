"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import type { MapMarker } from "@/components/LiveTrackMap";
import {
  buildWhatsAppTrackLink,
  fetchDriverJobs,
  postDriverLocation,
  setDriverSharing,
  updateDriverBooking,
  verifyDriverAccessKey,
  type DriverJob,
} from "@/lib/tracking-api";
import { issueBookingRefund } from "@/lib/refund-api";
import { DEMO_DRIVER_KEY } from "@/lib/tracking-demo";
import { SITE } from "@/lib/data";

const LiveTrackMap = dynamic(() => import("@/components/LiveTrackMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-xl bg-white/[0.03] text-white/60 sm:h-80">
      Loading map…
    </div>
  ),
});

const DRIVER_KEY_STORAGE = "matni-driver-key";

type DashboardView = "today" | "upcoming" | "date";

function todayLondonDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftLondonDate(dateStr: string, days: number): string {
  const base = new Date(`${dateStr}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function formatDateHeading(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function groupJobsByDate(jobs: DriverJob[]): Array<{ date: string; jobs: DriverJob[] }> {
  const groups = new Map<string, DriverJob[]>();

  for (const job of jobs) {
    const existing = groups.get(job.tripDate) ?? [];
    existing.push(job);
    groups.set(job.tripDate, existing);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, groupedJobs]) => ({
      date,
      jobs: groupedJobs.sort((a, b) => a.pickupAt.localeCompare(b.pickupAt)),
    }));
}

function jobMapMarkers(job: DriverJob, isActive: boolean): MapMarker[] {
  const markers: MapMarker[] = [];

  if (isActive && job.driver) {
    markers.push({
      lat: job.driver.lat,
      lng: job.driver.lng,
      label: "You (driver)",
    });
  }

  if (job.customer) {
    markers.push({
      lat: job.customer.lat,
      lng: job.customer.lng,
      label: `${job.customerName} (customer)`,
    });
  }

  return markers;
}

function flightStatusClass(status?: string): string {
  const normalised = status?.toLowerCase() ?? "";
  if (normalised.includes("land") || normalised.includes("arriv")) {
    return "bg-emerald/15 text-emerald";
  }
  if (normalised.includes("delay") || normalised.includes("late")) {
    return "bg-amber-500/15 text-amber-200";
  }
  if (normalised.includes("cancel")) {
    return "bg-red-500/15 text-red-200";
  }
  return "bg-white/10 text-white/70";
}

function DriverFlightPanel({ job }: { job: DriverJob }) {
  if (!job.isAirportPickup) {
    return null;
  }

  if (!job.flightNumber) {
    return (
      <div className="mt-4 rounded-xl border border-white/10 bg-navy/40 px-4 py-3 text-sm text-white/60">
        Airport pickup — no flight number was provided for this booking.
      </div>
    );
  }

  if (!job.flight) {
    return (
      <div className="mt-4 rounded-xl border border-white/10 bg-navy/40 px-4 py-3">
        <p className="text-sm font-semibold text-white">Flight {job.flightNumber}</p>
        <p className="mt-1 text-sm text-white/60">
          Live flight status is not available right now. Check the airport arrivals board before
          pickup.
        </p>
      </div>
    );
  }

  const { flight } = job;

  return (
    <div className="mt-4 rounded-xl border border-emerald/20 bg-emerald/5 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald">Incoming flight</p>
          <p className="mt-1 text-lg font-bold text-white">
            {flight.flightNumber} · {flight.airline}
          </p>
          <p className="mt-1 text-sm text-white/70">
            {flight.departureAirport} → {flight.arrivalAirport}
          </p>
        </div>
        {flight.status && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${flightStatusClass(flight.status)}`}
          >
            {flight.status}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-white/80">
        Scheduled arrival:{" "}
        <span className="font-semibold text-white">{flight.scheduledTimeLabel}</span>
        {" · "}
        {flight.airportName} ({flight.airportCode})
      </p>
      <p className="mt-2 text-xs text-white/50">
        60 minutes complimentary waiting applies from actual landing time.
      </p>
    </div>
  );
}

function DriverJobCard({
  job,
  driverKey,
  activeToken,
  onSharingChange,
  onRefunded,
  onUpdated,
  compactTracking = false,
}: {
  job: DriverJob;
  driverKey: string;
  activeToken: string | null;
  onSharingChange: (token: string | null) => void;
  onRefunded: (token: string) => void;
  onUpdated: (job: DriverJob) => void;
  compactTracking?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refundConfirmOpen, setRefundConfirmOpen] = useState(false);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundMessage, setRefundMessage] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    tripDate: job.tripDate,
    tripTime: job.tripTime,
    pickupLabel: job.pickupLabel,
    dropoffLabel: job.dropoffLabel,
    customerMobile: job.customerMobile,
    flightNumber: job.flightNumber ?? "",
  });
  const isActive = activeToken === job.token;
  const mapMarkers = jobMapMarkers(job, isActive);
  const isDemoDriver = driverKey === DEMO_DRIVER_KEY;
  const canRefund = Boolean(job.paymentReference?.trim()) && !isDemoDriver;
  const canEdit = job.bookingStatus !== "refunded";
  const trackingAvailable = !compactTracking && job.trackingWindow.open;

  const toggleSharing = async () => {
    setBusy(true);
    setError(null);

    try {
      if (isActive) {
        await setDriverSharing(driverKey, job.token, false);
        onSharingChange(null);
      } else {
        if (activeToken) {
          await setDriverSharing(driverKey, activeToken, false);
        }
        await setDriverSharing(driverKey, job.token, true);
        onSharingChange(job.token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update sharing");
    } finally {
      setBusy(false);
    }
  };

  const copyTrackLink = async () => {
    try {
      await navigator.clipboard.writeText(job.trackUrl);
    } catch {
      setError("Could not copy link");
    }
  };

  const startRefund = () => {
    setRefundMessage(null);
    setRefundConfirmOpen(true);
  };

  const cancelRefund = () => {
    setRefundConfirmOpen(false);
    setRefundMessage(null);
  };

  const openEdit = () => {
    setEditForm({
      tripDate: job.tripDate,
      tripTime: job.tripTime,
      pickupLabel: job.pickupLabel,
      dropoffLabel: job.dropoffLabel,
      customerMobile: job.customerMobile,
      flightNumber: job.flightNumber ?? "",
    });
    setEditMessage(null);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    setEditBusy(true);
    setEditMessage(null);
    setError(null);

    try {
      const result = await updateDriverBooking(driverKey, {
        token: job.token,
        tripDate: editForm.tripDate,
        tripTime: editForm.tripTime,
        pickupLabel: editForm.pickupLabel,
        dropoffLabel: editForm.dropoffLabel,
        customerMobile: editForm.customerMobile,
        flightNumber: editForm.flightNumber,
      });

      onUpdated(result.job);
      setEditOpen(false);
      setEditMessage("Booking updated.");
    } catch (err) {
      setEditMessage(err instanceof Error ? err.message : "Could not update booking");
    } finally {
      setEditBusy(false);
    }
  };

  const confirmRefund = async () => {
    const paymentReference = job.paymentReference?.trim();
    if (!paymentReference) {
      setRefundMessage("This job has no payment reference.");
      return;
    }

    setRefundBusy(true);
    setRefundMessage(null);

    try {
      if (isActive) {
        await setDriverSharing(driverKey, job.token, false);
        onSharingChange(null);
      }

      const result = await issueBookingRefund({
        ownerKey: driverKey,
        paymentReference,
      });

      if (!result.ok) {
        setRefundMessage(result.error ?? "Refund could not be completed.");
        return;
      }

      setRefundConfirmOpen(false);
      setRefundMessage(
        result.alreadyRefunded
          ? `Already refunded (${result.refundAmount ?? "paid amount"}).`
          : `Refund issued: ${result.refundAmount ?? "paid amount"}. Customer emailed, calendar updated.`,
      );
      onRefunded(job.token);
    } catch (err) {
      setRefundMessage(err instanceof Error ? err.message : "Refund could not be completed.");
    } finally {
      setRefundBusy(false);
    }
  };

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">{job.customerName}</h2>
          <p className="mt-1 text-sm text-white/60">
            {job.pickupDisplay} · {job.pickupLabel}
          </p>
          <p className="mt-1 text-sm text-white/60">To {job.dropoffLabel}</p>
          {job.customerMobile && (
            <p className="mt-2 text-sm text-emerald">{job.customerMobile}</p>
          )}
          {job.amountPaidLabel && (
            <p className="mt-1 text-sm text-white/70">Paid: {job.amountPaidLabel}</p>
          )}
          {job.paymentReference && (
            <p className="mt-1 text-xs text-white/40">Ref: {job.paymentReference}</p>
          )}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
            job.trackingWindow.open
              ? "bg-emerald/15 text-emerald"
              : "bg-white/10 text-white/50"
          }`}
        >
          {job.trackingWindow.open ? "Window open" : compactTracking ? "Upcoming" : "Not yet open"}
        </span>
      </div>

      <DriverFlightPanel job={job} />

      <div className="mt-5 flex flex-wrap gap-3">
        {!compactTracking && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggleSharing()}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
              isActive
                ? "bg-red-500/20 text-red-200 hover:bg-red-500/30"
                : "bg-emerald text-navy hover:bg-emerald/90"
            }`}
          >
            {isActive ? "Stop sharing location" : "Start sharing location"}
          </button>
        )}
        <button
          type="button"
          onClick={() => void copyTrackLink()}
          className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
        >
          Copy track link
        </button>
        <a
          href={buildWhatsAppTrackLink(job.trackUrl, job.customerName)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
        >
          Send via WhatsApp
        </a>
        {canEdit && !editOpen && (
          <button
            type="button"
            onClick={openEdit}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
          >
            Edit booking
          </button>
        )}
        {canRefund && !refundConfirmOpen && (
          <button
            type="button"
            disabled={refundBusy}
            onClick={startRefund}
            className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-60"
          >
            Issue refund
          </button>
        )}
      </div>

      {canEdit && editOpen && (
        <div className="mt-4 rounded-xl border border-white/10 bg-navy/40 p-4">
          <p className="text-sm font-semibold text-white">Edit booking</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-white/70">
              Date
              <input
                type="date"
                value={editForm.tripDate}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, tripDate: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
              />
            </label>
            <label className="block text-sm text-white/70">
              Time
              <input
                type="time"
                value={editForm.tripTime}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, tripTime: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
              />
            </label>
            <label className="block text-sm text-white/70 sm:col-span-2">
              Pickup
              <input
                type="text"
                value={editForm.pickupLabel}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, pickupLabel: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
              />
            </label>
            <label className="block text-sm text-white/70 sm:col-span-2">
              Drop-off
              <input
                type="text"
                value={editForm.dropoffLabel}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, dropoffLabel: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
              />
            </label>
            <label className="block text-sm text-white/70">
              Mobile
              <input
                type="tel"
                value={editForm.customerMobile}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, customerMobile: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
              />
            </label>
            <label className="block text-sm text-white/70">
              Flight number
              <input
                type="text"
                value={editForm.flightNumber}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, flightNumber: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={editBusy}
              onClick={() => void saveEdit()}
              className="rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-emerald/90 disabled:opacity-60"
            >
              {editBusy ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              disabled={editBusy}
              onClick={() => setEditOpen(false)}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {editMessage && (
        <p className="mt-4 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald-light">
          {editMessage}
        </p>
      )}

      {canRefund && refundConfirmOpen && (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-100">Confirm full refund</p>
          <p className="mt-2 text-sm leading-relaxed text-red-100/85">
            This will refund the customer via SumUp, email them a confirmation, mark the job as
            cancelled in your calendar, and remove it from this dashboard. This cannot be undone.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={refundBusy}
              onClick={() => void confirmRefund()}
              className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
            >
              {refundBusy ? "Processing refund…" : "Confirm refund"}
            </button>
            <button
              type="button"
              disabled={refundBusy}
              onClick={cancelRefund}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {refundMessage && (
        <p className="mt-4 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald-light">
          {refundMessage}
        </p>
      )}

      {isActive && (
        <p className="mt-4 text-sm text-emerald">
          Sharing live location for this job. Keep this page open while driving.
        </p>
      )}

      {job.customerSharingActive && !job.customer && trackingAvailable && (
        <p className="mt-4 text-sm text-white/60">
          Customer has opted in to share location — waiting for their GPS update.
        </p>
      )}

      {job.customer && trackingAvailable && (
        <p className="mt-4 text-sm text-emerald">
          Customer location is live on the map below.
        </p>
      )}

      {mapMarkers.length > 0 && trackingAvailable && (
        <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
          <LiveTrackMap markers={mapMarkers} />
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
    </article>
  );
}

export default function DriverPageClient() {
  const [driverKey, setDriverKey] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [jobs, setJobs] = useState<DriverJob[]>([]);
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<DashboardView>("today");
  const [selectedDate, setSelectedDate] = useState(() => todayLondonDate());
  const watchIdRef = useRef<number | null>(null);

  const today = useMemo(() => todayLondonDate(), []);
  const groupedUpcoming = useMemo(() => groupJobsByDate(jobs), [jobs]);

  const loadJobs = useCallback(
    async (key: string) => {
      setLoading(true);
      setError(null);

      try {
        const response =
          view === "upcoming"
            ? await fetchDriverJobs(key, { scope: "upcoming", days: 60 })
            : await fetchDriverJobs(key, {
                date: view === "today" ? today : selectedDate,
              });
        setJobs(response.jobs);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not load jobs";
        setError(
          message.toLowerCase().includes("unauthorized") ||
            message.toLowerCase().includes("did not match")
            ? "Your driver key was not accepted. Sign out and re-enter the exact DRIVER_ACCESS_KEY from Cloudflare → Workers → reimagined-octo-meme → Secrets."
            : message,
        );
        setJobs([]);
      } finally {
        setLoading(false);
      }
    },
    [selectedDate, today, view],
  );

  const handleJobUpdated = useCallback((updatedJob: DriverJob) => {
    setJobs((current) => {
      const next = current.map((entry) => (entry.token === updatedJob.token ? updatedJob : entry));
      return next.sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
    });
  }, []);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(DRIVER_KEY_STORAGE)?.trim();
    if (stored) {
      setSavedKey(stored);
      void loadJobs(stored);
    }
  }, [loadJobs]);

  useEffect(() => {
    if (!savedKey) {
      return;
    }

    if (view !== "today") {
      void loadJobs(savedKey);
      return;
    }

    const interval = window.setInterval(() => {
      void loadJobs(savedKey);
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [loadJobs, savedKey, view]);

  useEffect(() => {
    if (!savedKey || !activeToken || !navigator.geolocation) {
      return;
    }

    const sendPosition = (position: GeolocationPosition) => {
      void postDriverLocation(
        savedKey,
        activeToken,
        position.coords.latitude,
        position.coords.longitude,
      ).catch(() => {
        // Ignore transient GPS upload errors; next tick will retry.
      });
    };

    watchIdRef.current = navigator.geolocation.watchPosition(sendPosition, undefined, {
      enableHighAccuracy: true,
      maximumAge: 15_000,
      timeout: 20_000,
    });

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [activeToken, savedKey]);

  const unlock = async () => {
    const trimmed = driverKey.trim();
    if (!trimmed) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await verifyDriverAccessKey(trimmed);
      if (!result.ok) {
        setError(
          result.message ??
            "That driver key was not accepted. Check DRIVER_ACCESS_KEY on the reimagined-octo-meme worker in Cloudflare.",
        );
        return;
      }

      window.sessionStorage.setItem(DRIVER_KEY_STORAGE, trimmed);
      setSavedKey(trimmed);
      await loadJobs(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify driver key");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-44 md:pt-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <header className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              Driver dashboard
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Bookings</h1>
            <p className="mt-3 text-white/70">
              View today&apos;s jobs, browse upcoming bookings, or pick any date. You can edit
              details, issue refunds, and start live tracking on the day of travel from about 2 hours
              before pickup.
            </p>
          </header>

          {!savedKey ? (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
              <label htmlFor="driver-key" className="block text-sm font-medium text-white/70">
                Driver access key
              </label>
              <input
                id="driver-key"
                type="password"
                value={driverKey}
                onChange={(event) => setDriverKey(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/15 bg-navy px-4 py-3 text-white outline-none focus:border-emerald"
                placeholder="Enter your driver key"
              />
              <button
                type="button"
                onClick={() => void unlock()}
                disabled={loading}
                className="mt-4 rounded-xl bg-emerald px-5 py-3 text-sm font-semibold text-navy transition-colors hover:bg-emerald/90 disabled:opacity-60"
              >
                {loading ? "Checking key…" : "Open dashboard"}
              </button>
            </section>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-white/60">
                  {SITE.name}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    window.sessionStorage.removeItem(DRIVER_KEY_STORAGE);
                    setSavedKey(null);
                    setJobs([]);
                    setActiveToken(null);
                  }}
                  className="text-sm text-white/50 transition-colors hover:text-white"
                >
                  Sign out
                </button>
              </div>

              <div className="mb-6 flex flex-wrap gap-2">
                {([
                  ["today", "Today"],
                  ["upcoming", "Upcoming"],
                  ["date", "Pick date"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setView(value);
                      if (value === "today") {
                        setSelectedDate(today);
                      }
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      view === value
                        ? "bg-emerald text-navy"
                        : "border border-white/15 text-white/75 hover:border-white/30"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {view === "date" && (
                <div className="mb-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedDate((current) => shiftLondonDate(current, -1))}
                    className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
                  >
                    Previous day
                  </button>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="rounded-xl border border-white/15 bg-navy px-4 py-2.5 text-white outline-none focus:border-emerald"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedDate((current) => shiftLondonDate(current, 1))}
                    className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
                  >
                    Next day
                  </button>
                </div>
              )}

              {view !== "upcoming" && (
                <p className="mb-4 text-sm text-white/60">
                  Showing bookings for {formatDateHeading(view === "today" ? today : selectedDate)}
                </p>
              )}

              {loading && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-white/70">
                  Loading bookings…
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-red-100">
                  {error}
                </div>
              )}

              {!loading && !error && jobs.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-white/70">
                  {view === "upcoming"
                    ? "No upcoming paid bookings with tracking in the next 60 days."
                    : "No paid bookings with tracking for this date yet."}
                </div>
              )}

              {view === "upcoming" ? (
                <div className="space-y-8">
                  {groupedUpcoming.map((group) => (
                    <section key={group.date}>
                      <h2 className="mb-4 text-lg font-semibold text-white">
                        {formatDateHeading(group.date)}
                      </h2>
                      <div className="space-y-4">
                        {group.jobs.map((job) => (
                          <DriverJobCard
                            key={job.token}
                            job={job}
                            driverKey={savedKey}
                            activeToken={activeToken}
                            onSharingChange={setActiveToken}
                            onRefunded={(token) => {
                              setJobs((current) => current.filter((entry) => entry.token !== token));
                              if (activeToken === token) {
                                setActiveToken(null);
                              }
                            }}
                            onUpdated={handleJobUpdated}
                            compactTracking
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {jobs.map((job) => (
                    <DriverJobCard
                      key={job.token}
                      job={job}
                      driverKey={savedKey}
                      activeToken={activeToken}
                      onSharingChange={setActiveToken}
                      onRefunded={(token) => {
                        setJobs((current) => current.filter((entry) => entry.token !== token));
                        if (activeToken === token) {
                          setActiveToken(null);
                        }
                      }}
                      onUpdated={handleJobUpdated}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
