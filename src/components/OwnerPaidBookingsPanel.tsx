"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatUkInstant } from "../../shared/uk-time";
import {
  fetchOwnerPaidBookings,
  fetchOwnerPendingCheckouts,
  finalizePaidCheckoutRecovery,
  resendPaidBookingConfirmation,
  type OwnerPaidBookingSummary,
  type OwnerPendingCheckoutSummary,
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
};

function PaidBookingLiveTracking({
  ownerKey,
  booking,
  onBusy,
  onMessage,
  onError,
  onTrackingToken,
  onSharingChange,
}: {
  ownerKey: string;
  booking: OwnerPaidBookingSummary;
  onBusy: (ref: string) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
  onTrackingToken: (paymentReference: string, token: string, trackUrl: string) => void;
  onSharingChange: (active: boolean) => void;
}) {
  const [localActive, setLocalActive] = useState(Boolean(booking.sharingActive));
  const [gps, setGps] = useState<LiveGpsState | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const watchIdRef = useRef<number | null>(null);
  const sessionRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(booking.trackingToken ?? null);

  useEffect(() => {
    setLocalActive(Boolean(booking.sharingActive));
    tokenRef.current = booking.trackingToken ?? null;
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

  const startGpsWatch = useCallback(
    (token: string, sessionToken: string) => {
      if (!navigator.geolocation) {
        onError("This browser does not support live GPS tracking.");
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
      });

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const accuracy =
            typeof position.coords.accuracy === "number" && Number.isFinite(position.coords.accuracy)
              ? position.coords.accuracy
              : null;
          setGps((current) =>
            current
              ? {
                  ...current,
                  lastAt: Date.now(),
                  accuracyMeters: accuracy,
                  error: null,
                }
              : current,
          );
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
          ).catch(() => {
            // Transient upload errors retry on the next GPS tick.
          });
        },
        (geoError) => {
          setGps((current) =>
            current
              ? {
                  ...current,
                  error:
                    geoError.code === geoError.PERMISSION_DENIED
                      ? "Location permission denied — enable Precise Location and reopen this page."
                      : "Location unavailable — keep this page open and check GPS.",
                }
              : current,
          );
        },
        {
          enableHighAccuracy: true,
          maximumAge: 15_000,
          timeout: 20_000,
        },
      );
    },
    [clearWatch, onError, ownerKey],
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

      setLocalActive(true);
      startGpsWatch(token, sessionToken);
      onSharingChange(true);
      onMessage(
        "Live tracking active. Keep this page open while driving — GPS may pause if the phone locks or Safari goes to the background.",
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
      onMessage("Live tracking stopped.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not stop live tracking");
    } finally {
      setBusy(false);
      onBusy("");
    }
  };

  const active = localActive;
  const lastAt = gps?.lastAt ?? (booking.driverUpdatedAt ? new Date(booking.driverUpdatedAt).getTime() : null);
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
            <span className={active ? "text-emerald" : "text-white/70"}>
              {active ? "LIVE" : "OFF"}
            </span>
          </p>
          {active && lastLabel ? (
            <p className="mt-1 text-xs text-white/60">Last update: {lastLabel}</p>
          ) : null}
          {active && typeof gps?.accuracyMeters === "number" ? (
            <p className="mt-1 text-xs text-white/60">
              Accuracy: ±{Math.round(gps.accuracyMeters)} m
            </p>
          ) : null}
          {gps?.error ? <p className="mt-2 text-xs text-amber-100">{gps.error}</p> : null}
          {active ? (
            <p className="mt-2 text-xs text-white/45">
              Keep this tab open. iPhone/Safari may pause GPS when the screen locks or the browser
              is backgrounded.
            </p>
          ) : (
            <p className="mt-2 text-xs text-white/45">
              Customers only see your live location from about 1 hour before pickup.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!active ? (
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
              <span className="inline-flex min-h-11 items-center rounded-xl border border-emerald/40 bg-emerald/15 px-4 py-2 text-sm font-semibold text-emerald">
                LIVE TRACKING ACTIVE
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
          {trackHref ? (
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

export default function OwnerPaidBookingsPanel({ ownerKey }: OwnerPaidBookingsPanelProps) {
  const [bookings, setBookings] = useState<OwnerPaidBookingSummary[]>([]);
  const [pending, setPending] = useState<OwnerPendingCheckoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyRef, setBusyRef] = useState("");
  const [recovering, setRecovering] = useState(false);

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
                <div>
                  <p className="text-lg font-bold text-white">{booking.customerName}</p>
                  <p className="mt-1 text-sm text-white/65">
                    {booking.tripDate} · pick up {booking.tripTime}
                    {booking.amountPaid ? ` · ${booking.amountPaid}` : ""}
                  </p>
                  <p className="mt-2 text-sm text-white/80">
                    {booking.pickupLabel} → {booking.dropoffLabel}
                  </p>
                  <p className="mt-2 text-xs text-white/45">
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
                  />

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busyRef === booking.paymentReference}
                      onClick={() => void handleResend(booking)}
                      className="w-full rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy transition-colors hover:bg-emerald-light disabled:opacity-60 sm:w-auto"
                    >
                      {busyRef === booking.paymentReference
                        ? "Sending…"
                        : "Resend booking confirmation"}
                    </button>
                    <button
                      type="button"
                      disabled={busyRef === booking.paymentReference}
                      onClick={() => void handleEnsureTracking(booking)}
                      className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60"
                    >
                      {booking.trackingToken
                        ? "Refresh tracking link"
                        : "Create tracking (no new charge)"}
                    </button>
                    {booking.customerEmail ? (
                      <a
                        href={`mailto:${encodeURIComponent(booking.customerEmail)}`}
                        className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
                      >
                        Email customer
                      </a>
                    ) : null}
                    {booking.mobileNumber ? (
                      <a
                        href={`https://wa.me/${booking.mobileNumber.replace(/\D/g, "").replace(/^0/, "44")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
                      >
                        WhatsApp
                      </a>
                    ) : null}
                  </div>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
