"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import type { MapMarker } from "@/components/LiveTrackMap";
import {
  fetchPublicTrack,
  postCustomerLocation,
  setCustomerSharing as updateCustomerSharing,
  type PublicTrackResponse,
} from "@/lib/tracking-api";
import { isDemoTrackToken } from "@/lib/tracking-demo";

const LiveTrackMap = dynamic(() => import("@/components/LiveTrackMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-xl bg-white/[0.03] text-white/60 sm:h-80">
      Loading map…
    </div>
  ),
});

type TrackPageClientProps = {
  token: string;
};

function statusMessage(data: PublicTrackResponse): { title: string; detail: string } {
  const { trackingWindow, sharingActive, driver } = data;

  if (!trackingWindow.open) {
    if (trackingWindow.reason === "too_early") {
      return {
        title: "Tracking opens on the day of travel",
        detail: `Live location will be available from ${trackingWindow.opensAtDisplay ?? "about 2 hours before pickup"}.`,
      };
    }

    return {
      title: "Tracking has ended for this journey",
      detail: "This link is no longer active. Contact us if you need assistance.",
    };
  }

  if (!sharingActive || !driver) {
    return {
      title: "Waiting for your driver",
      detail: "Your driver will start sharing their location when they are on the way to you.",
    };
  }

  return {
    title: "Driver is on the way",
    detail: "The map updates automatically every few seconds.",
  };
}

export default function TrackPageClient({ token }: TrackPageClientProps) {
  const [data, setData] = useState<PublicTrackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [sharingError, setSharingError] = useState<string | null>(null);
  const [customerSharing, setCustomerSharing] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchPublicTrack(token);
      setData(next);
      setCustomerSharing(next.customerSharingActive);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tracking");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!customerSharing || !data?.trackingWindow.open || !navigator.geolocation) {
      return;
    }

    const sendPosition = (position: GeolocationPosition) => {
      void postCustomerLocation(
        token,
        position.coords.latitude,
        position.coords.longitude,
      ).catch(() => {
        // Ignore transient upload errors; next tick will retry.
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
  }, [customerSharing, data?.trackingWindow.open, token]);

  const toggleCustomerSharing = async () => {
    setSharingBusy(true);
    setSharingError(null);

    try {
      const nextActive = !customerSharing;
      const result = await updateCustomerSharing(token, nextActive);
      setCustomerSharing(result.customerSharingActive);
    } catch (err) {
      setSharingError(err instanceof Error ? err.message : "Could not update location sharing");
    } finally {
      setSharingBusy(false);
    }
  };

  const status = data ? statusMessage(data) : null;
  const mapMarkers: MapMarker[] =
    data?.driver && data.trackingWindow.open
      ? [{ lat: data.driver.lat, lng: data.driver.lng, label: "Your driver" }]
      : [];

  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-44 md:pt-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <header className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              Live tracking
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
              {data?.customerName ? `${data.customerName}'s transfer` : "Your transfer"}
            </h1>
            {data && (
              <p className="mt-3 text-white/70">
                Pickup {data.pickupDisplay} · {data.pickupLabel}
              </p>
            )}
          </header>

          {isDemoTrackToken(token) && (
            <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
              Demo preview — this is sample data so you can see what customers experience.
              {" "}
              <a href="/track/demo/" className="font-semibold text-white underline">
                View all demos
              </a>
            </div>
          )}

          {loading && !data && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-white/70">
              Loading tracking details…
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-red-100">
              {error}
            </div>
          )}

          {data && status && (
            <div className="space-y-6">
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                <h2 className="text-xl font-bold text-white">{status.title}</h2>
                <p className="mt-2 text-white/70">{status.detail}</p>

                <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wider text-white/45">
                      Drop-off
                    </dt>
                    <dd className="mt-1 text-sm text-white">{data.dropoffLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wider text-white/45">
                      Scheduled pickup
                    </dt>
                    <dd className="mt-1 text-sm text-white">{data.pickupDisplay}</dd>
                  </div>
                </dl>

                {data.trackingWindow.open && (
                  <div className="mt-6 rounded-xl border border-white/10 bg-navy/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Share my location</p>
                        <p className="mt-1 text-sm text-white/60">
                          Optional — helps your driver find you at pickup.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={sharingBusy}
                        onClick={() => void toggleCustomerSharing()}
                        className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
                          customerSharing
                            ? "bg-red-500/20 text-red-200 hover:bg-red-500/30"
                            : "bg-emerald text-navy hover:bg-emerald/90"
                        }`}
                      >
                        {customerSharing ? "Stop sharing" : "Share location"}
                      </button>
                    </div>
                    {customerSharing && (
                      <p className="mt-3 text-sm text-emerald">
                        Your location is being shared with your driver.
                      </p>
                    )}
                    {sharingError && <p className="mt-3 text-sm text-red-300">{sharingError}</p>}
                  </div>
                )}
              </section>

              {mapMarkers.length > 0 && (
                <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                  <LiveTrackMap markers={mapMarkers} />
                </section>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
