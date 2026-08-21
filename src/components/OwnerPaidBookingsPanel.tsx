"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  assignedDriverDisplay,
  formatDisplayTripDate,
  groupCompletedBookingsByDay,
  isCompletedWorkBooking,
  isOwnerOperationalTestBooking,
  isUpcomingWorkBooking,
  journeyStatusLabel,
  nextUnfinishedSortKey,
  ownerUpcomingPrimaryJourneyActions,
  relevantUpcomingJourneyDate,
  relevantUpcomingJourneyTime,
  resolveCompletionTimestamp,
  upcomingBucketForTripDate,
} from "../../shared/upcoming-jobs";
import { JOURNEY_ACTION_LABELS } from "@/lib/tracking-api";
import {
  activeLegPickupLabel,
  buildArrivedPickupWhatsAppLink,
  buildArrivedPickupWhatsAppMessage,
  buildDriverOnTheWayWhatsAppLink,
  isAirportPickupLabel,
  type ArrivalVehicleDetails,
} from "../../shared/arrival-whatsapp";
import { formatUkInstant } from "../../shared/uk-time";
import OwnerEditBookingModal from "@/components/OwnerEditBookingModal";
import OwnerCancelRefundModal from "@/components/OwnerCancelRefundModal";
import {
  fetchOwnerPaidBookings,
  fetchOwnerPendingCheckouts,
  fetchRefundDiagnostics,
  fetchTrackingDiagnostic,
  finalizePaidCheckoutRecovery,
  resendPaidBookingConfirmation,
  sendOwnerReviewRequest,
  sendUpdatedBookingConfirmation,
  type OwnerPaidBookingSummary,
  type OwnerPendingCheckoutSummary,
  type OwnerReviewRequestSummary,
  type RefundDiagnosticsReport,
  type TrackingDiagnosticReport,
} from "@/lib/paid-bookings-api";
import type { RefundIssueResponse } from "@/lib/refund-api";
import { markBookingRefundedExternally } from "@/lib/refund-api";
import {
  ensurePaidBookingTracking,
  fetchDriverVehicle,
  fetchOwnerAccountProfile,
  postDriverLocation,
  postJourneyAction,
  type JourneyAction,
} from "@/lib/tracking-api";
import {
  canMarkExternalRefund,
  isOperationallyCancelled,
  remainingRefundableBalance,
  roundGbp,
} from "../../shared/refund-ops";
import { SERVICE_FLAGS } from "@/lib/data";

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

function formatArrivedPickupHhMm(iso?: string): string {
  if (!iso?.trim()) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function arrivalNotificationLabel(booking: OwnerPaidBookingSummary): string {
  const status = booking.arrivalNotificationStatus;
  if (status === "sent") {
    const via =
      booking.arrivalNotificationProvider === "email"
        ? "Email"
        : booking.arrivalNotificationProvider === "sms"
          ? "SMS"
          : booking.arrivalNotificationProvider === "whatsapp"
            ? "WhatsApp"
            : booking.arrivalNotificationProvider
              ? String(booking.arrivalNotificationProvider)
              : "Email";
    return `Sent via ${via}`;
  }
  if (status === "failed") return "Failed";
  // Only show "Not configured" when the Worker recorded that no provider could send.
  if (status === "not_configured") return "Not configured";
  if (status === "skipped") return "Skipped";
  // No Arrived at Pickup attempt yet — Resend may still be available.
  if (!booking.arrivedPickupAt) return "Not sent yet";
  return "Pending";
}

function paymentStatusLabel(booking: OwnerPaidBookingSummary): string {
  switch (booking.status) {
    case "refunded":
      return "Refunded + cancelled";
    case "refunded_active":
      return "Fully refunded (active)";
    case "partially_refunded":
      return "Partially refunded";
    case "cancelled":
      return "Cancelled";
    default:
      return "Paid";
  }
}

function openWhatsAppDeepLink(href: string) {
  const opened = window.open(href, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.assign(href);
  }
}

/** Prefer booking mobile; tolerate legacy empty/whitespace. */
function bookingCustomerMobile(booking: OwnerPaidBookingSummary): string {
  return booking.mobileNumber?.trim() || "";
}

async function openArrivalWhatsAppForBooking(
  ownerKey: string,
  booking: OwnerPaidBookingSummary,
): Promise<"opened" | "no_mobile"> {
  const mobile = bookingCustomerMobile(booking);
  if (!mobile) return "no_mobile";

  const pickupLabel = activeLegPickupLabel(booking);
  const vehicle = await resolveArrivalVehicleForBooking(ownerKey, booking);
  const message = buildArrivedPickupWhatsAppMessage({
    isAirportPickup: isAirportPickupLabel(pickupLabel),
    vehicle,
  });
  openWhatsAppDeepLink(buildArrivedPickupWhatsAppLink(mobile, message));
  return "opened";
}

function openOnTheWayWhatsAppForBooking(
  booking: OwnerPaidBookingSummary,
): "opened" | "no_mobile" {
  const mobile = bookingCustomerMobile(booking);
  if (!mobile) return "no_mobile";
  openWhatsAppDeepLink(buildDriverOnTheWayWhatsAppLink(mobile));
  return "opened";
}

async function resolveArrivalVehicleForBooking(
  ownerKey: string,
  booking: OwnerPaidBookingSummary,
): Promise<ArrivalVehicleDetails | null> {
  const assigned = booking.assignedDriverName?.trim();
  if (assigned) {
    try {
      const profile = await fetchDriverVehicle(ownerKey, assigned);
      if (
        profile?.colour?.trim() &&
        profile.make?.trim() &&
        profile.model?.trim() &&
        profile.registration?.trim()
      ) {
        return {
          colour: profile.colour.trim(),
          make: profile.make.trim(),
          model: profile.model.trim(),
          registration: profile.registration.trim().toUpperCase(),
        };
      }
    } catch {
      // Fall through to owner profile.
    }
  }

  try {
    const { profile, complete } = await fetchOwnerAccountProfile(ownerKey);
    if (
      complete &&
      profile?.colour?.trim() &&
      profile.make?.trim() &&
      profile.model?.trim() &&
      profile.registration?.trim()
    ) {
      return {
        colour: profile.colour.trim(),
        make: profile.make.trim(),
        model: profile.model.trim(),
        registration: profile.registration.trim().toUpperCase(),
      };
    }
  } catch {
    return null;
  }

  return null;
}

function sortByTripDateTime(a: OwnerPaidBookingSummary, b: OwnerPaidBookingSummary): number {
  return nextUnfinishedSortKey(a).localeCompare(nextUnfinishedSortKey(b));
}

function sortCompletedByCompletionTime(
  a: OwnerPaidBookingSummary,
  b: OwnerPaidBookingSummary,
): number {
  const aAt = resolveCompletionTimestamp(a)?.at || "";
  const bAt = resolveCompletionTimestamp(b)?.at || "";
  return bAt.localeCompare(aAt);
}

function PaidBookingLiveTracking({
  ownerKey,
  booking,
  onBusy,
  onMessage,
  onError,
  onTrackingToken,
  onSharingChange,
  onJourneyStatus,
}: {
  ownerKey: string;
  booking: OwnerPaidBookingSummary;
  onBusy: (ref: string) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
  onTrackingToken: (paymentReference: string, token: string, trackUrl: string) => void;
  onSharingChange: (active: boolean) => void;
  onJourneyStatus?: (paymentReference: string, journeyStatus: string) => void;
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
      onJourneyStatus?.(booking.paymentReference, result.journeyStatus ?? "tracking");
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
        const result = await postJourneyAction(ownerKey, token, "stop_tracking");
        onJourneyStatus?.(booking.paymentReference, result.journeyStatus ?? "stopped");
      }
      setLocalActive(false);
      clearWatch();
      setGps(null);
      onSharingChange(false);
      onMessage(
        "Live tracking stopped (GPS sharing off). Use Journey controls below when the passenger trip has finished.",
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not stop live tracking");
    } finally {
      setBusy(false);
      onBusy("");
    }
  };

  const sessionOn = localActive;
  const journeyCompleted = booking.journeyStatus === "completed";
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
            <span className="inline-flex min-h-11 items-center rounded-xl border border-emerald/40 bg-emerald/15 px-4 py-2 text-sm font-semibold text-emerald">
              Journey completed
            </span>
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
        </div>
      </div>
    </div>
  );
}

