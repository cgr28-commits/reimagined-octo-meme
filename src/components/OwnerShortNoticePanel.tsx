"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatUnavailablePeriodRangeLabel,
  isUnavailablePeriodExpired,
  vehicleServiceLabel,
} from "../../shared/booking-notice";
import { SITE } from "@/lib/data";
import {
  addUnavailablePeriod,
  approveShortNoticeBooking,
  declineShortNoticeBooking,
  deleteUnavailablePeriod,
  fetchBookingSettings,
  fetchShortNoticeBookings,
  offerAlternativeShortNoticeTime,
  resendAlternativeShortNoticeEmail,
  resendShortNoticePaymentEmail,
  updateUnavailablePeriod,
  withdrawAlternativeShortNoticeOffer,
  type ShortNoticeBookingSummary,
  type UnavailablePeriodSummary,
} from "@/lib/short-notice-api";

type OwnerShortNoticePanelProps = {
  ownerKey: string;
};

type PeriodDraft = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  note: string;
};

const EMPTY_DRAFT: PeriodDraft = {
  startDate: "",
  startTime: "00:30",
  endDate: "",
  endTime: "08:00",
  note: "",
};

function statusLabel(status: string): string {
  switch (status) {
    case "SHORT_NOTICE_AWAITING_APPROVAL":
      return "AWAITING OWNER APPROVAL";
    case "SHORT_NOTICE_ALTERNATIVE_OFFERED":
      return "AWAITING CUSTOMER RESPONSE";
    case "SHORT_NOTICE_APPROVED":
      return "APPROVED — AWAITING PAYMENT";
    case "SHORT_NOTICE_DECLINED":
      return "DECLINED — NO AVAILABILITY";
    case "SHORT_NOTICE_ALTERNATIVE_DECLINED":
      return "ALTERNATIVE TIME DECLINED";
    case "SHORT_NOTICE_PAID":
      return "PAID";
    case "SHORT_NOTICE_EXPIRED":
      return "EXPIRED";
    default:
      return status;
  }
}

function formatCompactTripWhen(date: string, time: string): string {
  const raw = `${date}T${time || "00:00"}:00`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return [date, time].filter(Boolean).join(" · ");
  }
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  }).format(parsed);
  return `${day} · ${time || "—"}`;
}

function truncateLabel(value: string, max = 34): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

function splitLocal(value: string): { date: string; time: string } {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return { date: "", time: "" };
  return { date: match[1]!, time: match[2]! };
}

function draftFromPeriod(period: UnavailablePeriodSummary): PeriodDraft {
  const start = splitLocal(period.startLocal);
  const end = splitLocal(period.endLocal);
  return {
    startDate: start.date,
    startTime: start.time || "00:00",
    endDate: end.date,
    endTime: end.time || "00:00",
    note: period.note ?? "",
  };
}

function securePayUrlForBooking(booking: ShortNoticeBookingSummary): string {
  const token = booking.paymentToken?.trim();
  if (!token) return "";
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin.replace(/\/$/, "")
      : SITE.url.replace(/\/$/, "");
  return `${origin}/pay/short-notice/?token=${encodeURIComponent(token)}`;
}

function whatsappShareUrl(booking: ShortNoticeBookingSummary, payUrl: string): string {
  const text = encodeURIComponent(
    `Hi ${booking.booking.customerName}, your short-notice booking ${booking.reference} is approved. Please pay securely here: ${payUrl}`,
  );
  const mobile = booking.booking.mobileNumber.replace(/\D/g, "").replace(/^0/, "44");
  return mobile ? `https://wa.me/${mobile}?text=${text}` : `https://wa.me/?text=${text}`;
}

