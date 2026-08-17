"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatUkInstant } from "../../shared/uk-time";
import {
  fetchOwnerPaidBookings,
  fetchOwnerPendingCheckouts,
  fetchTrackingDiagnostic,
  finalizePaidCheckoutRecovery,
  resendPaidBookingConfirmation,
  sendOwnerReviewRequest,
  type OwnerPaidBookingSummary,
  type OwnerPendingCheckoutSummary,
  type OwnerReviewRequestSummary,
  type TrackingDiagnosticReport,
} from "@/lib/paid-bookings-api";
import {
  ensurePaidBookingTracking,
  postDriverLocation,
  postJourneyAction,
} from "@/lib/tracking-api";

type OwnerPaidBookingsPanelProps = {
  ownerKey: string;
};

type LiveGpsState = {
  token: string;
  sessionToken: string;
  lastAt: number | null;
  accuracyMeters: number | null;
  error: string | null;
  /** True only after the Worker accepted at least one GPS post. */
  serverConnected: boolean;
  pointCount: number;
  permissionDenied: boolean;
};

function reviewStatusLabel(
  status: OwnerReviewRequestSummary["status"] | undefined,
  dueAt?: string,
): string {
  switch (status) {
    case "scheduled":
      return dueAt ? `Scheduled for ${formatUkInstant(dueAt)}` : "Scheduled";
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    default:
      return "Not scheduled";
  }
}

