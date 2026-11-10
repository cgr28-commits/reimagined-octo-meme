"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  bookingJobAssignmentLabel,
  type BookingJobRecord,
} from "../../shared/booking-job";
import { formatUkInstant } from "../../shared/uk-time";
import {
  assignBookingJobDriver,
  fetchOwnerBookingJobs,
  fetchOwnerQuoteStats,
  markBookingJobPaid,
  sendBookingJobQuote,
  type OwnerQuoteStats,
} from "@/lib/booking-jobs-api";
import { buildWhatsAppDriverDetailsLink } from "@/lib/tracking-api";
import { resolveOwnerDisplayedLegNav } from "../../shared/owner-job-actions";
import {
  OwnerCustomerCallWhatsApp,
  OwnerWazeAddressLink,
} from "@/components/OwnerJobNavActions";

type OwnerBookingJobsPanelProps = {
  ownerKey: string;
};

function statusBadge(job: BookingJobRecord): { label: string; className: string } {
  if (job.status === "awaiting_payment") {
    return {
      label: "Awaiting payment",
      className: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    };
  }
  if (job.driverAssignmentStatus === "accepted") {
    return {
      label: "Driver confirmed",
      className: "border-emerald/40 bg-emerald/15 text-emerald",
    };
  }
  if (job.driverAssignmentStatus === "pending") {
    return {
      label: "Awaiting driver",
      className: "border-sky-400/30 bg-sky-500/10 text-sky-100",
    };
  }
  if (job.status === "paid") {
    return {
      label: "Paid — assign driver",
      className: "border-emerald/30 bg-emerald/10 text-emerald-light",
    };
  }
  return {
    label: job.status,
    className: "border-white/15 bg-white/5 text-white/70",
  };
}

const QUOTE_VALIDITY_OPTIONS_MINUTES = [60, 120, 720, 1440] as const;
const QUOTE_VALIDITY_DEFAULT_MINUTES = 1440;

function quoteValidityLabel(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return `${minutes} min`;
}