export default function OwnerShortNoticePanel({ ownerKey }: OwnerShortNoticePanelProps) {
  const [bookings, setBookings] = useState<ShortNoticeBookingSummary[]>([]);
  const [periods, setPeriods] = useState<UnavailablePeriodSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRef, setBusyRef] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PeriodDraft>(EMPTY_DRAFT);
  const [payLinks, setPayLinks] = useState<
    Record<string, { payUrl: string; whatsappPayUrl: string }>
  >({});
  const [offerDrafts, setOfferDrafts] = useState<
    Record<string, { offeredDate: string; offeredTime: string; ownerNote: string; open: boolean }>
  >({});
  /** Collapsed by default — only expanded refs show full details/controls. */
  const [expandedRefs, setExpandedRefs] = useState<Record<string, boolean>>({});

  function isExpanded(reference: string): boolean {
    return expandedRefs[reference] === true;
  }

  function toggleExpanded(reference: string) {
    setExpandedRefs((current) => ({
      ...current,
      [reference]: !current[reference],
    }));
  }

  function offerDraftFor(reference: string) {
    return (
      offerDrafts[reference] ?? {
        offeredDate: "",
        offeredTime: "",
        ownerNote: "",
        open: false,
      }
    );
  }

  function patchOfferDraft(
    reference: string,
    patch: Partial<{ offeredDate: string; offeredTime: string; ownerNote: string; open: boolean }>,
  ) {
    setOfferDrafts((current) => ({
      ...current,
      [reference]: { ...offerDraftFor(reference), ...patch },
    }));
  }

  const applySettings = useCallback((settings: { unavailablePeriods?: UnavailablePeriodSummary[] }) => {
    setPeriods(Array.isArray(settings.unavailablePeriods) ? settings.unavailablePeriods : []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, settings] = await Promise.all([
        fetchShortNoticeBookings(ownerKey),
        fetchBookingSettings(ownerKey),
      ]);
      setBookings(list);
      applySettings(settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load short-notice requests");
    } finally {
      setLoading(false);
    }
  }, [ownerKey, applySettings]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedPeriods = useMemo(
    () =>
      [...periods].sort((a, b) => a.startLocal.localeCompare(b.startLocal)),
    [periods],
  );

  async function handleSavePeriod() {
    setSavingSettings(true);
    setError("");
    setMessage("");
    try {
      if (!draft.startDate || !draft.startTime || !draft.endDate || !draft.endTime) {
        throw new Error("Choose start and end date/time.");
      }
      const payload = {
        startDate: draft.startDate,
        startTime: draft.startTime,
        endDate: draft.endDate,
        endTime: draft.endTime,
        note: draft.note,
      };
      const settings = editingId
        ? await updateUnavailablePeriod(ownerKey, { ...payload, id: editingId })
        : await addUnavailablePeriod(ownerKey, payload);
      applySettings(settings);
      setShowAdd(false);
      setEditingId(null);
      setDraft(EMPTY_DRAFT);
      setMessage(editingId ? "Unavailable period updated." : "Unavailable period added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save period");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleDeletePeriod(id: string) {
    setSavingSettings(true);
    setError("");
    setMessage("");
    try {
      const settings = await deleteUnavailablePeriod(ownerKey, id);
      applySettings(settings);
      if (editingId === id) {
        setEditingId(null);
        setShowAdd(false);
        setDraft(EMPTY_DRAFT);
      }
      setMessage("Unavailable period deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete period");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleApprove(booking: ShortNoticeBookingSummary) {
    setBusyRef(booking.reference);
    setError("");
    setMessage("");
    try {
      const result = await approveShortNoticeBooking(ownerKey, booking.reference);
      setPayLinks((current) => ({
        ...current,
        [booking.reference]: {
          payUrl: result.payUrl,
          whatsappPayUrl: result.whatsappPayUrl,
        },
      }));
      const emailNote = result.paymentEmailSent
        ? " Payment email sent to the customer."
        : result.paymentEmailError
          ? ` Payment email not sent (${result.paymentEmailError}).`
          : " Payment email not sent.";
      setMessage(
        `Approved ${booking.reference}. Share the secure payment link with the customer.${emailNote}`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve");
    } finally {
      setBusyRef("");
    }
  }

  async function handleResendPaymentEmail(booking: ShortNoticeBookingSummary) {
    setBusyRef(booking.reference);
    setError("");
    setMessage("");
    try {
      await resendShortNoticePaymentEmail(ownerKey, booking.reference);
      setMessage(`Payment email resent for ${booking.reference}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend payment email");
    } finally {
      setBusyRef("");
    }
  }

  async function handleOfferAlternative(booking: ShortNoticeBookingSummary) {
    const draft = offerDraftFor(booking.reference);
    setBusyRef(booking.reference);
    setError("");
    setMessage("");
    try {
      if (!draft.offeredDate || !draft.offeredTime) {
        throw new Error("Enter an alternative date and time.");
      }
      const result = await offerAlternativeShortNoticeTime(ownerKey, booking.reference, {
        offeredDate: draft.offeredDate,
        offeredTime: draft.offeredTime,
        ownerNote: draft.ownerNote,
      });
      const emailNote = result.alternativeEmailSent
        ? " Alternative-time email sent to the customer."
        : result.alternativeEmailError
          ? ` Alternative-time email not sent (${result.alternativeEmailError}).`
          : " Alternative-time email not sent.";
      const linkNote = result.acceptUrl
        ? ` Accept link uses this site: ${result.acceptUrl.split("/accept-alternative-time")[0] || "current preview"}.`
        : "";
      setMessage(`Offered alternative time for ${booking.reference}.${emailNote}${linkNote}`);
      patchOfferDraft(booking.reference, { open: false });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not offer alternative time");
    } finally {
      setBusyRef("");
    }
  }

  async function handleResendAlternativeEmail(booking: ShortNoticeBookingSummary) {
    setBusyRef(booking.reference);
    setError("");
    setMessage("");
    try {
      await resendAlternativeShortNoticeEmail(ownerKey, booking.reference);
      setMessage(`Alternative-time email resent for ${booking.reference}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend alternative-time email");
    } finally {
      setBusyRef("");
    }
  }

  async function handleWithdrawOffer(booking: ShortNoticeBookingSummary) {
    setBusyRef(booking.reference);
    setError("");
    setMessage("");
    try {
      await withdrawAlternativeShortNoticeOffer(ownerKey, booking.reference);
      setMessage(`Withdrawn alternative offer for ${booking.reference}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not withdraw offer");
    } finally {
      setBusyRef("");
    }
  }

  async function handleDecline(booking: ShortNoticeBookingSummary) {
    setBusyRef(booking.reference);
    setError("");
    setMessage("");
    try {
      await declineShortNoticeBooking(ownerKey, booking.reference);
      setMessage(`Declined ${booking.reference}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decline");
    } finally {
      setBusyRef("");
    }
  }

  async function copyPayUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Payment link copied.");
    } catch {
      setError("Could not copy link — select and copy it manually.");
    }
  }

  const editorOpen = showAdd || Boolean(editingId);

  const fieldClass =
    "box-border mt-1 block min-h-11 w-full min-w-0 max-w-full rounded-xl border border-white/20 bg-navy px-3 py-2 text-base text-white outline-none focus:border-emerald [color-scheme:dark]";

  return (
    <section className="mb-8 w-full min-w-0 max-w-full rounded-2xl border border-amber-400/25 bg-navy/70 p-4 sm:p-5">
      <div className="w-full min-w-0 max-w-full rounded-xl border border-emerald/30 bg-emerald/10 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
              Booking Availability
            </p>
            <h2 className="mt-1 text-lg font-bold text-white">Unavailable periods</h2>
            <p className="mt-1 break-words text-sm text-white/65">
              Block automatic SumUp for pickups inside these windows (Europe/London). Expired
              periods stop blocking automatically — no need to clear them.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setDraft(EMPTY_DRAFT);
              setShowAdd(true);
            }}
            className="min-h-11 w-full shrink-0 rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy sm:w-auto"
          >
            Add unavailable period
          </button>
        </div>

        {editorOpen ? (
          <div className="mt-4 w-full min-w-0 max-w-full rounded-xl border border-white/10 bg-navy/60 p-3 sm:p-4">
            <p className="text-sm font-semibold text-white">
              {editingId ? "Edit unavailable period" : "New unavailable period"}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block min-w-0 text-sm text-white/70">
                Unavailable from (date)
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(event) => setDraft((d) => ({ ...d, startDate: event.target.value }))}
                  className={fieldClass}
                />
              </label>
              <label className="block min-w-0 text-sm text-white/70">
                Start time
                <input
                  type="time"
                  value={draft.startTime}
                  onChange={(event) => setDraft((d) => ({ ...d, startTime: event.target.value }))}
                  className={fieldClass}
                />
              </label>
              <label className="block min-w-0 text-sm text-white/70">
                Until (date)
                <input
                  type="date"
                  value={draft.endDate}
                  onChange={(event) => setDraft((d) => ({ ...d, endDate: event.target.value }))}
                  className={fieldClass}
                />
              </label>
              <label className="block min-w-0 text-sm text-white/70">
                End time
                <input
                  type="time"
                  value={draft.endTime}
                  onChange={(event) => setDraft((d) => ({ ...d, endTime: event.target.value }))}
                  className={fieldClass}
                />
              </label>
            </div>
            <label className="mt-3 block min-w-0 text-sm text-white/70">
              Private Owner note (optional — never shown to customers)
              <input
                type="text"
                value={draft.note}
                maxLength={280}
                onChange={(event) => setDraft((d) => ({ ...d, note: event.target.value }))}
                placeholder="e.g. Sleep / MOT / holiday"
                className={fieldClass}
              />
            </label>
            <p className="mt-2 break-words text-xs text-white/45">
              Start inclusive · End exclusive (e.g. 00:30→08:00 blocks 00:30–07:59; 08:00 is normal
              SumUp).
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={savingSettings}
                onClick={() => void handleSavePeriod()}
                className="min-h-11 w-full rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy disabled:opacity-60 sm:w-auto"
              >
                {savingSettings ? "Saving…" : editingId ? "Save changes" : "Save period"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setEditingId(null);
                  setDraft(EMPTY_DRAFT);
                }}
                className="min-h-11 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/70 sm:w-auto"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {sortedPeriods.length === 0 ? (
          <p className="mt-4 break-words text-sm text-white/55">
            No unavailable periods — customers can pay online for any future pickup.
          </p>
        ) : (
          <ul className="mt-4 w-full min-w-0 space-y-3">
            {sortedPeriods.map((period) => {
              const expired = isUnavailablePeriodExpired(period);
              return (
                <li
                  key={period.id}
                  className={`w-full min-w-0 max-w-full rounded-xl border p-3 ${
                    expired
                      ? "border-white/10 bg-white/[0.03] opacity-70"
                      : "border-emerald/25 bg-navy/50"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-bold text-white">
                        {formatUnavailablePeriodRangeLabel(period)}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-wider text-white/45">
                        {expired ? "Expired · ignored for SumUp" : "Active"}
                      </p>
                      {period.note ? (
                        <p className="mt-2 break-words text-xs text-white/55">Note: {period.note}</p>
                      ) : null}
                    </div>
                    <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">
                      <button
                        type="button"
                        disabled={savingSettings}
                        onClick={() => {
                          setShowAdd(false);
                          setEditingId(period.id);
                          setDraft(draftFromPeriod(period));
                        }}
                        className="min-h-11 min-w-[5.5rem] flex-1 rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-white hover:border-white/30 sm:flex-none"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={savingSettings}
                        onClick={() => void handleDeletePeriod(period.id)}
                        className="min-h-11 min-w-[5.5rem] flex-1 rounded-xl border border-red-400/40 bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-100 disabled:opacity-60 sm:flex-none"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">
            Short-notice requests awaiting approval
          </p>
          <p className="mt-1 break-words text-sm text-white/65">
            Pickups inside an unavailable period — review before SumUp payment.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-11 w-full shrink-0 rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-white hover:border-white/30 sm:w-auto"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-emerald">{message}</p> : null}

      {loading ? (
        <p className="mt-4 text-sm text-white/55">Loading short-notice requests…</p>
      ) : bookings.length === 0 ? (
        <p className="mt-4 text-sm text-white/55">No open short-notice requests.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {bookings.map((booking) => {
            const busy = busyRef === booking.reference;
            const service = vehicleServiceLabel(booking.booking.vehicle);
            const links = payLinks[booking.reference];
            const payUrl =
              links?.payUrl ||
              (booking.status === "SHORT_NOTICE_APPROVED"
                ? securePayUrlForBooking(booking)
                : "");
            const whatsappPayUrl =
              links?.whatsappPayUrl ||
              (payUrl ? whatsappShareUrl(booking, payUrl) : "");
            const expanded = isExpanded(booking.reference);
            const requestedDate =
              booking.originalRequestedDate ?? booking.booking.tripDate;
            const requestedTime =
              booking.originalRequestedTime ?? booking.booking.tripTime;
            const displayDate =
              booking.status === "SHORT_NOTICE_ALTERNATIVE_OFFERED" && booking.offeredDate
                ? booking.offeredDate
                : booking.booking.tripDate;
            const displayTime =
              booking.status === "SHORT_NOTICE_ALTERNATIVE_OFFERED" && booking.offeredTime
                ? booking.offeredTime
                : booking.booking.tripTime;
            return (
              <li
                key={booking.reference}
                className="rounded-2xl border border-white/10 bg-navy/60 p-3 sm:p-4"
              >
                {!expanded ? (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(booking.reference)}
                    className="flex w-full flex-col gap-1 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald"
                  >
                    <p className="text-base font-bold text-white sm:text-lg">
                      {booking.booking.customerName}
                    </p>
                    {booking.status === "SHORT_NOTICE_ALTERNATIVE_OFFERED" ? (
                      <>
                        <p className="text-sm text-white/70">
                          Requested:{" "}
                          {formatCompactTripWhen(requestedDate, requestedTime)}
                        </p>
                        <p className="text-sm text-white/70">
                          Offered:{" "}
                          <span className="font-semibold text-emerald">
                            {formatCompactTripWhen(
                              booking.offeredDate || displayDate,
                              booking.offeredTime || displayTime,
                            )}
                          </span>
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-white/70">
                        {formatCompactTripWhen(displayDate, displayTime)}
                      </p>
                    )}
                    <p className="truncate text-sm text-white/60">
                      {truncateLabel(booking.booking.pickupLabel)} →{" "}
                      {truncateLabel(booking.booking.dropoffLabel)}
                    </p>
                    <p className="text-sm font-semibold text-white">{booking.amountLabel}</p>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/90">
                      {statusLabel(booking.status)}
                    </p>
                    <span className="mt-1 text-sm font-semibold text-emerald">
                      ▼ View booking
                    </span>
                  </button>
                ) : (
                  <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">{booking.booking.customerName}</p>
                    <p className="mt-1 text-sm text-white/65">
                      {booking.reference} · {booking.amountLabel} · {service}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-wider text-amber-200/90">
                      {statusLabel(booking.status)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(booking.reference)}
                    className="min-h-10 rounded-xl border border-white/15 px-3 py-1.5 text-sm font-semibold text-white/80"
                  >
                    ▲ Collapse
                  </button>
                </div>
                <dl className="mt-4 grid gap-2 text-sm text-white/70 sm:grid-cols-2">
                  <div>
                    <dt className="text-white/40">Mobile</dt>
                    <dd>{booking.booking.mobileNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Email</dt>
                    <dd className="break-all">{booking.booking.customerEmail}</dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Pickup</dt>
                    <dd className="break-words">{booking.booking.pickupLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Destination</dt>
                    <dd className="break-words">{booking.booking.dropoffLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Pickup date/time</dt>
                    <dd>
                      {booking.booking.tripDate} · {booking.booking.tripTime}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Service</dt>
                    <dd className="font-semibold text-white">{service}</dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Passengers / luggage</dt>
                    <dd>
                      {booking.booking.passengers} / {booking.booking.suitcases}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Flight</dt>
                    <dd>{booking.booking.flightNumber || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Return</dt>
                    <dd>
                      {booking.booking.returnJourney
                        ? `${booking.booking.returnDate || "—"} · ${booking.booking.returnTime || "—"}`
                        : "No"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Vehicle detail</dt>
                    <dd>{booking.booking.vehicle}</dd>
                  </div>
                </dl>

                {booking.customerResponseNote ? (
                  <div className="mt-4 rounded-xl border border-sky-400/30 bg-sky-400/10 p-3 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-sky-200">
                      Customer message
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-white">
                      {booking.customerResponseNote}
                    </p>
                  </div>
                ) : null}

                {booking.status === "SHORT_NOTICE_ALTERNATIVE_OFFERED" ||
                booking.originalRequestedDate ? (
                  <div className="mt-4 space-y-1 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">
                      Alternative time offer
                    </p>
                    <p className="text-white/80">
                      Requested:{" "}
                      <span className="font-semibold text-white">
                        {requestedDate} · {requestedTime}
                      </span>
                    </p>
                    {booking.offeredDate && booking.offeredTime ? (
                      <p className="text-white/80">
                        Offered:{" "}
                        <span className="font-semibold text-emerald">
                          {booking.offeredDate} · {booking.offeredTime}
                        </span>
                      </p>
                    ) : null}
                    {booking.status === "SHORT_NOTICE_ALTERNATIVE_OFFERED" ? (
                      <p className="text-xs uppercase tracking-wider text-amber-200/90">
                        Status: AWAITING CUSTOMER RESPONSE
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {booking.status === "SHORT_NOTICE_AWAITING_APPROVAL" ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleApprove(booking)}
                        className="min-h-11 rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy disabled:opacity-60"
                      >
                        {busy ? "Working…" : "Approve requested time"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          patchOfferDraft(booking.reference, {
                            open: !offerDraftFor(booking.reference).open,
                            offeredDate:
                              offerDraftFor(booking.reference).offeredDate ||
                              booking.booking.tripDate,
                            offeredTime:
                              offerDraftFor(booking.reference).offeredTime || "",
                          })
                        }
                        className="min-h-11 rounded-xl border border-amber-300/40 bg-amber-400/15 px-4 py-2.5 text-sm font-semibold text-amber-100 disabled:opacity-60"
                      >
                        Offer alternative time
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDecline(booking)}
                        className="min-h-11 rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-100 disabled:opacity-60"
                      >
                        Decline — no availability
                      </button>
                    </div>
                    {offerDraftFor(booking.reference).open ? (
                      <div className="rounded-xl border border-white/10 bg-navy/50 p-3">
                        <p className="text-sm font-semibold text-white">
                          Offer alternative pickup
                        </p>
                        <p className="mt-1 text-xs text-white/55">
                          Fare stays {booking.amountLabel} — weekend/Bank Holiday does not change
                          the price.
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="block text-sm text-white/70">
                            Alternative date
                            <input
                              type="date"
                              value={offerDraftFor(booking.reference).offeredDate}
                              onChange={(event) =>
                                patchOfferDraft(booking.reference, {
                                  offeredDate: event.target.value,
                                })
                              }
                              className={fieldClass}
                            />
                          </label>
                          <label className="block text-sm text-white/70">
                            Alternative time
                            <input
                              type="time"
                              value={offerDraftFor(booking.reference).offeredTime}
                              onChange={(event) =>
                                patchOfferDraft(booking.reference, {
                                  offeredTime: event.target.value,
                                })
                              }
                              className={fieldClass}
                            />
                          </label>
                        </div>
                        <label className="mt-3 block text-sm text-white/70">
                          Optional note to customer
                          <input
                            type="text"
                            maxLength={500}
                            value={offerDraftFor(booking.reference).ownerNote}
                            onChange={(event) =>
                              patchOfferDraft(booking.reference, {
                                ownerNote: event.target.value,
                              })
                            }
                            className={fieldClass}
                            placeholder="e.g. We can collect you at 3pm instead"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleOfferAlternative(booking)}
                          className="mt-3 min-h-11 rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy disabled:opacity-60"
                        >
                          {busy ? "Sending…" : "Send alternative-time email"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {booking.status === "SHORT_NOTICE_ALTERNATIVE_OFFERED" ? (
                  <div className="mt-4 space-y-3">
                    <p
                      className={`text-xs font-semibold ${
                        booking.alternativeTimeEmailSentAt
                          ? "text-emerald"
                          : "text-amber-200/90"
                      }`}
                    >
                      {booking.alternativeTimeEmailSentAt
                        ? "Alternative-time email sent"
                        : "Alternative-time email not sent"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleResendAlternativeEmail(booking)}
                        className="min-h-11 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {busy ? "Working…" : "Resend alternative-time email"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          patchOfferDraft(booking.reference, {
                            open: true,
                            offeredDate:
                              booking.offeredDate || booking.booking.tripDate,
                            offeredTime: booking.offeredTime || "",
                            ownerNote: booking.offeredNote || "",
                          })
                        }
                        className="min-h-11 rounded-xl border border-amber-300/40 bg-amber-400/15 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-60"
                      >
                        Change offered time
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleWithdrawOffer(booking)}
                        className="min-h-11 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 disabled:opacity-60"
                      >
                        Withdraw offer
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDecline(booking)}
                        className="min-h-11 rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-100 disabled:opacity-60"
                      >
                        Decline booking
                      </button>
                    </div>
                    {offerDraftFor(booking.reference).open ? (
                      <div className="rounded-xl border border-white/10 bg-navy/50 p-3">
                        <p className="text-sm font-semibold text-white">Change offered time</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="block text-sm text-white/70">
                            Alternative date
                            <input
                              type="date"
                              value={offerDraftFor(booking.reference).offeredDate}
                              onChange={(event) =>
                                patchOfferDraft(booking.reference, {
                                  offeredDate: event.target.value,
                                })
                              }
                              className={fieldClass}
                            />
                          </label>
                          <label className="block text-sm text-white/70">
                            Alternative time
                            <input
                              type="time"
                              value={offerDraftFor(booking.reference).offeredTime}
                              onChange={(event) =>
                                patchOfferDraft(booking.reference, {
                                  offeredTime: event.target.value,
                                })
                              }
                              className={fieldClass}
                            />
                          </label>
                        </div>
                        <label className="mt-3 block text-sm text-white/70">
                          Optional note to customer
                          <input
                            type="text"
                            maxLength={500}
                            value={offerDraftFor(booking.reference).ownerNote}
                            onChange={(event) =>
                              patchOfferDraft(booking.reference, {
                                ownerNote: event.target.value,
                              })
                            }
                            className={fieldClass}
                          />
                        </label>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleOfferAlternative(booking)}
                          className="mt-3 min-h-11 rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy disabled:opacity-60"
                        >
                          {busy ? "Updating…" : "Update offered time & email customer"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {booking.status === "SHORT_NOTICE_APPROVED" || links ? (
                  <div className="mt-4 space-y-2 rounded-xl border border-emerald/25 bg-emerald/10 p-3">
                    <p className="text-sm font-semibold text-emerald">Secure payment link</p>
                    {payUrl ? (
                      <p className="break-all text-xs text-white/70">{payUrl}</p>
                    ) : (
                      <p className="text-xs text-white/55">
                        Payment uses the secure token saved on this booking.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {payUrl ? (
                        <button
                          type="button"
                          onClick={() => void copyPayUrl(payUrl)}
                          className="min-h-11 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white"
                        >
                          Copy pay link
                        </button>
                      ) : null}
                      {whatsappPayUrl ? (
                        <a
                          href={whatsappPayUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center rounded-xl bg-emerald px-4 py-2 text-sm font-bold text-navy"
                        >
                          Share on WhatsApp
                        </a>
                      ) : null}
                    </div>
                    <p
                      className={`text-xs font-semibold ${
                        booking.paymentLinkEmailSentAt
                          ? "text-emerald"
                          : "text-amber-200/90"
                      }`}
                      data-payment-email-status
                    >
                      {booking.paymentLinkEmailSentAt
                        ? "Payment email sent"
                        : "Payment email not sent"}
                    </p>
                    {booking.status === "SHORT_NOTICE_APPROVED" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleResendPaymentEmail(booking)}
                        className="min-h-11 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {busy ? "Working…" : "Resend payment email"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
