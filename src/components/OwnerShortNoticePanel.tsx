"use client";

import { useCallback, useEffect, useState } from "react";
import { vehicleServiceLabel } from "../../shared/booking-notice";
import {
  approveShortNoticeBooking,
  declineShortNoticeBooking,
  fetchBookingSettings,
  fetchShortNoticeBookings,
  saveBookingSettings,
  type ShortNoticeBookingSummary,
} from "@/lib/short-notice-api";

type OwnerShortNoticePanelProps = {
  ownerKey: string;
};

function statusLabel(status: string): string {
  switch (status) {
    case "SHORT_NOTICE_AWAITING_APPROVAL":
      return "Awaiting approval";
    case "SHORT_NOTICE_APPROVED":
      return "Approved — awaiting payment";
    case "SHORT_NOTICE_DECLINED":
      return "Declined";
    case "SHORT_NOTICE_PAID":
      return "Paid";
    case "SHORT_NOTICE_EXPIRED":
      return "Expired";
    default:
      return status;
  }
}

export default function OwnerShortNoticePanel({ ownerKey }: OwnerShortNoticePanelProps) {
  const [bookings, setBookings] = useState<ShortNoticeBookingSummary[]>([]);
  const [noticeHours, setNoticeHours] = useState(6);
  const [hoursDraft, setHoursDraft] = useState("6");
  const [loading, setLoading] = useState(true);
  const [busyRef, setBusyRef] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [payLinks, setPayLinks] = useState<
    Record<string, { payUrl: string; whatsappPayUrl: string }>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, settings] = await Promise.all([
        fetchShortNoticeBookings(ownerKey),
        fetchBookingSettings(ownerKey),
      ]);
      setBookings(list);
      setNoticeHours(settings.minimumOnlineNoticeHours);
      setHoursDraft(String(settings.minimumOnlineNoticeHours));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load short-notice requests");
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSaveSettings() {
    setSavingSettings(true);
    setError("");
    setMessage("");
    try {
      const hours = Number(hoursDraft);
      const settings = await saveBookingSettings(ownerKey, hours);
      setNoticeHours(settings.minimumOnlineNoticeHours);
      setHoursDraft(String(settings.minimumOnlineNoticeHours));
      setMessage(`Minimum online booking notice saved: ${settings.minimumOnlineNoticeHours} hours.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
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
      setMessage(`Approved ${booking.reference}. Share the secure payment link with the customer.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve");
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

  return (
    <section className="mb-8 rounded-2xl border border-amber-400/25 bg-navy/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">
            Short-notice requests awaiting approval
          </p>
          <p className="mt-1 text-sm text-white/65">
            Pickups inside the minimum online notice window — review before SumUp payment.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-white hover:border-white/30"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-navy-dark/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
          Minimum online booking notice
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="block text-sm text-white/70">
            Hours
            <input
              type="number"
              min={0}
              max={72}
              step={0.5}
              value={hoursDraft}
              onChange={(event) => setHoursDraft(event.target.value)}
              className="mt-1 block w-28 rounded-xl border border-white/20 bg-navy px-3 py-2 text-white outline-none focus:border-emerald"
            />
          </label>
          <button
            type="button"
            disabled={savingSettings}
            onClick={() => void handleSaveSettings()}
            className="rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy disabled:opacity-60"
          >
            {savingSettings ? "Saving…" : "Save notice setting"}
          </button>
          <p className="text-xs text-white/45">Current: {noticeHours} hours (Europe/London)</p>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-emerald">{message}</p> : null}

      {loading ? (
        <p className="mt-4 text-sm text-white/55">Loading short-notice requests…</p>
      ) : bookings.length === 0 ? (
        <p className="mt-4 text-sm text-white/55">No open short-notice requests.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {bookings.map((booking) => {
            const busy = busyRef === booking.reference;
            const service = vehicleServiceLabel(booking.booking.vehicle);
            const links = payLinks[booking.reference];
            return (
              <li
                key={booking.reference}
                className="rounded-2xl border border-white/10 bg-navy/60 p-4 sm:p-5"
              >
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

                {booking.status === "SHORT_NOTICE_AWAITING_APPROVAL" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleApprove(booking)}
                      className="min-h-11 rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy disabled:opacity-60"
                    >
                      {busy ? "Working…" : "Approve Short-Notice Booking"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDecline(booking)}
                      className="min-h-11 rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-100 disabled:opacity-60"
                    >
                      Decline
                    </button>
                  </div>
                ) : null}

                {booking.status === "SHORT_NOTICE_APPROVED" || links ? (
                  <div className="mt-4 space-y-2 rounded-xl border border-emerald/25 bg-emerald/10 p-3">
                    <p className="text-sm font-semibold text-emerald">Secure payment link</p>
                    {(links?.payUrl || booking.status === "SHORT_NOTICE_APPROVED") && (
                      <>
                        {links?.payUrl ? (
                          <p className="break-all text-xs text-white/70">{links.payUrl}</p>
                        ) : (
                          <p className="text-xs text-white/55">
                            Approve again or refresh if the link is not shown — payment uses the
                            token saved on this booking.
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {links?.payUrl ? (
                            <button
                              type="button"
                              onClick={() => void copyPayUrl(links.payUrl)}
                              className="rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold text-white"
                            >
                              Copy payment link
                            </button>
                          ) : null}
                          {links?.whatsappPayUrl ? (
                            <a
                              href={links.whatsappPayUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-xl bg-emerald px-3 py-2 text-sm font-bold text-navy"
                            >
                              Share via WhatsApp
                            </a>
                          ) : null}
                          {booking.status === "SHORT_NOTICE_APPROVED" && !links ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleApprove(booking)}
                              className="rounded-xl border border-emerald/40 px-3 py-2 text-sm font-semibold text-emerald"
                            >
                              Show payment link
                            </button>
                          ) : null}
                        </div>
                      </>
                    )}
                    {booking.paymentExpiresAt ? (
                      <p className="text-xs text-white/45">
                        Link expires: {new Date(booking.paymentExpiresAt).toLocaleString("en-GB")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