export default function OwnerBookingJobsPanel({ ownerKey }: OwnerBookingJobsPanelProps) {
  const [funnelDay, setFunnelDay] = useState("");
  const [jobs, setJobs] = useState<BookingJobRecord[]>([]);
  const [stats, setStats] = useState<OwnerQuoteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [paidAmountById, setPaidAmountById] = useState<Record<string, string>>({});
  const [paymentRefById, setPaymentRefById] = useState<Record<string, string>>({});
  const [awaitingOpen, setAwaitingOpen] = useState(false);
  const [quotePriceById, setQuotePriceById] = useState<Record<string, string>>({});
  const [quoteValidityById, setQuoteValidityById] = useState<Record<string, number>>({});
  const [quoteNoticeById, setQuoteNoticeById] = useState<
    Record<string, { tone: "ok" | "warn" | "error"; text: string; payUrl?: string }>
  >({});
  const [assignDraftById, setAssignDraftById] = useState<
    Record<
      string,
      {
        driverFirstName: string;
        driverEmail: string;
        driverMobile: string;
        driverCarMake: string;
        driverCarModel: string;
        driverCarColour: string;
        driverReg: string;
        driverPayAmount: string;
      }
    >
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [next, nextStats] = await Promise.all([
        fetchOwnerBookingJobs(ownerKey),
        fetchOwnerQuoteStats(ownerKey, funnelDay).catch(() => null),
      ]);
      setJobs(next);
      setStats(nextStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }, [ownerKey, funnelDay]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function revealBookingRequestFromHash() {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash.startsWith("owner-booking-job-")) return;
      const jobId = hash.slice("owner-booking-job-".length);
      const job = jobs.find((item) => item.id === jobId);
      if (!job) return;
      if (job.status === "awaiting_payment" && !awaitingOpen) {
        setAwaitingOpen(true);
        return;
      }
      window.requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        if (el instanceof HTMLElement) {
          el.focus();
        }
      });
    }
    revealBookingRequestFromHash();
    window.addEventListener("hashchange", revealBookingRequestFromHash);
    return () => window.removeEventListener("hashchange", revealBookingRequestFromHash);
  }, [jobs, awaitingOpen]);

  function draftFor(job: BookingJobRecord) {
    return (
      assignDraftById[job.id] ?? {
        driverFirstName: job.driverFirstName ?? "",
        driverEmail: job.driverEmail ?? "",
        driverMobile: job.driverMobile ?? "",
        driverCarMake: job.driverCarMake ?? "",
        driverCarModel: job.driverCarModel ?? "",
        driverCarColour: job.driverCarColour ?? "",
        driverReg: job.driverReg ?? "",
        driverPayAmount: job.driverPayAmount ?? "",
      }
    );
  }

  function updateDraft(jobId: string, patch: Partial<ReturnType<typeof draftFor>>) {
    setAssignDraftById((prev) => ({
      ...prev,
      [jobId]: {
        ...(prev[jobId] ?? {
          driverFirstName: "",
          driverEmail: "",
          driverMobile: "",
          driverCarMake: "",
          driverCarModel: "",
          driverCarColour: "",
          driverReg: "",
          driverPayAmount: "",
        }),
        ...patch,
      },
    }));
  }

  async function handleMarkPaid(job: BookingJobRecord) {
    setBusyId(job.id);
    setError("");
    try {
      const amount =
        paidAmountById[job.id]?.trim() || job.quotedPrice?.trim() || job.amountPaidLabel?.trim() || "";
      if (!amount) {
        throw new Error("Enter the amount paid before marking paid");
      }
      const updated = await markBookingJobPaid(ownerKey, {
        id: job.id,
        amountPaidLabel: amount,
        paymentReference: paymentRefById[job.id]?.trim() || undefined,
      });
      setJobs((prev) => prev.map((item) => (item.id === job.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark paid");
    } finally {
      setBusyId("");
    }
  }

  async function handleSendQuote(job: BookingJobRecord) {
    const raw = (quotePriceById[job.id] ?? "").replace(/[£,\s]/g, "");
    const price = Number(raw);
    if (!raw || !Number.isFinite(price) || price < 1) {
      setQuoteNoticeById((prev) => ({
        ...prev,
        [job.id]: { tone: "error", text: "Enter the fare in pounds, e.g. 185" },
      }));
      return;
    }
    const validityMinutes = quoteValidityById[job.id] ?? QUOTE_VALIDITY_DEFAULT_MINUTES;
    const priceLabel = `£${price.toFixed(2)}`;
    const ok = window.confirm(
      `Email ${job.customerName} a price of ${priceLabel} with a card payment link` +
        ` (valid ${quoteValidityLabel(validityMinutes)})?\n\nSends to ${job.customerEmail}`,
    );
    if (!ok) return;

    setBusyId(job.id);
    setQuoteNoticeById((prev) => {
      const next = { ...prev };
      delete next[job.id];
      return next;
    });
    try {
      const result = await sendBookingJobQuote(ownerKey, {
        id: job.id,
        quotedPrice: price,
        validityMinutes,
      });
      setJobs((prev) => prev.map((item) => (item.id === job.id ? result.job : item)));
      setQuoteNoticeById((prev) => ({
        ...prev,
        [job.id]: result.paymentEmailSent
          ? {
              tone: "ok",
              text: `Price ${priceLabel} emailed to ${job.customerEmail}. It moves to Paid by itself when they pay.`,
              payUrl: result.payUrl,
            }
          : {
              tone: "warn",
              text: `Price saved, but the email did not send${
                result.paymentEmailError ? ` (${result.paymentEmailError})` : ""
              }. Copy the payment link below and send it by WhatsApp.`,
              payUrl: result.payUrl,
            },
      }));
    } catch (err) {
      setQuoteNoticeById((prev) => ({
        ...prev,
        [job.id]: {
          tone: "error",
          text: err instanceof Error ? err.message : "Could not send the price",
        },
      }));
    } finally {
      setBusyId("");
    }
  }

  async function handleAssign(job: BookingJobRecord) {
    setBusyId(job.id);
    setError("");
    try {
      const draft = draftFor(job);
      if (!draft.driverMobile.trim()) {
        throw new Error("Enter the driver’s mobile number");
      }
      const updated = await assignBookingJobDriver(ownerKey, {
        id: job.id,
        ...draft,
      });
      setJobs((prev) => prev.map((item) => (item.id === job.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign driver");
    } finally {
      setBusyId("");
    }
  }

  const awaitingJobs = useMemo(
    () => jobs.filter((job) => job.status === "awaiting_payment"),
    [jobs],
  );
  const otherJobs = useMemo(
    () => jobs.filter((job) => job.status !== "awaiting_payment"),
    [jobs],
  );

  return (
    <section className="mb-10 rounded-2xl border border-emerald/25 bg-emerald/5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
            Booking requests
          </p>
          <h2 className="mt-1 text-xl font-bold text-white">Quotes &amp; enquiry jobs</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/65">
            Customers who request a quote / book via enquiry appear here. Website card payments
            (Pay now on SumUp) are listed above under “Paid bookings (SumUp)”.
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

      {stats ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-white/45">Website quotes</p>
            <p className="mt-1 text-2xl font-bold text-white">{stats.quoteLeadsTotal}</p>
            <p className="mt-1 text-xs text-white/50">
              Unique fixed quotes emailed to you
              {stats.quoteLeadsLastAt
                ? ` · last ${formatUkInstant(stats.quoteLeadsLastAt)}`
                : " · counting from deploy"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-white/45">Repeat views</p>
            <p className="mt-1 text-2xl font-bold text-white">{stats.quoteLeadsDedupedTotal}</p>
            <p className="mt-1 text-xs text-white/50">Same quote seen again (not re-emailed)</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-white/45">Booking refs</p>
            <p className="mt-1 text-2xl font-bold text-white">{stats.bookingsIssuedTotal}</p>
            <p className="mt-1 text-xs text-white/50">
              MATNI references issued
              {stats.nextBookingRef ? ` · next MATNI-${stats.nextBookingRef}` : ""}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-white/10 bg-navy p-4" data-booking-funnel>
        <h3 className="text-lg font-bold text-white">Customer booking journey</h3>
        <label className="mt-3 block text-sm text-white/80">Quote date (London)
          <input type="date" value={funnelDay || stats?.funnel?.day || ""} onChange={e => setFunnelDay(e.target.value)}
            className="mt-1 block max-w-full rounded-lg border border-white/20 bg-navy px-3 py-2 text-white" />
        </label>
        <p className="mt-2 text-xs text-white/60">Website quote sessions, not identified people. Stages count once per quote. Payment confirmations come from the server. Records retained for 60 days; refresh for updates.</p>
        {stats?.funnel ? <>
          {stats.funnel.truncated && <p className="mt-2 text-sm text-amber-200">Showing a sample of up to 100 quote sessions for this date. These counts are not the full day totals.</p>}
          <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {[["Quotes received", stats.funnel.quotes], ["Book My Transfer", stats.funnel.started], ["Contact stage opened", stats.funnel.detailsOpened],
              ["Details submitted", stats.funnel.detailsSubmitted], ["Payment page opened", stats.funnel.paymentOpened], ["Payment confirmed", stats.funnel.paid]].map(([label, value]) =>
              <div key={label} className="rounded-lg bg-white/5 p-3"><dt className="text-xs text-white/70">{label}</dt><dd className="text-2xl font-bold text-white">{value}</dd></div>)}
          </dl>
          <p className="mt-3 text-xs text-white/60">Possible abandonment means no later recorded stage for 10 minutes. Customers may still return. Older sessions have no historical click-stage data.</p>
          <ul className="mt-4 max-h-96 space-y-2 overflow-y-auto">
            {stats.funnel.rows.map(row => <li key={row.quoteTransactionId} className="break-words rounded-lg border border-white/10 p-3 text-sm text-white/80">
              <p>{row.pickupLabel} → {row.dropoffLabel}</p>
              <p>{row.vehicle} · {row.estimatedPriceLabel} · {row.lastStage}</p>
              <p className="text-xs text-white/55">{formatUkInstant(row.lastAt)} · {row.quoteTransactionId}</p>
              {row.possiblyAbandoned && <p className="text-amber-200">Possibly abandoned — no recent stage recorded</p>}
            </li>)}
          </ul>
          {stats.funnel.rows.length === 0 && <p className="mt-3 text-sm text-white/60">No quote sessions recorded for this date.</p>}
        </> : <p className="mt-3 text-sm text-white/60">Booking journey data is unavailable.</p>}
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-white/60">Loading booking requests…</p>
      ) : jobs.length === 0 ? (
        <p className="mt-6 text-sm text-white/60">
          No booking requests yet. New enquiries from the website will appear here.
        </p>
      ) : (
        <>
        {awaitingJobs.length > 0 ? (
          <div className="mt-6 rounded-xl border border-white/10 bg-navy/40">
            <button
              type="button"
              onClick={() => setAwaitingOpen((open) => !open)}
              aria-expanded={awaitingOpen}
              className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="text-sm font-bold text-white">
                Awaiting Payment ({awaitingJobs.length})
              </span>
              <span className="text-emerald" aria-hidden>
                {awaitingOpen ? "▲" : "▼"}
              </span>
            </button>
          </div>
        ) : null}
        <ul className="mt-6 space-y-4">
          {(awaitingOpen ? [...awaitingJobs, ...otherJobs] : otherJobs).map((job) => {
            const badge = statusBadge(job);
            const draft = draftFor(job);
            const jobNav = resolveOwnerDisplayedLegNav({
              pickupLabel: job.pickupLabel,
              dropoffLabel: job.dropoffLabel,
              airportCode: job.airportCode,
              isFromAirport: job.isFromAirport,
            });
            return (
              <li
                key={job.id}
                id={`owner-booking-job-${job.id}`}
                tabIndex={-1}
                className="rounded-2xl border border-white/10 bg-navy/60 p-4 sm:p-5 outline-none focus:ring-2 focus:ring-emerald/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">{job.customerName}</p>
                    <p className="mt-1 text-sm text-white/65">
                      {job.tripDate} · pick up {job.tripTime} · {job.vehicle}
                    </p>
                    <p className="mt-2 text-xs text-white/45">Ref {job.id}</p>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>

                <dl className="mt-4 grid gap-2 text-sm text-white/70 sm:grid-cols-2">
                  <div>
                    <dt className="text-white/40">Pickup</dt>
                    <dd>
                      <OwnerWazeAddressLink kind="pickup" point={jobNav.pickup} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Destination</dt>
                    <dd>
                      <OwnerWazeAddressLink kind="destination" point={jobNav.destination} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Mobile</dt>
                    <dd>
                      {job.customerMobile ? (
                        <OwnerCustomerCallWhatsApp phone={job.customerMobile} />
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Email</dt>
                    <dd className="break-all">{job.customerEmail || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Quoted / paid</dt>
                    <dd>{job.amountPaidLabel || job.quotedPrice || "Enquiry — quote manually"}</dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Driver status</dt>
                    <dd>{bookingJobAssignmentLabel(job.driverAssignmentStatus)}</dd>
                  </div>
                </dl>

                {job.status === "awaiting_payment" ? (
                  <div className="mt-4 rounded-xl border border-emerald/40 bg-emerald/[0.07] p-4">
                    <p className="text-sm font-bold text-white">
                      {job.sentQuoteAt ? "Price sent" : "Send price to customer"}
                    </p>
                    {job.sentQuoteAt ? (
                      <p className="mt-1 text-xs text-white/65">
                        {job.sentQuotePriceLabel ?? "Price"} sent
                        {job.sentQuoteAt ? ` ${formatUkInstant(job.sentQuoteAt)}` : ""}
                        {job.sentQuoteExpiresAt
                          ? ` · valid until ${formatUkInstant(job.sentQuoteExpiresAt)}`
                          : ""}
                        {" "}· Ref {job.sentQuoteReference}. Send again to change the price or give
                        them more time.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-white/65">
                        Type your fare. We email {job.customerEmail || "the customer"} the price and a
                        card payment link.
                      </p>
                    )}
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="text-xs text-white/50">
                        Price (£)
                        <input
                          inputMode="decimal"
                          value={quotePriceById[job.id] ?? ""}
                          onChange={(event) =>
                            setQuotePriceById((prev) => ({ ...prev, [job.id]: event.target.value }))
                          }
                          placeholder="185"
                          className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 py-2 text-base text-white outline-none focus:border-emerald"
                        />
                      </label>
                      <label className="text-xs text-white/50">
                        Price held for
                        <select
                          value={quoteValidityById[job.id] ?? QUOTE_VALIDITY_DEFAULT_MINUTES}
                          onChange={(event) =>
                            setQuoteValidityById((prev) => ({
                              ...prev,
                              [job.id]: Number(event.target.value),
                            }))
                          }
                          className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 py-2 text-base text-white outline-none focus:border-emerald"
                        >
                          {QUOTE_VALIDITY_OPTIONS_MINUTES.map((minutes) => (
                            <option key={minutes} value={minutes}>
                              {quoteValidityLabel(minutes)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex items-end">
                        <button
                          type="button"
                          disabled={busyId === job.id}
                          onClick={() => void handleSendQuote(job)}
                          className="min-h-11 w-full rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-emerald-light disabled:opacity-60"
                        >
                          {busyId === job.id
                            ? "Sending…"
                            : job.sentQuoteAt
                              ? "Send new price"
                              : "Send price"}
                        </button>
                      </div>
                    </div>
                    {quoteNoticeById[job.id] ? (
                      <div
                        role="status"
                        className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                          quoteNoticeById[job.id].tone === "ok"
                            ? "bg-emerald/15 text-emerald"
                            : quoteNoticeById[job.id].tone === "warn"
                              ? "bg-amber-400/15 text-amber-200"
                              : "bg-red-500/15 text-red-200"
                        }`}
                      >
                        <p>{quoteNoticeById[job.id].text}</p>
                        {quoteNoticeById[job.id].payUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              void navigator.clipboard
                                ?.writeText(quoteNoticeById[job.id].payUrl ?? "")
                                .catch(() => undefined)
                            }
                            className="mt-2 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Copy payment link
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {job.status === "awaiting_payment" ? (
                  <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-3">
                    <label className="text-xs text-white/50 sm:col-span-1">
                      Amount paid
                      <input
                        value={paidAmountById[job.id] ?? job.quotedPrice ?? ""}
                        onChange={(event) =>
                          setPaidAmountById((prev) => ({ ...prev, [job.id]: event.target.value }))
                        }
                        placeholder="£85"
                        className="mt-1 w-full rounded-xl border border-white/15 bg-navy px-3 py-2 text-sm text-white outline-none focus:border-emerald"
                      />
                    </label>
                    <label className="text-xs text-white/50 sm:col-span-1">
                      SumUp / payment ref (optional)
                      <input
                        value={paymentRefById[job.id] ?? ""}
                        onChange={(event) =>
                          setPaymentRefById((prev) => ({ ...prev, [job.id]: event.target.value }))
                        }
                        placeholder="Optional"
                        className="mt-1 w-full rounded-xl border border-white/15 bg-navy px-3 py-2 text-sm text-white outline-none focus:border-emerald"
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        type="button"
                        disabled={busyId === job.id}
                        onClick={() => void handleMarkPaid(job)}
                        className="w-full rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-emerald-light disabled:opacity-60"
                      >
                        {busyId === job.id ? "Saving…" : "Mark paid & add to calendar"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {job.status === "paid" ? (
                  <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-semibold text-white">
                      Assign driver (email only — no driver login)
                    </p>
                    <p className="text-xs text-white/50">
                      Drivers have no dashboard or access key. They get the job details and a
                      confirm link by email. Enter how much you are paying them for this job — not
                      what the customer paid. You will receive an email copy of the assignment.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          ["driverFirstName", "Driver first name"],
                          ["driverEmail", "Driver email"],
                          ["driverMobile", "Driver mobile"],
                          ["driverCarMake", "Car make"],
                          ["driverCarModel", "Car model"],
                          ["driverCarColour", "Car colour"],
                          ["driverReg", "Registration"],
                          ["driverPayAmount", "Amount to pay driver (not customer price)"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className="text-xs text-white/50">
                          {label}
                          <input
                            value={draft[key]}
                            onChange={(event) =>
                              updateDraft(job.id, { [key]: event.target.value })
                            }
                            className="mt-1 w-full rounded-xl border border-white/15 bg-navy px-3 py-2 text-sm text-white outline-none focus:border-emerald"
                          />
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={busyId === job.id}
                      onClick={() => void handleAssign(job)}
                      className="rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-emerald-light disabled:opacity-60"
                    >
                      {busyId === job.id
                        ? "Sending…"
                        : job.driverAssignmentStatus === "pending" ||
                            job.driverAssignmentStatus === "accepted"
                          ? "Resend assignment email"
                          : "Email driver to confirm job"}
                    </button>
                    {job.driverAssignmentStatus === "accepted" ? (
                      <p className="text-sm font-semibold text-emerald">
                        {job.driverFirstName} confirmed this job
                        {job.driverAcceptedAt
                          ? ` · ${formatUkInstant(job.driverAcceptedAt)}`
                          : ""}
                      </p>
                    ) : null}
                    {job.driverAssignmentStatus === "pending" ||
                    job.driverAssignmentStatus === "accepted" ? (
                      <a
                        href={buildWhatsAppDriverDetailsLink({
                          customerName: job.customerName,
                          customerMobile: job.customerMobile,
                          tripDate: job.tripDate,
                          tripTime: job.tripTime,
                          driverName: job.driverFirstName,
                          driverMobile: job.driverMobile,
                          carMake: job.driverCarMake,
                          carModel: job.driverCarModel,
                          carColour: job.driverCarColour,
                          reg: job.driverReg,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
                      >
                        Send via WhatsApp
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        </>
      )}
    </section>
  );
}