function yesNo(value: boolean | undefined): string {
  if (value === true) return "YES";
  if (value === false) return "NO";
  return "—";
}

function moneyGbp(amount: number | undefined | null): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
  return `£${roundGbp(amount).toFixed(2)}`;
}

function RefundDiagnosticView({ report }: { report: RefundDiagnosticsReport }) {
  const latest = report.latestRefundOperation;
  return (
    <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3">
      <p className="text-sm font-semibold text-amber-100">Refund diagnostics (read-only)</p>
      <p className="mt-1 text-xs text-amber-100/70">
        Owner-only. No access keys, SumUp API keys, or card details are shown.
      </p>
      <dl className="mt-3 grid gap-2 text-xs text-white/80 sm:grid-cols-2">
        <div>
          <dt className="text-white/40">REFUND_COORDINATOR configured</dt>
          <dd className="mt-0.5 font-semibold text-white">
            {yesNo(report.coordinatorConfigured)}
          </dd>
        </div>
        <div>
          <dt className="text-white/40">SumUp secrets present</dt>
          <dd className="mt-0.5 font-semibold text-white">{yesNo(report.sumUpConfigured)}</dd>
        </div>
        <div>
          <dt className="text-white/40">Payment reference</dt>
          <dd className="mt-0.5 break-all font-mono text-white">{report.paymentReference}</dd>
        </div>
        <div>
          <dt className="text-white/40">SumUp transaction ID</dt>
          <dd className="mt-0.5 break-all font-mono text-white">
            {report.transactionId || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-white/40">Original amount</dt>
          <dd className="mt-0.5 text-white">{moneyGbp(report.originalAmount)}</dd>
        </div>
        <div>
          <dt className="text-white/40">Refunded amount</dt>
          <dd className="mt-0.5 text-white">{moneyGbp(report.amountRefunded)}</dd>
        </div>
        <div>
          <dt className="text-white/40">Remaining refundable</dt>
          <dd className="mt-0.5 text-white">{moneyGbp(report.remainingRefundable)}</dd>
        </div>
        <div>
          <dt className="text-white/40">Operational / payment / combined</dt>
          <dd className="mt-0.5 text-white">
            {report.operationalStatus || "—"} / {report.paymentStatus || "—"} /{" "}
            {report.combinedStatus || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-white/40">Calendar events / tracking token</dt>
          <dd className="mt-0.5 text-white">
            {report.calendarEventCount ?? 0} / {yesNo(report.trackingTokenPresent)}
          </dd>
        </div>
        <div>
          <dt className="text-white/40">Refund history entries</dt>
          <dd className="mt-0.5 text-white">{report.refundHistoryCount ?? 0}</dd>
        </div>
        {latest ? (
          <>
            <div className="sm:col-span-2">
              <dt className="text-white/40">Latest refund operation</dt>
              <dd className="mt-0.5 whitespace-pre-wrap font-mono text-[11px] text-white/75">
                {[
                  `auditId: ${latest.auditId}`,
                  `operationState: ${latest.operationState}`,
                  `actionKind: ${latest.actionKind ?? "—"}`,
                  `refundAmount: ${moneyGbp(latest.refundAmount)}`,
                  `cumulative: ${moneyGbp(latest.cumulativeRefundedAmount)}`,
                  `remaining: ${moneyGbp(latest.remainingBalance)}`,
                  `cancelBooking: ${latest.cancelBooking}`,
                  `sumUpStatus: ${latest.sumUpStatus ?? "—"}`,
                  `customerEmail: ${latest.customerEmailStatus}`,
                  `ownerEmail: ${latest.ownerEmailStatus}`,
                  `requestedAt: ${latest.requestedAt}`,
                  `processorAcceptedAt: ${latest.processorAcceptedAt ?? "—"}`,
                  `completedAt: ${latest.completedAt ?? "—"}`,
                  latest.failureDetail ? `failureDetail: ${latest.failureDetail}` : null,
                ]
                  .filter(Boolean)
                  .join("\n")}
              </dd>
            </div>
          </>
        ) : (
          <div className="sm:col-span-2">
            <dt className="text-white/40">Latest refund operation</dt>
            <dd className="mt-0.5 text-white/60">No refund audit entries yet.</dd>
          </div>
        )}
      </dl>
    </div>
  );
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
  const [refundDiagnostics, setRefundDiagnostics] = useState<
    Record<string, RefundDiagnosticsReport>
  >({});
  const [diagnosticBusyRef, setDiagnosticBusyRef] = useState("");
  const [refundDiagBusyRef, setRefundDiagBusyRef] = useState("");
  const [editingBooking, setEditingBooking] = useState<OwnerPaidBookingSummary | null>(null);
  const [offerUpdatedConfirmationRef, setOfferUpdatedConfirmationRef] = useState<string | null>(null);
  const [fareAdjustMessage, setFareAdjustMessage] = useState("");
  const [refundConfirmRef, setRefundConfirmRef] = useState<string | null>(null);
  const [externalRefundConfirmRef, setExternalRefundConfirmRef] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextBookings, nextPending] = await Promise.all([
        fetchOwnerPaidBookings(ownerKey, {
          mode: "upcoming",
          pastDays: 60,
          futureDays: 90,
          limit: 200,
        }),
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

  const operationalBookings = useMemo(
    () => bookings.filter((booking) => !isOwnerOperationalTestBooking(booking)),
    [bookings],
  );

  const upcomingJobs = useMemo(
    () =>
      operationalBookings
        .filter((booking) => isUpcomingWorkBooking(booking))
        .slice()
        .sort(sortByTripDateTime),
    [operationalBookings],
  );

  const completedRecent = useMemo(
    () =>
      operationalBookings
        .filter(isCompletedWorkBooking)
        .slice()
        .sort(sortCompletedByCompletionTime),
    [operationalBookings],
  );

  const completedDayGroups = useMemo(
    () => groupCompletedBookingsByDay(completedRecent),
    [completedRecent],
  );

  /** Compact ops list: money still owed back / retry-required refunds. */
  const refundsPending = useMemo(
    () =>
      operationalBookings
        .filter(
          (booking) =>
            typeof booking.refundDueAmount === "number" && booking.refundDueAmount > 0,
        )
        .slice()
        .sort(sortByTripDateTime),
    [operationalBookings],
  );

  const upcomingGroups = useMemo(() => {
    const today: OwnerPaidBookingSummary[] = [];
    const tomorrow: OwnerPaidBookingSummary[] = [];
    const later: OwnerPaidBookingSummary[] = [];
    for (const booking of upcomingJobs) {
      const bucket = upcomingBucketForTripDate(relevantUpcomingJourneyDate(booking));
      if (bucket === "tomorrow") tomorrow.push(booking);
      else if (bucket === "later") later.push(booking);
      else today.push(booking);
    }
    return [
      { key: "today", title: "Today", items: today },
      { key: "tomorrow", title: "Tomorrow", items: tomorrow },
      { key: "later", title: "Later", items: later },
    ] as const;
  }, [upcomingJobs]);

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

  async function handleSendUpdatedConfirmation(booking: OwnerPaidBookingSummary) {
    setBusyRef(booking.paymentReference);
    setError("");
    setMessage("");
    try {
      const result = await sendUpdatedBookingConfirmation(ownerKey, booking.paymentReference);
      if (!result.ok) {
        throw new Error(result.error || "Updated confirmation could not be sent");
      }
      setOfferUpdatedConfirmationRef(null);
      setFareAdjustMessage("");
      setMessage(
        result.customerEmail
          ? `Updated booking confirmation resent to ${result.customerEmail}.`
          : "Updated booking confirmation resent.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send updated confirmation");
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

  async function handleRefundDiagnostic(booking: OwnerPaidBookingSummary) {
    setRefundDiagBusyRef(booking.paymentReference);
    setError("");
    try {
      const report = await fetchRefundDiagnostics(ownerKey, booking.paymentReference);
      setRefundDiagnostics((current) => ({
        ...current,
        [booking.paymentReference]: report,
      }));
      setMessage(
        report.coordinatorConfigured
          ? `Refund diagnostics loaded for ${booking.paymentReference} (coordinator YES).`
          : `Refund diagnostics loaded — WARNING: REFUND_COORDINATOR not configured.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load refund diagnostics");
    } finally {
      setRefundDiagBusyRef("");
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

  async function handleJourneyAction(
    booking: OwnerPaidBookingSummary,
    action: JourneyAction,
    options?: { retryArrivalNotification?: boolean },
  ) {
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

      const result = await postJourneyAction(ownerKey, token, action, options);
      setBookings((current) =>
        current.map((entry) =>
          entry.paymentReference === booking.paymentReference
            ? {
                ...entry,
                trackingToken: token,
                trackUrl: result.trackUrl || entry.trackUrl,
                sharingActive: result.sharingActive,
                journeyStatus: result.journeyStatus,
                journeyCompletedAt: result.journeyCompletedAt ?? entry.journeyCompletedAt,
                arrivedPickupAt: result.arrivedPickupAt ?? entry.arrivedPickupAt,
                arrivalNotificationStatus:
                  result.arrivalNotificationStatus ?? entry.arrivalNotificationStatus,
                arrivalNotificationSentAt:
                  result.arrivalNotificationSentAt ?? entry.arrivalNotificationSentAt,
                arrivalNotificationProvider:
                  result.arrivalNotificationProvider ?? entry.arrivalNotificationProvider,
                arrivalNotificationError:
                  result.arrivalNotificationError ?? entry.arrivalNotificationError,
                reviewRequest: result.reviewRequest ?? entry.reviewRequest,
              }
            : entry,
        ),
      );

      if (action === "complete_journey") {
        setMessage(
          result.reviewRequest?.dueAt
            ? `Journey completed. Google review request scheduled for ${formatUkInstant(result.reviewRequest.dueAt)}.`
            : "Journey completed. Review request will be scheduled automatically.",
        );
        // Refresh so Upcoming / Completed split uses both legs' statuses.
        void load();
      } else if (action === "arrived_pickup") {
        const notify =
          result.arrivalNotificationStatus === "sent"
            ? " Customer emailed."
            : result.arrivalNotificationStatus === "failed"
              ? " Customer email failed — use Retry Notification."
              : result.arrivalNotificationStatus === "not_configured"
                ? " Arrival email not configured."
                : "";

        const mobile = bookingCustomerMobile(booking);
        const openWhatsApp = !options?.retryArrivalNotification && Boolean(mobile);
        if (openWhatsApp) {
          await openArrivalWhatsAppForBooking(ownerKey, booking);
          setMessage(
            result.idempotent
              ? `Already arrived at pickup${result.arrivedPickupAt ? ` (${formatArrivedPickupHhMm(result.arrivedPickupAt)})` : ""}.${notify} WhatsApp opened — press Send to message the customer.`
              : `Arrived at pickup recorded.${notify} WhatsApp opened — press Send to message the customer.`,
          );
        } else if (!mobile && !options?.retryArrivalNotification) {
          setMessage(
            result.idempotent
              ? `Already arrived at pickup.${notify} No customer mobile on this booking for WhatsApp.`
              : `Arrived at pickup recorded.${notify} No customer mobile on this booking for WhatsApp.`,
          );
        } else {
          setMessage(
            options?.retryArrivalNotification
              ? result.arrivalNotificationStatus === "sent"
                ? "Arrival notification resent successfully."
                : `Arrived at pickup recorded.${notify}`
              : result.idempotent
                ? `Already arrived at pickup.${notify}`
                : `Arrived at pickup recorded.${notify}`,
          );
        }
      } else if (action === "start_tracking") {
        const notify =
          result.onTheWayNotificationStatus === "sent"
            ? " Customer emailed (Driver on the way)."
            : result.onTheWayNotificationStatus === "failed"
              ? " On-the-way email failed."
              : result.onTheWayNotificationStatus === "not_configured"
                ? " On-the-way email not configured."
                : "";
        const wa = openOnTheWayWhatsAppForBooking(booking);
        setMessage(
          result.idempotent
            ? `Already marked Driver on the way.${notify}${
                wa === "opened"
                  ? " WhatsApp opened — press Send (live location stays manual in WhatsApp)."
                  : " No customer mobile on this booking for WhatsApp."
              }`
            : `Driver on the way recorded.${notify}${
                wa === "opened"
                  ? " WhatsApp opened — press Send (live location stays manual in WhatsApp)."
                  : " No customer mobile on this booking for WhatsApp."
              }`,
        );
      } else if (options?.retryArrivalNotification) {
        setMessage(
          result.arrivalNotificationStatus === "sent"
            ? "Arrival notification resent successfully."
            : result.arrivalNotificationStatus === "failed"
              ? `Retry failed${result.arrivalNotificationError ? `: ${result.arrivalNotificationError}` : "."}`
              : "Arrival notification retry finished.",
        );
      } else {
        setMessage(result.journeyStatusLabel || `Journey updated: ${result.journeyStatus}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update journey");
    } finally {
      setBusyRef("");
    }
  }

  async function handleCancelRefundSuccess(
    result: RefundIssueResponse,
    booking: OwnerPaidBookingSummary,
  ) {
    setRefundConfirmRef(null);
    setExternalRefundConfirmRef(null);
    setBookings((current) =>
      current.map((entry) =>
        entry.paymentReference === booking.paymentReference
          ? {
              ...entry,
              status: (result.status as OwnerPaidBookingSummary["status"]) || entry.status,
              operationalStatus:
                (result.operationalStatus as OwnerPaidBookingSummary["operationalStatus"]) ||
                entry.operationalStatus,
              paymentStatus:
                (result.paymentStatus as OwnerPaidBookingSummary["paymentStatus"]) ||
                entry.paymentStatus,
              amountRefunded:
                typeof result.cumulativeRefunded === "number"
                  ? result.cumulativeRefunded
                  : entry.amountRefunded,
              sharingActive: result.cancelBooking ? false : entry.sharingActive,
              journeyStatus: result.cancelBooking ? "completed" : entry.journeyStatus,
            }
          : entry,
      ),
    );
    const bits = [
      result.alreadyProcessed
        ? "Already processed (idempotent)"
        : result.alreadyRefunded
          ? "Already fully refunded"
          : result.sumUpRefunded === false && (result.refundAmountValue ?? 0) > 0
            ? "Marked refunded externally (no SumUp call)"
            : "Action completed",
      result.refundAmountValue && result.refundAmountValue > 0 && result.sumUpRefunded
        ? `refund ${result.refundAmount}`
        : result.sumUpRefunded === false
          ? "no SumUp / payment API"
          : "no SumUp refund",
      result.cancelBooking ? "booking cancelled · journey closed" : "booking remains active",
      result.customerEmailSent ? "customer email sent" : "no customer refund email",
      result.ownerEmailSent ? "owner email sent" : null,
    ].filter(Boolean);
    setMessage(`${booking.paymentReference}: ${bits.join(" · ")}`);
    await load();
  }

  async function handleMarkExternalRefund(booking: OwnerPaidBookingSummary) {
    setBusyRef(booking.paymentReference);
    setError("");
    setMessage("");
    try {
      const result = await markBookingRefundedExternally({
        ownerKey,
        confirmOwnerKey: ownerKey,
        paymentReference: booking.paymentReference,
        trackingToken: booking.trackingToken,
      });
      if (!result.ok) {
        throw new Error(result.error || "Could not mark booking as refunded");
      }
      await handleCancelRefundSuccess(result, booking);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark booking as refunded");
      setExternalRefundConfirmRef(null);
    } finally {
      setBusyRef("");
    }
  }

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

  const needsFinalize = pending.filter((item) => item.needsFinalize);

  function renderJourneyControls(booking: OwnerPaidBookingSummary) {
    // Live sharing without an explicit status still counts as tracking for labels.
    const rawStatus = booking.journeyStatus || "idle";
    const status =
      booking.sharingActive && (rawStatus === "idle" || !booking.journeyStatus)
        ? "tracking"
        : rawStatus;
    const busy = busyRef === booking.paymentReference;
    const showEvidence =
      status === "completed" ||
      Boolean(booking.trackingToken) ||
      (diagnostics[booking.paymentReference]?.gpsPointCount ?? 0) > 0;

    const primaryActions = ownerUpcomingPrimaryJourneyActions({
      journeyStatus: booking.journeyStatus,
      sharingActive: booking.sharingActive,
      bookingStatus: booking.status,
    }).map((action) => ({
      action,
      label: JOURNEY_ACTION_LABELS[action],
    }));

    const secondaryActions: { action: JourneyAction; label: string }[] = [];
    if (status === "arrived_pickup") {
      secondaryActions.push({ action: "complete_journey", label: "Complete Journey" });
    } else if (status === "en_route") {
      secondaryActions.push({
        action: "arrived_destination",
        label: "Arrived at Destination",
      });
    } else if (status === "arrived_destination") {
      secondaryActions.push({ action: "complete_journey", label: "Complete Journey" });
    } else if (
      status !== "completed" &&
      !isOperationallyCancelled(booking.status) &&
      (status === "idle" || status === "stopped" || status === "tracking")
    ) {
      secondaryActions.push({ action: "complete_journey", label: "Complete Journey" });
    }

    const paidNum = parseFloat(String(booking.amountPaid).replace(/[^\d.]/g, "") || "0");
    const refundedNum =
      typeof booking.amountRefunded === "number"
        ? booking.amountRefunded
        : booking.status === "refunded" || booking.status === "refunded_active"
          ? paidNum
          : 0;
    const showMarkExternalRefund = canMarkExternalRefund({
      status: booking.status,
      operationalStatus: booking.operationalStatus,
      paymentStatus: booking.paymentStatus,
      amountPaid: paidNum,
      amountRefunded: refundedNum,
    });
    const externalConfirmOpen = externalRefundConfirmRef === booking.paymentReference;

    return (
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Driver updates
        </p>
        {status === "arrived_pickup" && booking.arrivedPickupAt ? (
          <p className="mb-2 text-sm font-semibold text-emerald">
            Driver has arrived · {formatArrivedPickupHhMm(booking.arrivedPickupAt)}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {status === "completed" ? (
            <a
              href={`/owner/journey-evidence/?ref=${encodeURIComponent(booking.paymentReference)}`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-sky-400 sm:w-auto"
            >
              View Journey Evidence
            </a>
          ) : (
            <>
              {primaryActions.map((item) => {
                const isArrivedCta = item.action === "arrived_pickup";
                return (
                  <button
                    key={item.action}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleJourneyAction(booking, item.action)}
                    className={
                      isArrivedCta
                        ? "min-h-12 w-full rounded-xl bg-emerald px-4 py-3 text-base font-bold text-navy transition-colors hover:bg-emerald/90 disabled:opacity-60 sm:w-auto"
                        : "min-h-11 w-full rounded-xl border border-sky-400/40 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-sky-100 transition-colors hover:bg-sky-500/25 disabled:opacity-60 sm:w-auto"
                    }
                  >
                    {busy ? "Updating…" : item.label}
                  </button>
                );
              })}
              {status === "arrived_pickup" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      setBusyRef(booking.paymentReference);
                      setError("");
                      try {
                        const outcome = await openArrivalWhatsAppForBooking(ownerKey, booking);
                        setMessage(
                          outcome === "opened"
                            ? "WhatsApp arrival message opened — press Send to message the customer. Arrival time was not changed."
                            : "No customer mobile on this booking for WhatsApp.",
                        );
                      } catch (err) {
                        setError(
                          err instanceof Error ? err.message : "Could not open WhatsApp",
                        );
                      } finally {
                        setBusyRef("");
                      }
                    })();
                  }}
                  className="min-h-11 w-full rounded-xl border border-emerald/40 bg-emerald/15 px-4 py-2.5 text-sm font-bold text-emerald transition-colors hover:bg-emerald/25 disabled:opacity-60 sm:w-auto"
                >
                  Open WhatsApp arrival message
                </button>
              ) : null}
            </>
          )}
          {booking.arrivalNotificationStatus === "failed" && status !== "completed" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void handleJourneyAction(booking, "arrived_pickup", {
                  retryArrivalNotification: true,
                })
              }
              className="min-h-11 w-full rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/25 disabled:opacity-60 sm:w-auto"
            >
              {busy ? "Retrying…" : "Retry Notification"}
            </button>
          ) : null}
        </div>
        {status !== "completed" && status !== "arrived_pickup" && status !== "arrived_destination" ? (
          <p className="mt-2 text-xs text-white/45">
            Driver on the way emails the customer and opens WhatsApp (you press Send). Driver has
            arrived records the time, emails the customer, and opens WhatsApp. Live location sharing
            stays manual in WhatsApp — not website map tracking.
          </p>
        ) : null}
        {status === "arrived_pickup" ? (
          <p className="mt-2 text-xs text-white/45">
            Arrival already recorded (timestamp kept). Re-open WhatsApp if needed, then Complete
            Journey when the passenger trip has finished (under More actions).
          </p>
        ) : null}

        {status !== "completed" ? (
          <details className="mt-3 rounded-xl border border-white/10 bg-navy/40">
            <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-white/50 marker:content-none [&::-webkit-details-marker]:hidden">
              More actions
            </summary>
            <div className="flex flex-col gap-2 border-t border-white/10 px-3 py-3 sm:flex-row sm:flex-wrap">
              {secondaryActions.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  disabled={busy}
                  onClick={() => void handleJourneyAction(booking, item.action)}
                  className="min-h-11 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60 sm:w-auto"
                >
                  {busy ? "Updating…" : item.label}
                </button>
              ))}
              {showMarkExternalRefund && !externalConfirmOpen ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRefundConfirmRef(null);
                    setExternalRefundConfirmRef(booking.paymentReference);
                  }}
                  className="min-h-11 w-full rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/20 disabled:opacity-60 sm:w-auto"
                >
                  Mark as refunded
                </button>
              ) : null}
              {showEvidence ? (
                <a
                  href={`/owner/journey-evidence/?ref=${encodeURIComponent(booking.paymentReference)}`}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-sky-400/40 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-sky-100 transition-colors hover:bg-sky-500/25 sm:w-auto"
                >
                  View Journey Evidence
                </a>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleEnsureTracking(booking)}
                className="min-h-11 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60 sm:w-auto"
              >
                {booking.trackingToken ? "Refresh tracking link" : "Create tracking (no new charge)"}
              </button>
            </div>
          </details>
        ) : null}

        {showMarkExternalRefund && status === "completed" && !externalConfirmOpen ? (
          <div className="mt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRefundConfirmRef(null);
                setExternalRefundConfirmRef(booking.paymentReference);
              }}
              className="min-h-11 w-full rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/20 disabled:opacity-60 sm:w-auto"
            >
              Mark as refunded
            </button>
          </div>
        ) : null}

        {externalConfirmOpen ? (
          <div className="mt-3 rounded-xl border border-amber-400/35 bg-amber-500/10 p-3">
            <p className="text-sm font-semibold text-amber-50">
              Has this customer already been refunded manually in SumUp?
            </p>
            <p className="mt-2 text-xs leading-relaxed text-amber-50/80">
              This does not call SumUp or issue money. It closes the booking as Cancelled /
              Refunded, removes it from Upcoming, and keeps the original payment for audit. No
              refund email is sent.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleMarkExternalRefund(booking)}
                className="min-h-11 w-full rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-amber-200 disabled:opacity-60 sm:w-auto"
              >
                {busy ? "Closing…" : "Yes — close as refunded"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setExternalRefundConfirmRef(null)}
                className="min-h-11 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60 sm:w-auto"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderBookingCard(booking: OwnerPaidBookingSummary, options?: { compact?: boolean }) {
    const isClosed = isOperationallyCancelled(booking.status);
    const isCompleted = booking.journeyStatus === "completed";
    const canEdit = !isClosed && !isCompleted;
    const canAdminConfirm = !isClosed && !isCompleted;
    const showOfferUpdated =
      offerUpdatedConfirmationRef === booking.paymentReference && canAdminConfirm;
    const refundOpen = refundConfirmRef === booking.paymentReference;
    const paidNum = parseFloat(String(booking.amountPaid).replace(/[^\d.]/g, "") || "0");
    const refundedNum =
      typeof booking.amountRefunded === "number"
        ? booking.amountRefunded
        : booking.status === "refunded" || booking.status === "refunded_active"
          ? paidNum
          : 0;
    const remainingNum = remainingRefundableBalance(paidNum, refundedNum);
    // Allow cancel/refund while operationally open (incl. refunded_active → cancel-only),
    // or when money remains on an already-cancelled booking.
    const canRefundOrCancel =
      !isOperationallyCancelled(booking) || remainingNum > 0.001;
    const showMarkExternalRefund = canMarkExternalRefund({
      status: booking.status,
      operationalStatus: booking.operationalStatus,
      paymentStatus: booking.paymentStatus,
      amountPaid: paidNum,
      amountRefunded: refundedNum,
    });
    const externalConfirmOpen = externalRefundConfirmRef === booking.paymentReference;

    return (
      <li
        key={booking.paymentReference}
        className="rounded-2xl border border-white/10 bg-navy/60 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words text-lg font-bold text-white">{booking.customerName}</p>
            <p className="mt-1 break-words text-sm text-white/65">
              {(() => {
                const nextDate = relevantUpcomingJourneyDate(booking);
                const nextTime = relevantUpcomingJourneyTime(booking) || "—";
                const isReturnNext =
                  Boolean(booking.returnJourney) &&
                  nextDate === (booking.returnDate || "").trim() &&
                  nextDate !== (booking.tripDate || "").trim();
                return `${isReturnNext ? "Return · " : ""}${formatDisplayTripDate(nextDate)} · pick up ${nextTime}${
                  booking.amountPaid ? ` · ${booking.amountPaid}` : ""
                }`;
              })()}
            </p>
            {(refundedNum > 0 || booking.status === "partially_refunded" || booking.status === "refunded_active") && (
              <p className="mt-1 text-xs text-amber-100/90">
                Paid {booking.amountPaid}
                {` · refunded £${refundedNum.toFixed(2)}`}
                {` · remaining £${remainingNum.toFixed(2)}`}
                {booking.operationalStatus || booking.status
                  ? ` · ${booking.operationalStatus ?? "—"} / ${booking.paymentStatus ?? booking.status}`
                  : ""}
              </p>
            )}
            <p className="mt-2 break-words text-sm text-white/80">
              {(() => {
                const nextDate = relevantUpcomingJourneyDate(booking);
                const isReturnNext =
                  Boolean(booking.returnJourney) &&
                  nextDate === (booking.returnDate || "").trim() &&
                  nextDate !== (booking.tripDate || "").trim();
                return isReturnNext
                  ? `${booking.dropoffLabel} → ${booking.pickupLabel}`
                  : `${booking.pickupLabel} → ${booking.dropoffLabel}`;
              })()}
            </p>

            <p className="mt-2 break-all text-xs text-white/45">
              Ref {booking.paymentReference}
              {booking.createdAt ? ` · paid ${formatUkInstant(booking.createdAt)}` : ""}
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
              isClosed
                ? "border-red-400/30 bg-red-500/10 text-red-100"
                : booking.status === "partially_refunded"
                  ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
                  : "border-emerald/40 bg-emerald/15 text-emerald"
            }`}
          >
            {isClosed
              ? booking.status === "cancelled"
                ? "Cancelled"
                : "Refunded"
              : booking.status === "refunded_active"
                ? "Fully refunded · Active"
                : paymentStatusLabel(booking)}
          </span>
        </div>

        <dl className="mt-4 grid gap-2 text-sm text-white/70 sm:grid-cols-2">
          <div>
            <dt className="text-white/40">Date</dt>
            <dd>{formatDisplayTripDate(booking.tripDate)}</dd>
          </div>
          <div>
            <dt className="text-white/40">Pickup time</dt>
            <dd>{booking.tripTime || "—"}</dd>
          </div>
          <div>
            <dt className="text-white/40">Service</dt>
            <dd className="font-semibold text-white">
              {booking.vehicle
                ? booking.vehicle.toLowerCase().includes("minibus")
                  ? "MINIBUS"
                  : booking.vehicle.toLowerCase().includes("estate")
                    ? "ESTATE"
                    : booking.vehicle.toLowerCase().includes("saloon") ||
                        booking.vehicle.toLowerCase().includes("standard")
                      ? "SALOON"
                      : booking.vehicle
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-white/40">Customer</dt>
            <dd>{booking.customerName || "—"}</dd>
          </div>
          <div>
            <dt className="text-white/40">Journey fare</dt>
            <dd>
              {typeof booking.amount === "number"
                ? `£${booking.amount.toFixed(2)}`
                : booking.amountPaid || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-white/40">Collected</dt>
            <dd>{booking.amountPaid || "—"}</dd>
          </div>
          {typeof booking.amountRefunded === "number" && booking.amountRefunded > 0 ? (
            <div>
              <dt className="text-white/40">Refunded</dt>
              <dd>£{booking.amountRefunded.toFixed(2)}</dd>
            </div>
          ) : null}
          {typeof booking.refundDueAmount === "number" && booking.refundDueAmount > 0 ? (
            <div className="sm:col-span-2">
              <dt className="text-amber-200/80">Refund due</dt>
              <dd className="font-semibold text-amber-100">
                £{booking.refundDueAmount.toFixed(2)}
                {booking.refundDueReason ? ` — ${booking.refundDueReason}` : ""}
                {" "}(process via Cancel / Refund)
              </dd>
            </div>
          ) : null}
          {booking.lastUpdatedConfirmationError ? (
            <div className="sm:col-span-2">
              <dt className="text-red-200/80">Confirmation email</dt>
              <dd className="text-red-100">
                Delivery failed — {booking.lastUpdatedConfirmationError}. Use Resend Updated
                Confirmation.
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-white/40">Pickup</dt>
            <dd className="break-words">{booking.pickupLabel || "—"}</dd>
          </div>
          <div>
            <dt className="text-white/40">Destination</dt>
            <dd className="break-words">{booking.dropoffLabel || "—"}</dd>
          </div>
          <div>
            <dt className="text-white/40">Payment status</dt>
            <dd>{paymentStatusLabel(booking)}</dd>
          </div>
          <div>
            <dt className="text-white/40">Assigned driver</dt>
            <dd>
              {assignedDriverDisplay(booking.assignedDriverLabel, booking.assignedDriverName)}
            </dd>
          </div>
          <div>
            <dt className="text-white/40">Journey status</dt>
            <dd>{journeyStatusLabel(booking.journeyStatus)}</dd>
          </div>
          <div>
            <dt className="text-white/40">Mobile</dt>
            <dd>{booking.mobileNumber || "—"}</dd>
          </div>
          <div>
            <dt className="text-white/40">Email</dt>
            <dd className="break-all">{booking.customerEmail || "—"}</dd>
          </div>
          <div>
            <dt className="text-white/40">Return</dt>
            <dd>
              {booking.returnJourney
                ? `${booking.returnDate || "—"} · ${booking.returnTime || "—"}`
                : "No"}
            </dd>
          </div>
          {!options?.compact ? (
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
          ) : null}
        </dl>

        {!isClosed ? (
          <>
            {SERVICE_FLAGS.liveDriverTracking ? (
            <PaidBookingLiveTracking
              ownerKey={ownerKey}
              booking={booking}
              onBusy={setBusyRef}
              onMessage={setMessage}
              onError={setError}
              onTrackingToken={onTrackingTokenUpdate}
              onSharingChange={(active) => {
                setBookings((current) =>
                  current.map((entry) =>
                    entry.paymentReference === booking.paymentReference
                      ? { ...entry, sharingActive: active }
                      : entry,
                  ),
                );
              }}
              onJourneyStatus={(paymentReference, journeyStatus) => {
                setBookings((current) =>
                  current.map((entry) =>
                    entry.paymentReference === paymentReference
                      ? { ...entry, journeyStatus }
                      : entry,
                  ),
                );
              }}
            />
            ) : null}

            <div className="mt-4 space-y-4">
              {renderJourneyControls(booking)}

              {(booking.customerEmail || booking.mobileNumber || booking.arrivedPickupAt) && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    Customer contact
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
                  <div className="mt-3 space-y-1 text-sm text-white/70">
                    {booking.arrivedPickupAt ? (
                      <p>
                        Driver has arrived:{" "}
                        <span className="font-semibold text-white">
                          {formatArrivedPickupHhMm(booking.arrivedPickupAt)}
                        </span>
                      </p>
                    ) : null}
                    <p>
                      Customer notification:{" "}
                      <span className="font-semibold text-white">
                        {arrivalNotificationLabel(booking)}
                      </span>
                    </p>
                    {booking.arrivalNotificationStatus === "failed" &&
                    booking.arrivalNotificationError ? (
                      <p className="text-xs text-red-200/80">{booking.arrivalNotificationError}</p>
                    ) : null}
                  </div>
                </div>
              )}

              <details className="rounded-xl border border-white/10 bg-navy/40">
                <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-white/50 marker:content-none [&::-webkit-details-marker]:hidden">
                  Admin / More
                </summary>
                <div className="border-t border-white/10 px-3 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={busyRef === booking.paymentReference}
                      onClick={() => setEditingBooking(booking)}
                      className="min-h-11 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60 sm:w-auto"
                    >
                      Edit Booking
                    </button>
                  ) : null}
                  {canAdminConfirm ? (
                    <button
                      type="button"
                      disabled={busyRef === booking.paymentReference}
                      onClick={() => void handleSendUpdatedConfirmation(booking)}
                      className="min-h-11 w-full rounded-xl border border-sky-400/40 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-100 transition-colors hover:bg-sky-500/25 disabled:opacity-60 sm:w-auto"
                    >
                      {busyRef === booking.paymentReference
                        ? "Sending…"
                        : "Resend Updated Confirmation"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyRef === booking.paymentReference}
                    onClick={() => void handleResend(booking)}
                    className="min-h-11 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60 sm:w-auto"
                  >
                    {busyRef === booking.paymentReference
                      ? "Sending…"
                      : "Resend Confirmation"}
                  </button>
                  {isCompleted || booking.reviewRequest ? (
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
                    className="min-h-11 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:border-white/30 disabled:opacity-60 sm:w-auto"
                  >
                    {diagnosticBusyRef === booking.paymentReference
                      ? "Loading diagnostic…"
                      : "Tracking diagnostic (read-only)"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      refundDiagBusyRef === booking.paymentReference ||
                      busyRef === booking.paymentReference
                    }
                    onClick={() => void handleRefundDiagnostic(booking)}
                    className="min-h-11 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:border-white/30 disabled:opacity-60 sm:w-auto"
                  >
                    {refundDiagBusyRef === booking.paymentReference
                      ? "Loading refund diagnostics…"
                      : "Refund diagnostics (read-only)"}
                  </button>
                  {canRefundOrCancel ? (
                    <button
                      type="button"
                      disabled={busyRef === booking.paymentReference}
                      onClick={() => {
                        setExternalRefundConfirmRef(null);
                        setRefundConfirmRef(refundOpen ? null : booking.paymentReference);
                      }}
                      className="min-h-11 w-full rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-60 sm:w-auto"
                    >
                      Cancel / Refund
                    </button>
                  ) : null}
                  {showMarkExternalRefund && !externalConfirmOpen ? (
                    <button
                      type="button"
                      disabled={busyRef === booking.paymentReference}
                      onClick={() => {
                        setRefundConfirmRef(null);
                        setExternalRefundConfirmRef(booking.paymentReference);
                      }}
                      className="min-h-11 w-full rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/20 disabled:opacity-60 sm:w-auto"
                    >
                      Mark as refunded
                    </button>
                  ) : null}
                </div>

                {showOfferUpdated ? (
                  <div className="mt-3 rounded-xl border border-sky-400/30 bg-sky-500/10 p-3">
                    <p className="text-sm text-sky-100">
                      Booking saved. Send an updated confirmation to the customer?
                    </p>
                    {fareAdjustMessage ? (
                      <p className="mt-2 text-sm text-amber-100">{fareAdjustMessage}</p>
                    ) : null}
                    <button
                      type="button"
                      disabled={busyRef === booking.paymentReference}
                      onClick={() => void handleSendUpdatedConfirmation(booking)}
                      className="mt-3 min-h-11 w-full rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-sky-400 disabled:opacity-60 sm:w-auto"
                    >
                      Resend Updated Confirmation
                    </button>
                  </div>
                ) : null}

                {refundOpen ? (
                  <OwnerCancelRefundModal
                    ownerKey={ownerKey}
                    booking={booking}
                    busy={busyRef === booking.paymentReference}
                    onBusyChange={(next) =>
                      setBusyRef(next ? booking.paymentReference : "")
                    }
                    onClose={() => setRefundConfirmRef(null)}
                    onSuccess={(result) => void handleCancelRefundSuccess(result, booking)}
                    onError={(message) => setError(message)}
                  />
                ) : null}

                {externalConfirmOpen ? (
                  <div className="mt-3 rounded-xl border border-amber-400/35 bg-amber-500/10 p-3">
                    <p className="text-sm font-semibold text-amber-50">
                      Has this customer already been refunded manually in SumUp?
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-amber-50/80">
                      This does not call SumUp or issue money. It closes the booking as Cancelled /
                      Refunded, removes it from Upcoming, and keeps the original payment for audit.
                      No refund email is sent.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        disabled={busyRef === booking.paymentReference}
                        onClick={() => void handleMarkExternalRefund(booking)}
                        className="min-h-11 w-full rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-amber-200 disabled:opacity-60 sm:w-auto"
                      >
                        {busyRef === booking.paymentReference
                          ? "Closing…"
                          : "Yes — close as refunded"}
                      </button>
                      <button
                        type="button"
                        disabled={busyRef === booking.paymentReference}
                        onClick={() => setExternalRefundConfirmRef(null)}
                        className="min-h-11 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60 sm:w-auto"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                </div>
              </details>
            </div>

            {diagnostics[booking.paymentReference] ? (
              <TrackingDiagnosticView report={diagnostics[booking.paymentReference]} />
            ) : null}
            {refundDiagnostics[booking.paymentReference] ? (
              <RefundDiagnosticView report={refundDiagnostics[booking.paymentReference]} />
            ) : null}
          </>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-white/60">
              This booking is {booking.status === "cancelled" ? "cancelled" : "fully refunded"}.
              Journey evidence is retained.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <a
                href={`/owner/journey-evidence/?ref=${encodeURIComponent(booking.paymentReference)}`}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-sky-400/40 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-sky-100 transition-colors hover:bg-sky-500/25 sm:w-auto"
              >
                View Journey Evidence
              </a>
              <button
                type="button"
                disabled={
                  refundDiagBusyRef === booking.paymentReference ||
                  busyRef === booking.paymentReference
                }
                onClick={() => void handleRefundDiagnostic(booking)}
                className="min-h-11 w-full rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/20 disabled:opacity-60 sm:w-auto"
              >
                {refundDiagBusyRef === booking.paymentReference
                  ? "Loading refund diagnostics…"
                  : "Refund diagnostics (read-only)"}
              </button>
              {canRefundOrCancel ? (
                <button
                  type="button"
                  disabled={busyRef === booking.paymentReference}
                  onClick={() =>
                    setRefundConfirmRef(refundOpen ? null : booking.paymentReference)
                  }
                  className="min-h-11 w-full rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-60 sm:w-auto"
                >
                  Issue refund on cancelled booking
                </button>
              ) : null}
            </div>
            {refundOpen && booking.status === "cancelled" ? (
              <OwnerCancelRefundModal
                ownerKey={ownerKey}
                booking={booking}
                busy={busyRef === booking.paymentReference}
                onBusyChange={(next) => setBusyRef(next ? booking.paymentReference : "")}
                onClose={() => setRefundConfirmRef(null)}
                onSuccess={(result) => void handleCancelRefundSuccess(result, booking)}
                onError={(message) => setError(message)}
              />
            ) : null}
            {refundDiagnostics[booking.paymentReference] ? (
              <RefundDiagnosticView report={refundDiagnostics[booking.paymentReference]} />
            ) : null}
          </div>
        )}
      </li>
    );
  }

  return (
    <section className="mb-10">
      {needsFinalize.length > 0 ? (
        <div className="mb-6 rounded-xl border border-amber-400/35 bg-amber-500/10 p-4">
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
            className="mt-3 min-h-11 w-full rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-navy transition-colors hover:bg-amber-200 disabled:opacity-60 sm:w-auto"
          >
            {recovering ? "Recovering…" : "Recover PAID checkouts (no new charge)"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mb-4 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald-light">
          {message}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-white/60">Loading upcoming jobs…</p>
      ) : upcomingJobs.length === 0 &&
        refundsPending.length === 0 &&
        completedRecent.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/60">
            No upcoming jobs by journey date (looking ahead ~90 days, plus recent incomplete). If a
            customer just paid, tap Refresh or use Recover if SumUp shows PAID.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-11 shrink-0 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-white/30"
          >
            Refresh
          </button>
        </div>
      ) : (
        <>
          {upcomingJobs.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-white/60">
                No open upcoming jobs right now. Refunds Pending (if any) and Completed Jobs appear
                below.
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="min-h-11 shrink-0 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-white/30"
              >
                Refresh
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-bold text-white">Upcoming Jobs</h3>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="min-h-11 shrink-0 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-white/30"
                >
                  Refresh
                </button>
              </div>
              {upcomingGroups.map((group) =>
                group.items.length === 0 ? null : (
                  <div key={group.key}>
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-sky-200">
                      {group.title}
                    </h4>
                    <ul className="mt-3 space-y-4">
                      {group.items.map((booking) => renderBookingCard(booking))}
                    </ul>
                  </div>
                ),
              )}
            </div>
          )}

          {refundsPending.length > 0 ? (
            <div className="mt-10 border-t border-amber-400/20 pt-8">
              <h3 className="text-base font-bold text-amber-100">Refunds Pending</h3>
              <p className="mt-2 text-sm text-white/55">
                Bookings with a refund still due or needing retry — shown only when something is
                outstanding.
              </p>
              <ul className="mt-3 space-y-4">
                {refundsPending.map((booking) =>
                  renderBookingCard(booking, { compact: true }),
                )}
              </ul>
            </div>
          ) : null}

          {completedDayGroups.length > 0 ? (
            <div className="mt-10 border-t border-white/10 pt-8">
              <h3 className="text-base font-bold text-white">Completed Jobs</h3>
              <p className="mt-2 text-sm text-white/45">
                Finished real bookings grouped by the day they were completed — this is not Upcoming.
                Older days are collapsed; today stays open for review. Cancelled / refunded customer
                bookings stay in this archive.
              </p>
              <div className="mt-3 space-y-3">
                {completedDayGroups.map((group) => (
                  <details
                    key={group.day}
                    className="rounded-xl border border-white/10 bg-navy/40"
                    open={group.isToday}
                  >
                    <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-white/85 marker:content-none [&::-webkit-details-marker]:hidden">
                      <span className="inline-flex w-full items-center justify-between gap-3">
                        <span>{group.title}</span>
                        <span className="text-xs font-medium text-white/45">
                          {group.items.length} job{group.items.length === 1 ? "" : "s"}
                        </span>
                      </span>
                    </summary>
                    <ul className="space-y-4 border-t border-white/10 px-3 pb-3 pt-3">
                      {group.items.map((booking) => {
                        const completion = resolveCompletionTimestamp(booking);
                        return (
                          <div key={booking.paymentReference}>
                            {completion && completion.source !== "journeyCompletedAt" ? (
                              <p className="mb-1 px-1 text-[11px] text-white/40">
                                Grouped by {completion.source} (no journeyCompletedAt on record)
                              </p>
                            ) : null}
                            {renderBookingCard(booking, { compact: true })}
                          </div>
                        );
                      })}
                    </ul>
                  </details>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}

      {editingBooking ? (
        <OwnerEditBookingModal
          ownerKey={ownerKey}
          booking={editingBooking}
          onClose={() => setEditingBooking(null)}
          onError={setError}
          onSaved={(updated, extras) => {
            setBookings((current) =>
              current.map((entry) =>
                entry.paymentReference === updated.paymentReference
                  ? { ...entry, ...updated }
                  : entry,
              ),
            );
            setEditingBooking(null);
            setOfferUpdatedConfirmationRef(updated.paymentReference);
            setFareAdjustMessage(
              extras.fareMayNeedManualAdjustment
                ? extras.fareAdjustmentMessage ||
                    "Fare may need a manual SumUp adjustment — payment was preserved."
                : "",
            );
            setMessage(
              extras.fareMayNeedManualAdjustment
                ? extras.fareAdjustmentMessage ||
                    "Booking updated. Fare may need a manual adjustment."
                : "Booking updated successfully.",
            );
          }}
        />
      ) : null}
    </section>
  );
}
