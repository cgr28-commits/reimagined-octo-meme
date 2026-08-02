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
  type DriverJob,
} from "@/lib/tracking-api";
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

function todayLondonDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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

function DriverJobCard({
  job,
  driverKey,
  activeToken,
  onSharingChange,
}: {
  job: DriverJob;
  driverKey: string;
  activeToken: string | null;
  onSharingChange: (token: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isActive = activeToken === job.token;
  const mapMarkers = jobMapMarkers(job, isActive);

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
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
            job.trackingWindow.open
              ? "bg-emerald/15 text-emerald"
              : "bg-white/10 text-white/50"
          }`}
        >
          {job.trackingWindow.open ? "Window open" : "Not yet open"}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
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
      </div>

      {isActive && (
        <p className="mt-4 text-sm text-emerald">
          Sharing live location for this job. Keep this page open while driving.
        </p>
      )}

      {job.customerSharingActive && !job.customer && (
        <p className="mt-4 text-sm text-white/60">
          Customer has opted in to share location — waiting for their GPS update.
        </p>
      )}

      {job.customer && (
        <p className="mt-4 text-sm text-emerald">
          Customer location is live on the map below.
        </p>
      )}

      {mapMarkers.length > 0 && job.trackingWindow.open && (
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
  const watchIdRef = useRef<number | null>(null);

  const selectedDate = useMemo(() => todayLondonDate(), []);

  const loadJobs = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchDriverJobs(key, selectedDate);
      setJobs(response.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load jobs");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

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

    const interval = window.setInterval(() => {
      void loadJobs(savedKey);
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [loadJobs, savedKey]);

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

  const unlock = () => {
    const trimmed = driverKey.trim();
    if (!trimmed) {
      return;
    }

    window.sessionStorage.setItem(DRIVER_KEY_STORAGE, trimmed);
    setSavedKey(trimmed);
    void loadJobs(trimmed);
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
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Today&apos;s jobs</h1>
            <p className="mt-3 text-white/70">
              Start sharing your location when you are on the way. Customers can share their
              location too so you can see them on the map. Live tracking is available on the day
              of travel, from about 2 hours before pickup.
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
                onClick={unlock}
                className="mt-4 rounded-xl bg-emerald px-5 py-3 text-sm font-semibold text-navy transition-colors hover:bg-emerald/90"
              >
                Open dashboard
              </button>
            </section>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-white/60">
                  {selectedDate} · {SITE.name}
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

              {loading && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-white/70">
                  Loading today&apos;s jobs…
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-red-100">
                  {error}
                </div>
              )}

              {!loading && !error && jobs.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-white/70">
                  No paid bookings with tracking for today yet.
                </div>
              )}

              <div className="space-y-4">
                {jobs.map((job) => (
                  <DriverJobCard
                    key={job.token}
                    job={job}
                    driverKey={savedKey}
                    activeToken={activeToken}
                    onSharingChange={setActiveToken}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
