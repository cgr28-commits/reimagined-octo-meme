"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  assignedDriverDisplay,
  formatDisplayTripDate,
  groupOwnerScheduleByDay,
  isOwnerOperationalTestBooking,
  journeyStatusLabel,
  nextUnfinishedSortKey,
  OWNER_PRIMARY_JOURNEY_BUTTON_LABELS,
  ownerPrimaryJourneyConfirmCopy,
  ownerUpcomingPrimaryJourneyActions,
  relevantUpcomingJourneyDate,
  relevantUpcomingJourneyTime,
  resolveCompletionTimestamp,
  type OwnerPrimaryJourneyAction,
} from "../../shared/upcoming-jobs";
import {
  activeLegPickupLabel,
  buildArrivedPickupWhatsAppLink,
  buildArrivedPickupWhatsAppMessage,
  buildDriverOnTheWayWhatsAppLink,
  isAirportPickupLabel,
  type ArrivalVehicleDetails,
} from "../../shared/arrival-whatsapp";
import { formatUkInstant } from "../../shared/uk-time";
import { formatAirportAccessOptionDashboardValue } from "../../shared/express-drop-off";
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
  postJourneyAction,
  type JourneyAction,
} from "@/lib/tracking-api";
import {
  canMarkExternalRefund,
  isOperationallyCancelled,
  remainingRefundableBalance,
  roundGbp,
} from "../../shared/refund-ops";