function PaidBookingLiveTracking({
  ownerKey,
  booking,
  onBusy,
  onMessage,
  onError,
  onTrackingToken,
  onSharingChange,
  onJourneyCompleted,
}: {
  ownerKey: string;
  booking: OwnerPaidBookingSummary;
  onBusy: (ref: string) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
  onTrackingToken: (paymentReference: string, token: string, trackUrl: string) => void;
  onSharingChange: (active: boolean) => void;
  onJourneyCompleted: (update: {
    token: string;
    journeyStatus: string;
    journeyCompletedAt?: string;
    reviewRequest?: OwnerReviewRequestSummary;
  }) => void;
}) {
  const [localActive, setLocalActive] = useState(Boolean(booking.sharingActive));
  const [gps, setGps] = useState<LiveGpsState | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const watchIdRef = useRef<number | null>(null);
  const sessionRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(booking.trackingToken ?? null);

  useEffect(() => {
    // Restore sharing flag from server, but never claim GPS connected without a fresh watch.
    setLocalActive(Boolean(booking.sharingActive));
    tokenRef.current = booking.trackingToken ?? null;
    if (!booking.sharingActive) {
      setGps(null);
    }
  }, [booking.sharingActive, booking.trackingToken]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    sessionRef.current = null;
  }, []);

  useEffect(() => () => clearWatch(), [clearWatch]);

  const uploadPosition = useCallback(
    (
      token: string,
      sessionToken: string,
      position: GeolocationPosition,
    ) => {
      const accuracy =
        typeof position.coords.accuracy === "number" && Number.isFinite(position.coords.accuracy)
          ? position.coords.accuracy
          : null;

      void postDriverLocation(
        ownerKey,
        token,
        position.coords.latitude,
        position.coords.longitude,
        {
          sessionToken,
          ...(accuracy !== null ? { accuracy } : {}),
          ...(typeof position.coords.speed === "number" && Number.isFinite(position.coords.speed)
            ? { speed: position.coords.speed }
            : {}),
          ...(typeof position.coords.heading === "number" &&
          Number.isFinite(position.coords.heading)
            ? { heading: position.coords.heading }
            : {}),
        },
      )
        .then((result) => {
          setGps((current) =>
            current
              ? {
                  ...current,
                  lastAt: Date.now(),
                  accuracyMeters: accuracy,
                  error: null,
                  permissionDenied: false,
                  serverConnected: true,
                  pointCount:
                    typeof result.pointCount === "number"
                      ? Math.max(current.pointCount, result.pointCount)
                      : Math.max(current.pointCount, 1),
                }
              : current,
          );
        })
        .catch((err) => {
          const message =
            err instanceof Error && err.message.trim()
              ? err.message
              : "GPS upload failed — check connection and keep this page open.";
          setGps((current) =>
            current
              ? {
                  ...current,
                  error: message,
                  // Keep serverConnected if we already had a successful point.
                }
              : current,
          );
        });
    },
    [ownerKey],
  );

  const startGpsWatch = useCallback(
    (token: string, sessionToken: string) => {
      if (!navigator.geolocation) {
        onError("This browser does not support live GPS tracking.");
        setGps({
          token,
          sessionToken,
          lastAt: null,
          accuracyMeters: null,
          error: "GPS NOT RECORDING — this browser has no geolocation API.",
          serverConnected: false,
          pointCount: 0,
          permissionDenied: true,
        });
        return;
      }

      clearWatch();
      sessionRef.current = sessionToken;
      tokenRef.current = token;
      setGps({
        token,
        sessionToken,
        lastAt: null,
        accuracyMeters: null,
        error: null,
        serverConnected: false,
        pointCount: 0,
        permissionDenied: false,
      });

      const onGeoError = (geoError: GeolocationPositionError) => {
        const permissionDenied = geoError.code === geoError.PERMISSION_DENIED;
        setGps((current) =>
          current
            ? {
                ...current,
                permissionDenied,
                error: permissionDenied
                  ? "GPS NOT RECORDING — location permission denied. Enable Precise Location for Safari, then try again."
                  : "GPS NOT RECORDING — location unavailable. Keep this page open and check GPS.",
              }
            : current,
        );
      };

      // Force the iPhone permission prompt + first fix before relying on watch alone.
      navigator.geolocation.getCurrentPosition(
        (position) => {
          uploadPosition(token, sessionToken, position);
        },
        onGeoError,
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 25_000,
        },
      );

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          uploadPosition(token, sessionToken, position);
        },
        onGeoError,
        {
          enableHighAccuracy: true,
          maximumAge: 15_000,
          timeout: 20_000,
        },
      );
    },
    [clearWatch, onError, uploadPosition],
  );

  const startTracking = async () => {
    setBusy(true);
    onBusy(booking.paymentReference);
    onError("");
    onMessage("");
    try {
      let token = booking.trackingToken?.trim() ?? "";
      if (!token) {
        const created = await ensurePaidBookingTracking(ownerKey, booking.paymentReference);
        token = created.token;
        onTrackingToken(booking.paymentReference, created.token, created.trackUrl);
      }

      const result = await postJourneyAction(ownerKey, token, "start_tracking");
      const sessionToken = result.trackingSession?.sessionToken;
      if (!sessionToken) {
        throw new Error("Tracking started but no GPS session was issued — try again.");
      }

      // Sharing is on server-side, but UI stays "waiting for GPS" until Worker accepts a point.
      setLocalActive(true);
      setGps({
        token,
        sessionToken,
        lastAt: null,
        accuracyMeters: null,
        error: null,
        serverConnected: false,
        pointCount: 0,
        permissionDenied: false,
      });
      startGpsWatch(token, sessionToken);
      onSharingChange(true);
      onMessage(
        "Waiting for GPS… Keep this Safari tab open in the foreground. GPS pauses if the screen locks or you switch apps.",
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not start live tracking");
      setLocalActive(false);
      clearWatch();
      setGps(null);
    } finally {
      setBusy(false);
      onBusy("");
    }
  };

  const stopTracking = async () => {
    setBusy(true);
    onBusy(booking.paymentReference);
    onError("");
    try {
      const token = tokenRef.current ?? booking.trackingToken?.trim();
      if (token) {
        await postJourneyAction(ownerKey, token, "stop_tracking");
      }
      setLocalActive(false);
      clearWatch();
      setGps(null);
      onSharingChange(false);
      onMessage(
        "Live tracking stopped (GPS sharing off). Press Complete Journey when the passenger trip has finished — that schedules the Google review email.",
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not stop live tracking");
    } finally {
      setBusy(false);
      onBusy("");
    }
  };

  const completeJourney = async () => {
    setBusy(true);
    onBusy(booking.paymentReference);
    onError("");
    try {
      let token = tokenRef.current ?? booking.trackingToken?.trim() ?? "";
      if (!token) {
        const created = await ensurePaidBookingTracking(ownerKey, booking.paymentReference);
        token = created.token;
        onTrackingToken(booking.paymentReference, created.token, created.trackUrl);
      }

      const result = await postJourneyAction(ownerKey, token, "complete_journey");
      setLocalActive(false);
      clearWatch();
      setGps(null);
      onSharingChange(false);
      onJourneyCompleted({
        token,
        journeyStatus: result.journeyStatus,
        journeyCompletedAt: result.journeyCompletedAt,
        reviewRequest: result.reviewRequest,
      });
      onMessage(
        result.reviewRequest?.dueAt
          ? `Journey completed. Review request scheduled for ${formatUkInstant(result.reviewRequest.dueAt)} (about 2 hours after completion).`
          : "Journey completed. Review request scheduled (~2 hours after completion).",
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not complete journey");
    } finally {
      setBusy(false);
      onBusy("");
    }
  };

  const sessionOn = localActive;
  const journeyCompleted = booking.journeyStatus === "completed";
  const canCompleteJourney = !journeyCompleted && booking.status !== "refunded";
  const gpsConnected = Boolean(gps?.serverConnected);
  const gpsNotRecording = Boolean(
    sessionOn && (gps?.permissionDenied || (gps?.error && !gpsConnected)),
  );
  const lastAt = gps?.lastAt ?? null;
  const lastLabel =
    lastAt && Number.isFinite(lastAt)
      ? `${Math.max(1, Math.round((Date.now() - lastAt) / 1000))}s ago`
      : null;
  void tick;

  const trackHref =
    booking.trackUrl ||
    (booking.trackingToken
      ? `/track/?id=${encodeURIComponent(booking.trackingToken)}`
      : null);

  return (
    <div className="mt-4 rounded-xl border border-emerald/30 bg-emerald/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
            Driver tracking
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            Status:{" "}
            <span
              className={
                gpsConnected ? "text-emerald" : sessionOn ? "text-amber-200" : "text-white/70"
              }
            >
              {gpsConnected ? "LIVE" : sessionOn ? "WAITING FOR GPS" : "OFF"}
            </span>
          </p>
          {gpsConnected ? (
            <>
              <p className="mt-1 text-xs text-emerald">GPS: Connected</p>
              {lastLabel ? (
                <p className="mt-1 text-xs text-white/60">Last GPS update: {lastLabel}</p>
              ) : null}
              {typeof gps?.accuracyMeters === "number" ? (
                <p className="mt-1 text-xs text-white/60">
                  Accuracy: ±{Math.round(gps.accuracyMeters)} m
                </p>
              ) : null}
              <p className="mt-1 text-xs text-white/60">
                Points recorded: {gps?.pointCount ?? 0}
              </p>
            </>
          ) : null}
          {sessionOn && !gpsConnected && !gpsNotRecording ? (
            <p className="mt-2 text-xs text-amber-100">
              Waiting for the first GPS fix and server confirmation…
            </p>
          ) : null}
          {gpsNotRecording ? (
            <p className="mt-2 text-sm font-semibold text-amber-100">GPS NOT RECORDING</p>
          ) : null}
          {gps?.error ? <p className="mt-2 text-xs text-amber-100">{gps.error}</p> : null}
          {sessionOn ? (
            <p className="mt-2 text-xs text-white/45">
              Keep this Safari tab open in the foreground. iPhone may pause GPS when the screen
              locks, Safari backgrounds, or you open Maps/Waze.
            </p>
          ) : (
            <p className="mt-2 text-xs text-white/45">
              Customers only see your live location from about 1 hour before pickup. Historical
              GPS stays owner-only.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {journeyCompleted ? (
            <>
              <span className="inline-flex min-h-11 items-center rounded-xl border border-emerald/40 bg-emerald/15 px-4 py-2 text-sm font-semibold text-emerald">
                Journey completed
              </span>
              <a
                href={`/owner/journey-evidence/?ref=${encodeURIComponent(booking.paymentReference)}`}
                className="inline-flex min-h-11 items-center rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-sky-400"
              >
                View Journey Evidence
              </a>
            </>
          ) : !sessionOn ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void startTracking()}
              className="min-h-11 rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy transition-colors hover:bg-emerald/90 disabled:opacity-60"
            >
              {busy ? "Starting…" : "Start Live Tracking"}
            </button>
          ) : (
            <>
              <span
                className={`inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-semibold ${
                  gpsConnected
                    ? "border-emerald/40 bg-emerald/15 text-emerald"
                    : gpsNotRecording
                      ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                      : "border-white/20 bg-white/5 text-white/80"
                }`}
              >
                {gpsConnected
                  ? "LIVE TRACKING ACTIVE"
                  : gpsNotRecording
                    ? "GPS NOT RECORDING"
                    : "WAITING FOR GPS"}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void stopTracking()}
                className="min-h-11 rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-100 transition-colors hover:bg-red-500/25 disabled:opacity-60"
              >
                {busy ? "Stopping…" : "Stop Tracking"}
              </button>
            </>
          )}
          {!journeyCompleted && trackHref ? (
            <a
              href={trackHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
            >
              Open customer track link
            </a>
          ) : null}
          {canCompleteJourney ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void completeJourney()}
              className="min-h-11 rounded-xl border border-sky-400/40 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-sky-100 transition-colors hover:bg-sky-500/25 disabled:opacity-60"
            >
              {busy ? "Completing…" : "Complete Journey"}
            </button>
          ) : null}
        </div>
      </div>
      {canCompleteJourney ? (
        <p className="mt-3 text-xs text-white/45">
          Complete Journey confirms the passenger trip finished and schedules the Google review
          email ~2 hours later. It is separate from Stop Tracking (GPS only).
        </p>
      ) : null}
    </div>
  );
}