type OwnerPaidBookingsPanelProps = {
  ownerKey: string;
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
  openWhatsAppDeepLink(
    buildDriverOnTheWayWhatsAppLink(mobile, {
      driverFirstName: booking.assignedDriverName?.trim().split(/\s+/)[0] || undefined,
    }),
  );
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
  /** Two-stage confirm for primary journey CTAs — no side-effects until Confirm. */
  const [journeyConfirm, setJourneyConfirm] = useState<{
    paymentReference: string;
    action: OwnerPrimaryJourneyAction;
  } | null>(null);

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

  const scheduleDayGroups = useMemo(
    () => groupOwnerScheduleByDay(operationalBookings),
    [operationalBookings],
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

  /** Remember which days’ Completed sections the Owner has opened this session. */
  const [completedOpenDays, setCompletedOpenDays] = useState<Record<string, boolean>>({});

  function isCompletedSectionOpen(day: string): boolean {
    return completedOpenDays[day] === true;
  }

  function toggleCompletedSection(day: string) {
    setCompletedOpenDays((current) => ({
      ...current,
      [day]: !current[day],
    }));
  }
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
    const status = booking.journeyStatus || "idle";
    const busy = busyRef === booking.paymentReference;
    const primaryActions = ownerUpcomingPrimaryJourneyActions({
      journeyStatus: booking.journeyStatus,
      sharingActive: booking.sharingActive,
      bookingStatus: booking.status,
    }).map((action) => ({
      action,
      label: OWNER_PRIMARY_JOURNEY_BUTTON_LABELS[action],
    }));

    if (primaryActions.length === 0) {
      return null;
    }

    const pendingConfirm =
      journeyConfirm?.paymentReference === booking.paymentReference
        ? journeyConfirm.action
        : null;

    function primaryButtonClass(action: OwnerPrimaryJourneyAction): string {
      const base =
        "min-h-14 w-full rounded-xl px-4 py-3.5 text-base font-bold transition-colors disabled:opacity-60";
      switch (action) {
        case "start_tracking":
          return `${base} bg-sky-400 text-navy hover:bg-sky-300`;
        case "arrived_pickup":
          return `${base} bg-amber-300 text-navy hover:bg-amber-200`;
        case "complete_journey":
          return `${base} bg-emerald text-navy hover:bg-emerald/90`;
      }
    }

    return (
      <div className="space-y-3" data-owner-primary-journey-controls>
        {status === "arrived_pickup" && booking.arrivedPickupAt ? (
          <p className="text-sm font-semibold text-emerald">
            Driver arrived · {formatArrivedPickupHhMm(booking.arrivedPickupAt)}
          </p>
        ) : null}
        <div className="flex flex-col gap-3.5">
          {primaryActions.map((item) => {
            const confirming = pendingConfirm === item.action;
            const confirmCopy = ownerPrimaryJourneyConfirmCopy(item.action);
            return (
              <div
                key={item.action}
                className="space-y-2"
                data-owner-journey-action-wrap={item.action}
              >
                <button
                  type="button"
                  disabled={busy}
                  data-owner-journey-action={item.action}
                  aria-expanded={confirming}
                  onClick={() => {
                    if (busy) return;
                    setJourneyConfirm((current) =>
                      current?.paymentReference === booking.paymentReference &&
                      current.action === item.action
                        ? null
                        : {
                            paymentReference: booking.paymentReference,
                            action: item.action,
                          },
                    );
                  }}
                  className={primaryButtonClass(item.action)}
                >
                  {busy && confirming ? "Updating…" : item.label}
                </button>
                {confirming ? (
                  <div
                    className="rounded-xl border border-white/15 bg-navy/80 p-3"
                    data-owner-journey-confirm={item.action}
                    role="group"
                    aria-label={confirmCopy.title}
                  >
                    <p className="text-sm font-semibold text-white">{confirmCopy.title}</p>
                    {confirmCopy.body ? (
                      <p className="mt-1 text-xs leading-relaxed text-white/65">
                        {confirmCopy.body}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        data-owner-journey-confirm-yes={item.action}
                        onClick={() => {
                          setJourneyConfirm(null);
                          void handleJourneyAction(booking, item.action);
                        }}
                        className={
                          item.action === "complete_journey"
                            ? "min-h-12 w-full rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy disabled:opacity-60"
                            : "min-h-12 w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-navy disabled:opacity-60"
                        }
                      >
                        {busy ? "Updating…" : confirmCopy.confirmLabel}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        data-owner-journey-confirm-cancel={item.action}
                        onClick={() => setJourneyConfirm(null)}
                        className="min-h-11 w-full rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/85 disabled:opacity-60"
                      >
                        {confirmCopy.cancelLabel}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {booking.arrivalNotificationStatus === "failed" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void handleJourneyAction(booking, "arrived_pickup", {
                retryArrivalNotification: true,
              })
            }
            className="min-h-11 w-full rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-100 disabled:opacity-60"
          >
            {busy ? "Retrying…" : "Retry arrival notification"}
          </button>
        ) : null}
      </div>
    );
  }

  function renderBookingCard(booking: OwnerPaidBookingSummary, options?: { compact?: boolean }) {
    const isClosed = isOperationallyCancelled(booking.status);
    const isCompleted = booking.journeyStatus === "completed";
    const isActiveCard = !options?.compact && !isClosed && !isCompleted;
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
    const showEvidence =
      isCompleted ||
      isClosed ||
      Boolean(booking.trackingToken) ||
      (diagnostics[booking.paymentReference]?.gpsPointCount ?? 0) > 0;
    const nextDate = relevantUpcomingJourneyDate(booking);
    const nextTime = relevantUpcomingJourneyTime(booking) || "—";
    const isReturnNext =
      Boolean(booking.returnJourney) &&
      nextDate === (booking.returnDate || "").trim() &&
      nextDate !== (booking.tripDate || "").trim();
    const routeLabel = isReturnNext
      ? `${booking.dropoffLabel} → ${booking.pickupLabel}`
      : `${booking.pickupLabel} → ${booking.dropoffLabel}`;
    const fareLabel =
      typeof booking.amount === "number"
        ? `£${booking.amount.toFixed(2)}`
        : booking.amountPaid || "—";
    const flightLabel = isReturnNext
      ? booking.returnFlightNumber?.trim()
      : booking.flightNumber?.trim();
    const vehicleLabel = booking.vehicle
      ? booking.vehicle.toLowerCase().includes("minibus")
        ? "MINIBUS"
        : booking.vehicle.toLowerCase().includes("estate")
          ? "ESTATE"
          : booking.vehicle.toLowerCase().includes("saloon") ||
              booking.vehicle.toLowerCase().includes("standard")
            ? "SALOON"
            : booking.vehicle
      : null;
    const airportAccessLabel = formatAirportAccessOptionDashboardValue({
      expressDropOffSelected: booking.expressDropOffSelected,
      expressDropOffFee: booking.expressDropOffFee,
      expressDropOffAirport: booking.expressDropOffAirport ?? booking.airportCode,
      fromAirport: booking.isFromAirport,
    });

    const moreOptions = (
      <details
        className="rounded-xl border border-white/10 bg-navy/40"
        data-owner-more-options
      >
        <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-white/70 marker:content-none [&::-webkit-details-marker]:hidden">
          More options ▼
        </summary>
        <div className="space-y-3 border-t border-white/10 px-3 py-3">
          {(booking.customerEmail || booking.mobileNumber || booking.arrivedPickupAt) && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                Customer contact
              </p>
              <div className="flex flex-col gap-2">
                {booking.customerEmail ? (
                  <a
                    href={`mailto:${encodeURIComponent(booking.customerEmail)}`}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Email customer
                  </a>
                ) : null}
                {booking.mobileNumber ? (
                  <a
                    href={`https://wa.me/${booking.mobileNumber.replace(/\D/g, "").replace(/^0/, "44")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    WhatsApp
                  </a>
                ) : null}
              </div>
              <div className="mt-2 space-y-1 text-sm text-white/70">
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

          <div className="flex flex-col gap-2">
            {booking.journeyStatus === "arrived_pickup" && !isCompleted && !isClosed ? (
              <button
                type="button"
                disabled={busyRef === booking.paymentReference}
                onClick={() => {
                  void (async () => {
                    setBusyRef(booking.paymentReference);
                    setError("");
                    try {
                      const outcome = await openArrivalWhatsAppForBooking(ownerKey, booking);
                      setMessage(
                        outcome === "opened"
                          ? "WhatsApp arrival message opened — press Send to message the customer."
                          : "No customer mobile on this booking for WhatsApp.",
                      );
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not open WhatsApp");
                    } finally {
                      setBusyRef("");
                    }
                  })();
                }}
                className="min-h-11 w-full rounded-xl border border-emerald/40 bg-emerald/15 px-4 py-2.5 text-sm font-bold text-emerald disabled:opacity-60"
              >
                Open WhatsApp arrival message
              </button>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                disabled={busyRef === booking.paymentReference}
                onClick={() => setEditingBooking(booking)}
                className="min-h-11 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                Edit Booking
              </button>
            ) : null}
            {canAdminConfirm ? (
              <button
                type="button"
                disabled={busyRef === booking.paymentReference}
                onClick={() => void handleSendUpdatedConfirmation(booking)}
                className="min-h-11 w-full rounded-xl border border-sky-400/40 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-100 disabled:opacity-60"
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
              className="min-h-11 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busyRef === booking.paymentReference ? "Sending…" : "Resend Confirmation"}
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
                  className="min-h-11 w-full rounded-xl border border-amber-300/40 px-4 py-2.5 text-sm font-semibold text-amber-100 disabled:opacity-60"
                >
                  Resend review request
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyRef === booking.paymentReference}
                  onClick={() => void handleReviewRequest(booking, false)}
                  className="min-h-11 w-full rounded-xl border border-emerald/40 bg-emerald/15 px-4 py-2.5 text-sm font-semibold text-emerald disabled:opacity-60"
                >
                  {booking.reviewRequest?.status === "failed"
                    ? "Retry review request"
                    : "Send review request"}
                </button>
              )
            ) : null}
            {showEvidence ? (
              <a
                href={`/owner/journey-evidence/?ref=${encodeURIComponent(booking.paymentReference)}`}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-sky-400/40 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-sky-100"
              >
                View Journey Evidence
              </a>
            ) : null}
            <button
              type="button"
              disabled={
                diagnosticBusyRef === booking.paymentReference ||
                busyRef === booking.paymentReference
              }
              onClick={() => void handleTrackingDiagnostic(booking)}
              className="min-h-11 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/80 disabled:opacity-60"
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
              className="min-h-11 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/80 disabled:opacity-60"
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
                className="min-h-11 w-full rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 disabled:opacity-60"
              >
                {isClosed ? "Issue refund on cancelled booking" : "Cancel / Refund"}
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
                className="min-h-11 w-full rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-100 disabled:opacity-60"
              >
                Mark as refunded
              </button>
            ) : null}
          </div>

          {showOfferUpdated ? (
            <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-3">
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
                className="mt-3 min-h-11 w-full rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-navy disabled:opacity-60"
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
              onBusyChange={(next) => setBusyRef(next ? booking.paymentReference : "")}
              onClose={() => setRefundConfirmRef(null)}
              onSuccess={(result) => void handleCancelRefundSuccess(result, booking)}
              onError={(message) => setError(message)}
            />
          ) : null}

          {externalConfirmOpen ? (
            <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-3">
              <p className="text-sm font-semibold text-amber-50">
                Has this customer already been refunded manually in SumUp?
              </p>
              <p className="mt-2 text-xs leading-relaxed text-amber-50/80">
                Only use this if you have already refunded the customer outside this website. This
                will NOT send money. It does not call SumUp, closes the booking as Cancelled /
                Refunded, removes it from active jobs, and keeps the original payment for audit. No
                refund email is sent.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={busyRef === booking.paymentReference}
                  onClick={() => void handleMarkExternalRefund(booking)}
                  className="min-h-11 w-full rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-bold text-navy disabled:opacity-60"
                >
                  {busyRef === booking.paymentReference
                    ? "Closing…"
                    : "Yes — close as refunded"}
                </button>
                <button
                  type="button"
                  disabled={busyRef === booking.paymentReference}
                  onClick={() => setExternalRefundConfirmRef(null)}
                  className="min-h-11 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <dl className="grid gap-2 text-xs text-white/55">
            <div>
              <dt className="text-white/35">Ref</dt>
              <dd className="break-all text-white/70">{booking.paymentReference}</dd>
            </div>
            <div>
              <dt className="text-white/35">Assigned driver</dt>
              <dd>
                {assignedDriverDisplay(booking.assignedDriverLabel, booking.assignedDriverName)}
              </dd>
            </div>
            <div>
              <dt className="text-white/35">Mobile</dt>
              <dd>{booking.mobileNumber || "—"}</dd>
            </div>
            <div>
              <dt className="text-white/35">Email</dt>
              <dd className="break-all">{booking.customerEmail || "—"}</dd>
            </div>
            {booking.returnJourney ? (
              <div>
                <dt className="text-white/35">Return</dt>
                <dd>
                  {booking.returnDate || "—"} · {booking.returnTime || "—"}
                </dd>
              </div>
            ) : null}
            {!options?.compact ? (
              <div>
                <dt className="text-white/35">Review request</dt>
                <dd>
                  {reviewStatusLabel(
                    booking.reviewRequest?.status,
                    booking.reviewRequest?.dueAt,
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </details>
    );

    return (
      <li
        key={booking.paymentReference}
        className={`overflow-x-hidden rounded-2xl border p-3 sm:p-4 ${
          options?.compact || isClosed || isCompleted
            ? "border-white/10 bg-navy/40"
            : "border-white/15 bg-navy/60"
        }`}
        data-owner-job-card={isActiveCard ? "active" : "history"}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="break-words text-base font-bold text-white sm:text-lg">
              {booking.customerName}
            </p>
            <p className="mt-1 break-words text-sm text-white/65">
              {isReturnNext ? "Return · " : ""}
              {formatDisplayTripDate(nextDate)} · pick up {nextTime}
              {fareLabel !== "—" ? ` · ${fareLabel}` : ""}
            </p>
            <p className="mt-1 break-words text-sm text-white/80">{routeLabel}</p>
            {(refundedNum > 0 ||
              booking.status === "partially_refunded" ||
              booking.status === "refunded_active") && (
              <p className="mt-1 text-xs text-amber-100/90">
                Paid {booking.amountPaid}
                {` · refunded £${refundedNum.toFixed(2)}`}
                {` · remaining £${remainingNum.toFixed(2)}`}
              </p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
              isClosed
                ? "border-red-400/30 bg-red-500/10 text-red-100"
                : isCompleted
                  ? "border-white/20 bg-white/5 text-white/70"
                  : booking.status === "partially_refunded"
                    ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
                    : "border-emerald/40 bg-emerald/15 text-emerald"
            }`}
          >
            {isClosed
              ? booking.status === "cancelled"
                ? "Cancelled"
                : "Refunded"
              : isCompleted
                ? "Completed"
                : booking.status === "refunded_active"
                  ? "Fully refunded · Active"
                  : journeyStatusLabel(booking.journeyStatus)}
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-white/70">
          <div>
            <dt className="text-[11px] text-white/40">Pickup</dt>
            <dd className="break-words">{booking.pickupLabel || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-white/40">Destination</dt>
            <dd className="break-words">{booking.dropoffLabel || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-white/40">Fare</dt>
            <dd>{fareLabel}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-white/40">Status</dt>
            <dd>{journeyStatusLabel(booking.journeyStatus)}</dd>
          </div>
          {vehicleLabel ? (
            <div>
              <dt className="text-[11px] text-white/40">Service</dt>
              <dd className="font-semibold text-white">{vehicleLabel}</dd>
            </div>
          ) : null}
          {flightLabel ? (
            <div>
              <dt className="text-[11px] text-white/40">Flight</dt>
              <dd className="font-semibold text-white">{flightLabel}</dd>
            </div>
          ) : null}
          {airportAccessLabel ? (
            <div className="col-span-2">
              <dt className="text-[11px] text-white/40">Airport access</dt>
              <dd className="font-semibold text-white">{airportAccessLabel}</dd>
            </div>
          ) : null}
          {typeof booking.passengers === "number" || typeof booking.suitcases === "number" ? (
            <div className="col-span-2">
              <dt className="text-[11px] text-white/40">Passengers / luggage</dt>
              <dd>
                {typeof booking.passengers === "number" ? `${booking.passengers} pax` : "—"}
                {" · "}
                {typeof booking.suitcases === "number"
                  ? `${booking.suitcases} suitcases`
                  : "—"}
              </dd>
            </div>
          ) : null}
          {typeof booking.refundDueAmount === "number" && booking.refundDueAmount > 0 ? (
            <div className="col-span-2">
              <dt className="text-[11px] text-amber-200/80">Refund due</dt>
              <dd className="font-semibold text-amber-100">
                £{booking.refundDueAmount.toFixed(2)}
                {booking.refundDueReason ? ` — ${booking.refundDueReason}` : ""}
              </dd>
            </div>
          ) : null}
          {booking.lastUpdatedConfirmationError ? (
            <div className="col-span-2">
              <dt className="text-[11px] text-red-200/80">Confirmation email</dt>
              <dd className="text-red-100">
                Delivery failed — {booking.lastUpdatedConfirmationError}.
              </dd>
            </div>
          ) : null}
        </dl>

        {isActiveCard ? (
          <div className="mt-3 space-y-3">
            {renderJourneyControls(booking)}
            {moreOptions}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {isClosed ? (
              <p className="text-sm text-white/60">
                This booking is {booking.status === "cancelled" ? "cancelled" : "fully refunded"}.
                Journey evidence is retained.
              </p>
            ) : null}
            {moreOptions}
          </div>
        )}

        {diagnostics[booking.paymentReference] ? (
          <TrackingDiagnosticView report={diagnostics[booking.paymentReference]} />
        ) : null}
        {refundDiagnostics[booking.paymentReference] ? (
          <RefundDiagnosticView report={refundDiagnostics[booking.paymentReference]} />
        ) : null}
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
        <p className="text-sm text-white/60">Loading jobs…</p>
      ) : scheduleDayGroups.length === 0 && refundsPending.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/60">
            No active jobs by journey date (looking ahead ~90 days, plus recent incomplete). If a
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
          {scheduleDayGroups.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-white/60">
                No open active jobs right now. Refunds Pending (if any) appear below. Completed
                jobs for each day stay collapsed under that date after refresh.
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
                <h3 className="text-base font-bold text-white">Jobs by day</h3>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="min-h-11 shrink-0 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-white/30"
                >
                  Refresh
                </button>
              </div>
              {scheduleDayGroups.map((group) => (
                <section key={group.day} className="space-y-3">
                  <h4 className="text-base font-bold text-white sm:text-lg">{group.title}</h4>

                  {group.upcoming.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-sky-200">
                        Active jobs
                      </p>
                      <ul className="mt-2 space-y-4">
                        {group.upcoming.map((booking) => renderBookingCard(booking))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-white/45">No active jobs for this day.</p>
                  )}

                  {group.completed.length > 0 ? (
                    <div className="rounded-xl border border-white/10 bg-navy/40">
                      <button
                        type="button"
                        onClick={() => toggleCompletedSection(group.day)}
                        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-white/85"
                        aria-expanded={isCompletedSectionOpen(group.day)}
                      >
                        <span>
                          Completed jobs ({group.completed.length})
                        </span>
                        <span className="text-emerald" aria-hidden>
                          {isCompletedSectionOpen(group.day) ? "▲" : "▼"}
                        </span>
                      </button>
                      {isCompletedSectionOpen(group.day) ? (
                        <ul className="space-y-4 border-t border-white/10 px-3 pb-3 pt-3">
                          {group.completed.map((booking) => {
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
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ))}
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