function yesNo(value: boolean | undefined): string {
  if (value === true) return "YES";
  if (value === false) return "NO";
  return "—";
}

function TrackingDiagnosticView({ report }: { report: TrackingDiagnosticReport }) {
  const events = report.journeyEvents;
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
        Tracking diagnostic (read-only)
      </p>
      <p className="mt-1 text-xs text-white/45">
        Owner-authenticated lookup. No journey data was changed. Secrets are never returned.
      </p>
      <dl className="mt-3 grid gap-2 text-sm text-white/75 sm:grid-cols-2">
        <div>
          <dt className="text-white/40">Session found</dt>
          <dd className="font-semibold text-white">{yesNo(report.sessionFound)}</dd>
        </div>
        <div>
          <dt className="text-white/40">Session ID</dt>
          <dd className="break-all font-mono text-xs text-white/85">
            {report.sessionId || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-white/40">GPS points</dt>
          <dd>{report.sessionFound ? String(report.gpsPointCount ?? 0) : "—"}</dd>
        </div>
        <div>
          <dt className="text-white/40">Route reconstructable</dt>
          <dd>{yesNo(report.routeReconstructable)}</dd>
        </div>
        <div>
          <dt className="text-white/40">First point</dt>
          <dd>{report.firstPointAt || "—"}</dd>
        </div>
        <div>
          <dt className="text-white/40">Last point</dt>
          <dd>{report.lastPointAt || "—"}</dd>
        </div>
        <div>
          <dt className="text-white/40">Tracking start</dt>
          <dd>{report.trackingStartedAt || events?.trackingStartedAt || "—"}</dd>
        </div>
        <div>
          <dt className="text-white/40">Tracking stop</dt>
          <dd>{report.trackingStoppedAt || events?.trackingStoppedAt || "—"}</dd>
        </div>
        <div>
          <dt className="text-white/40">Lat/Lng stored</dt>
          <dd>{yesNo(report.fieldsStored?.latitudeLongitude)}</dd>
        </div>
        <div>
          <dt className="text-white/40">Accuracy / speed / heading</dt>
          <dd>
            {yesNo(report.fieldsStored?.accuracyMeters)} /{" "}
            {yesNo(report.fieldsStored?.speedMps)} /{" "}
            {yesNo(report.fieldsStored?.headingDegrees)}
          </dd>
        </div>
        <div>
          <dt className="text-white/40">Payment ref linked</dt>
          <dd>{yesNo(report.paymentReferenceLinked ?? report.paidBookingFound)}</dd>
        </div>
        <div>
          <dt className="text-white/40">Customer sees historical trail</dt>
          <dd>{yesNo(report.customerSeesHistoricalRoute)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-white/40">Storage</dt>
          <dd>
            {report.storage
              ? `${report.storage.location} (${report.storage.binding}) — DO: ${yesNo(report.storage.durableObject)}, D1: ${yesNo(report.storage.d1)}`
              : "—"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-white/40">Retention</dt>
          <dd>
            {report.retention
              ? `Job ~${report.retention.trackingJobTtlDays}d · GPS history ~${report.retention.gpsHistoryTtlDays}d · GPS session ~${report.retention.gpsSessionTtlHours}h`
              : "—"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-white/40">Journey events</dt>
          <dd className="mt-1 whitespace-pre-wrap font-mono text-xs text-white/70">
            {events
              ? [
                  `status: ${events.journeyStatus}`,
                  `sharingActive: ${events.sharingActive}`,
                  `trackingStartedAt: ${events.trackingStartedAt ?? "—"}`,
                  `arrivedPickupAt: ${events.arrivedPickupAt ?? "—"}`,
                  `journeyStartedAt: ${events.journeyStartedAt ?? "—"}`,
                  `arrivedDestinationAt: ${events.arrivedDestinationAt ?? "—"}`,
                  `journeyCompletedAt: ${events.journeyCompletedAt ?? "—"}`,
                  `trackingStoppedAt: ${events.trackingStoppedAt ?? "—"}`,
                ].join("\n")
              : "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function OwnerPaidBookingsPanel({ ownerKey }: OwnerPaidBookingsPanelProps) {
  const [bookings, setBookings] = useState<OwnerPaidBookingSummary[]>([]);
  const [pending, setPending] = useState<OwnerPendingCheckoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyRef, setBusyRef] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Record<string, TrackingDiagnosticReport>>({});
  const [diagnosticBusyRef, setDiagnosticBusyRef] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextBookings, nextPending] = await Promise.all([
        fetchOwnerPaidBookings(ownerKey, { days: 30, limit: 50 }),
        fetchOwnerPendingCheckouts(ownerKey, { limit: 40 }).catch(
          () => [] as OwnerPendingCheckoutSummary[],
        ),
      ]);
      setBookings(nextBookings);
      setPending(nextPending);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load paid bookings");
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleResend(booking: OwnerPaidBookingSummary) {
    setBusyRef(booking.paymentReference);
    setError("");
    setMessage("");
    try {
      const result = await resendPaidBookingConfirmation(ownerKey, booking.paymentReference);
      if (!result.customerEmailSent) {
        throw new Error(result.customerEmailError || "Booking confirmation could not be sent");
      }
      setMessage(
        `Booking confirmation resent to ${result.customerEmail}${
          result.ownerEmailSent ? " (owner copy sent too)" : ""
        }.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend booking confirmation");
    } finally {
      setBusyRef("");
    }
  }

  async function handleEnsureTracking(booking: OwnerPaidBookingSummary) {
    setBusyRef(booking.paymentReference);
    setError("");
    setMessage("");
    try {
      const result = await ensurePaidBookingTracking(ownerKey, booking.paymentReference);
      setMessage(
        result.alreadyExisted
          ? `Tracking already exists — ${result.trackUrl}`
          : `Tracking created — ${result.trackUrl}`,
      );
      setBookings((current) =>
        current.map((entry) =>
          entry.paymentReference === booking.paymentReference
            ? {
                ...entry,
                trackingToken: result.token,
                trackUrl: result.trackUrl,
              }
            : entry,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create tracking for this booking");
    } finally {
      setBusyRef("");
    }
  }

  async function handleReviewRequest(booking: OwnerPaidBookingSummary, forceResend = false) {
    setBusyRef(booking.paymentReference);
    setError("");
    setMessage("");
    try {
      const result = await sendOwnerReviewRequest(ownerKey, {
        paymentReference: booking.paymentReference,
        token: booking.trackingToken,
        forceResend,
      });
      if (result.reviewRequest) {
        setBookings((current) =>
          current.map((entry) =>
            entry.paymentReference === booking.paymentReference
              ? { ...entry, reviewRequest: result.reviewRequest }
              : entry,
          ),
        );
      }
      if (!result.ok) {
        const failReason = result.error || result.reviewRequest?.lastError || "Could not send review request";
        throw new Error(
          result.reviewRequest?.status === "failed" ? `Failed: ${failReason}` : failReason,
        );
      }
      const to = result.customerEmail || booking.customerEmail;
      const viaResend = result.resendId
        ? ` via Resend (${result.resendId})`
        : result.provider === "resend"
          ? " via Resend"
          : "";
      setMessage(
        forceResend
          ? `Review request resent to ${to}${viaResend}.`
          : `Review request sent to ${to}${viaResend}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send review request");
    } finally {
      setBusyRef("");
    }
  }

  async function handleTrackingDiagnostic(booking: OwnerPaidBookingSummary) {
    setDiagnosticBusyRef(booking.paymentReference);
    setError("");
    try {
      const report = await fetchTrackingDiagnostic(ownerKey, booking.paymentReference);
      setDiagnostics((current) => ({
        ...current,
        [booking.paymentReference]: report,
      }));
      setMessage(
        report.sessionFound
          ? `Tracking diagnostic loaded for ${booking.paymentReference} (${report.gpsPointCount ?? 0} GPS points).`
          : `No tracking session found for ${booking.paymentReference}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tracking diagnostic");
    } finally {
      setDiagnosticBusyRef("");
    }
  }

  async function handleCompleteJourney(booking: OwnerPaidBookingSummary) {
    setBusyRef(booking.paymentReference);
    setError("");
    setMessage("");
    try {
      let token = booking.trackingToken?.trim() ?? "";
      if (!token) {
        const created = await ensurePaidBookingTracking(ownerKey, booking.paymentReference);
        token = created.token;
        onTrackingTokenUpdate(booking.paymentReference, created.token, created.trackUrl);
      }

      const result = await postJourneyAction(ownerKey, token, "complete_journey");
      setBookings((current) =>
        current.map((entry) =>
          entry.paymentReference === booking.paymentReference
            ? {
                ...entry,
                trackingToken: token,
                sharingActive: false,
                journeyStatus: result.journeyStatus ?? "completed",
                journeyCompletedAt: result.journeyCompletedAt ?? new Date().toISOString(),
                reviewRequest: result.reviewRequest ?? entry.reviewRequest,
              }
            : entry,
        ),
      );
      setMessage(
        result.reviewRequest?.dueAt
          ? `Journey completed. Google review request scheduled for ${formatUkInstant(result.reviewRequest.dueAt)}.`
          : "Journey completed. Review request will be scheduled automatically.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete journey");
    } finally {
      setBusyRef("");
    }
  }

  function onTrackingTokenUpdate(paymentReference: string, token: string, trackUrl: string) {
    setBookings((current) =>
      current.map((entry) =>
        entry.paymentReference === paymentReference
          ? { ...entry, trackingToken: token, trackUrl }
          : entry,
      ),
    );
  }

  // handleCompleteJourney kept for any secondary Complete Journey controls below.

  async function handleRecover(checkoutId?: string) {
    setRecovering(true);
    setError("");
    setMessage("");
    try {
      const result = await finalizePaidCheckoutRecovery(ownerKey, {
        checkoutId,
        preferTestOnePound: true,
      });
      const primary = result.primary ?? result;
      if (!result.ok && !primary.ok) {
        throw new Error(primary.error || result.message || "Recovery did not complete");
      }
      setMessage(
        [
          result.message || `Recovery ${primary.action ?? "done"}`,
          primary.paymentReference ? `ref ${primary.paymentReference}` : "",
          primary.customerEmailSent ? "customer email ok" : "customer email not sent",
          primary.ownerEmailSent ? "bookings@ ok" : "bookings@ not sent",
          primary.calendarLogged ? "calendar ok" : "calendar not logged",
        ]
          .filter(Boolean)
          .join(" · "),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not recover paid checkout");
    } finally {
      setRecovering(false);
    }
  }

  const latestPaid = bookings.find((booking) => booking.status !== "refunded") ?? null;
  const needsFinalize = pending.filter((item) => item.needsFinalize);

  return (
    <section className="mb-10 rounded-2xl border border-sky-400/25 bg-sky-500/5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-200">
            Website card payments
          </p>
          <h2 className="mt-1 text-xl font-bold text-white">Paid bookings (SumUp)</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/65">
            Customers who pay on the website appear here automatically. Use{" "}
            <span className="text-white/85">Start Live Tracking</span> on a booking to share your
            GPS. Customers only see live location from about 1 hour before pickup.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-white/30"
        >
          Refresh
        </button>
      </div>

      {needsFinalize.length > 0 ? (
        <div className="mt-5 rounded-xl border border-amber-400/35 bg-amber-500/10 p-4">
          <p className="text-sm text-white/85">
            {needsFinalize.length} SumUp PAID checkout
            {needsFinalize.length === 1 ? "" : "s"} waiting to finalize (email/calendar).
          </p>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            {needsFinalize.slice(0, 5).map((item) => (
              <li key={item.checkoutId}>
                £{item.amount.toFixed(2)} · {item.customerName} · {item.customerEmail}
                <button
                  type="button"
                  disabled={recovering}
                  onClick={() => void handleRecover(item.checkoutId)}
                  className="ml-2 text-emerald underline disabled:opacity-60"
                >
                  Finalize
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={recovering}
            onClick={() => void handleRecover()}
            className="mt-3 w-full rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-navy transition-colors hover:bg-amber-200 disabled:opacity-60 sm:w-auto"
          >
            {recovering ? "Recovering…" : "Recover PAID checkouts (no new charge)"}
          </button>
        </div>
      ) : null}

      {latestPaid ? (
        <div className="mt-5 rounded-xl border border-emerald/35 bg-emerald/10 p-4">
          <p className="text-sm text-white/80">
            Latest paid booking:{" "}
            <span className="font-semibold text-white">{latestPaid.customerName}</span>
            {latestPaid.amountPaid ? ` · ${latestPaid.amountPaid}` : ""} · {latestPaid.customerEmail}
          </p>
          <button
            type="button"
            disabled={busyRef === latestPaid.paymentReference}
            onClick={() => void handleResend(latestPaid)}
            className="mt-3 w-full rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy transition-colors hover:bg-emerald-light disabled:opacity-60 sm:w-auto"
          >
            {busyRef === latestPaid.paymentReference
              ? "Sending booking confirmation…"
              : "Resend booking confirmation"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald-light">
          {message}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-white/60">Loading paid bookings…</p>
      ) : bookings.length === 0 ? (
        <p className="mt-6 text-sm text-white/60">
          No website card payments found in the last 30 days. If a customer just paid, tap Refresh
          or use Recover if SumUp shows PAID.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {bookings.map((booking) => (
            <li
              key={booking.paymentReference}
              className="rounded-2xl border border-white/10 bg-navy/60 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-lg font-bold text-white">{booking.customerName}</p>
                  <p className="mt-1 break-words text-sm text-white/65">
                    {booking.tripDate} · pick up {booking.tripTime}
                    {booking.amountPaid ? ` · ${booking.amountPaid}` : ""}
                  </p>
                  <p className="mt-2 break-words text-sm text-white/80">
                    {booking.pickupLabel} → {booking.dropoffLabel}
                  </p>
                  <p className="mt-2 break-all text-xs text-white/45">
                    Ref {booking.paymentReference}
                    {booking.createdAt ? ` · paid ${formatUkInstant(booking.createdAt)}` : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                    booking.status === "refunded"
                      ? "border-red-400/30 bg-red-500/10 text-red-100"
                      : booking.sharingActive
                        ? "border-emerald/40 bg-emerald/15 text-emerald"
                        : "border-emerald/40 bg-emerald/15 text-emerald"
                  }`}
                >
                  {booking.status === "refunded"
                    ? "Refunded"
                    : booking.sharingActive
                      ? "Paid · Tracking live"
                      : "Paid"}
                </span>
              </div>

              <dl className="mt-4 grid gap-2 text-sm text-white/70 sm:grid-cols-2">
                <div>
                  <dt className="text-white/40">Mobile</dt>
                  <dd>{booking.mobileNumber || "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/40">Email</dt>
                  <dd className="break-all">{booking.customerEmail || "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/40">Trip</dt>
                  <dd>{booking.tripLabel || "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/40">Return</dt>
                  <dd>
                    {booking.returnJourney
                      ? `${booking.returnDate || "—"} · ${booking.returnTime || "—"}`
                      : "No"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-white/40">Review request</dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                        booking.reviewRequest?.status === "sent"
                          ? "border-emerald/40 bg-emerald/15 text-emerald"
                          : booking.reviewRequest?.status === "failed"
                            ? "border-red-400/30 bg-red-500/10 text-red-100"
                            : booking.reviewRequest?.status === "scheduled"
                              ? "border-sky-400/30 bg-sky-500/10 text-sky-100"
                              : "border-white/15 bg-white/5 text-white/70"
                      }`}
                    >
                      {reviewStatusLabel(
                        booking.reviewRequest?.status,
                        booking.reviewRequest?.dueAt,
                      )}
                    </span>
                    {booking.reviewRequest?.status === "scheduled" && booking.reviewRequest.dueAt ? (
                      <span className="mt-2 block text-xs text-white/45">
                        Auto-send around {formatUkInstant(booking.reviewRequest.dueAt)}
                        {booking.reviewRequest.scheduledAt
                          ? ` · scheduled ${formatUkInstant(booking.reviewRequest.scheduledAt)}`
                          : ""}
                      </span>
                    ) : booking.reviewRequest?.scheduledAt &&
                      booking.reviewRequest?.status !== "failed" ? (
                      <span className="mt-2 block text-xs text-white/45">
                        Scheduled {formatUkInstant(booking.reviewRequest.scheduledAt)}
                      </span>
                    ) : null}
                    {booking.reviewRequest?.status === "failed" && booking.reviewRequest.dueAt ? (
                      <span className="mt-2 block text-xs text-white/45">
                        Auto schedule kept for {formatUkInstant(booking.reviewRequest.dueAt)} until
                        send succeeds
                      </span>
                    ) : null}
                    {booking.reviewRequest?.sentAt ? (
                      <span className="mt-1 block text-xs text-white/45">
                        Sent {formatUkInstant(booking.reviewRequest.sentAt)}
                      </span>
                    ) : null}
                    {booking.reviewRequest?.status === "failed" && booking.reviewRequest.lastError ? (
                      <span className="mt-1 block text-xs text-red-200/80">
                        Failed: {booking.reviewRequest.lastError}
                      </span>
                    ) : null}
                  </dd>
                </div>
              </dl>

              {booking.status !== "refunded" ? (
                <>
                  <PaidBookingLiveTracking
                    ownerKey={ownerKey}
                    booking={booking}
                    onBusy={setBusyRef}
                    onMessage={setMessage}
                    onError={setError}
                    onTrackingToken={(paymentReference, token, trackUrl) => {
                      setBookings((current) =>
                        current.map((entry) =>
                          entry.paymentReference === paymentReference
                            ? { ...entry, trackingToken: token, trackUrl }
                            : entry,
                        ),
                      );
                    }}
                    onSharingChange={(active) => {
                      setBookings((current) =>
                        current.map((entry) =>
                          entry.paymentReference === booking.paymentReference
                            ? { ...entry, sharingActive: active }
                            : entry,
                        ),
                      );
                    }}
                    onJourneyCompleted={(update) => {
                      setBookings((current) =>
                        current.map((entry) =>
                          entry.paymentReference === booking.paymentReference
                            ? {
                                ...entry,
                                trackingToken: update.token,
                                sharingActive: false,
                                journeyStatus: update.journeyStatus,
                                journeyCompletedAt: update.journeyCompletedAt,
                                reviewRequest: update.reviewRequest ?? entry.reviewRequest,
                              }
                            : entry,
                        ),
                      );
                    }}
                  />

                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                        Journey
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        {booking.journeyStatus !== "completed" ? (
                          <button
                            type="button"
                            disabled={busyRef === booking.paymentReference}
                            onClick={() => void handleCompleteJourney(booking)}
                            className="min-h-11 w-full rounded-xl border border-sky-400/40 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-sky-100 transition-colors hover:bg-sky-500/25 disabled:opacity-60 sm:w-auto"
                          >
                            Complete Journey
                          </button>
                        ) : null}
                        {booking.journeyStatus === "completed" ||
                        booking.trackingToken ||
                        (diagnostics[booking.paymentReference]?.gpsPointCount ?? 0) > 0 ? (
                          <a
                            href={`/owner/journey-evidence/?ref=${encodeURIComponent(booking.paymentReference)}`}
                            className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold transition-colors sm:w-auto ${
                              booking.journeyStatus === "completed"
                                ? "bg-sky-500 text-navy hover:bg-sky-400"
                                : "border border-sky-400/40 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25"
                            }`}
                          >
                            View Journey Evidence
                          </a>
                        ) : null}
                        <button
                          type="button"
                          disabled={busyRef === booking.paymentReference}
                          onClick={() => void handleEnsureTracking(booking)}
                          className="min-h-11 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60 sm:w-auto"
                        >
                          {booking.trackingToken
                            ? "Refresh tracking link"
                            : "Create tracking (no new charge)"}
                        </button>
                      </div>
                    </div>

                    {(booking.customerEmail || booking.mobileNumber) && (
                      <div>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                          Customer
                        </p>
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          {booking.customerEmail ? (
                            <a
                              href={`mailto:${encodeURIComponent(booking.customerEmail)}`}
                              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 sm:w-auto"
                            >
                              Email customer
                            </a>
                          ) : null}
                          {booking.mobileNumber ? (
                            <a
                              href={`https://wa.me/${booking.mobileNumber.replace(/\D/g, "").replace(/^0/, "44")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 sm:w-auto"
                            >
                              WhatsApp
                            </a>
                          ) : null}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                        Admin
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <button
                          type="button"
                          disabled={busyRef === booking.paymentReference}
                          onClick={() => void handleResend(booking)}
                          className="min-h-11 w-full rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy transition-colors hover:bg-emerald-light disabled:opacity-60 sm:w-auto"
                        >
                          {busyRef === booking.paymentReference
                            ? "Sending…"
                            : "Resend booking confirmation"}
                        </button>
                        {booking.journeyStatus === "completed" || booking.reviewRequest ? (
                          booking.reviewRequest?.status === "sent" ? (
                            <button
                              type="button"
                              disabled={busyRef === booking.paymentReference}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "A review request was already sent. Send another copy to the customer?",
                                  )
                                ) {
                                  void handleReviewRequest(booking, true);
                                }
                              }}
                              className="min-h-11 w-full rounded-xl border border-amber-300/40 px-4 py-2.5 text-sm font-semibold text-amber-100 transition-colors hover:border-amber-200/60 disabled:opacity-60 sm:w-auto"
                            >
                              Resend review request
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyRef === booking.paymentReference}
                              onClick={() => void handleReviewRequest(booking, false)}
                              className="min-h-11 w-full rounded-xl border border-emerald/40 bg-emerald/15 px-4 py-2.5 text-sm font-semibold text-emerald transition-colors hover:bg-emerald/25 disabled:opacity-60 sm:w-auto"
                            >
                              {booking.reviewRequest?.status === "failed"
                                ? "Retry review request"
                                : "Send review request"}
                            </button>
                          )
                        ) : null}
                        <button
                          type="button"
                          disabled={
                            diagnosticBusyRef === booking.paymentReference ||
                            busyRef === booking.paymentReference
                          }
                          onClick={() => void handleTrackingDiagnostic(booking)}
                          className="min-h-11 w-full rounded-xl border border-emerald/40 bg-emerald/10 px-4 py-2.5 text-sm font-semibold text-emerald transition-colors hover:bg-emerald/20 disabled:opacity-60 sm:w-auto"
                        >
                          {diagnosticBusyRef === booking.paymentReference
                            ? "Loading diagnostic…"
                            : "Tracking diagnostic (read-only)"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {diagnostics[booking.paymentReference] ? (
                    <TrackingDiagnosticView
                      report={diagnostics[booking.paymentReference]}
                    />
                  ) : null}
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
