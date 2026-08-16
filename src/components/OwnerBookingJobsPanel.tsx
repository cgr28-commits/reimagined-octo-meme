"use client";

import { useCallback, useEffect, useState } from "react";
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
  type OwnerQuoteStats,
} from "@/lib/booking-jobs-api";
import { buildWhatsAppDriverDetailsLink } from "@/lib/tracking-api";

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

export default function OwnerBookingJobsPanel({ ownerKey }: OwnerBookingJobsPanelProps) {
  const [jobs, setJobs] = useState<BookingJobRecord[]>([]);
  const [stats, setStats] = useState<OwnerQuoteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [paidAmountById, setPaidAmountById] = useState<Record<string, string>>({});
  const [paymentRefById, setPaymentRefById] = useState<Record<string, string>>({});
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
        fetchOwnerQuoteStats(ownerKey).catch(() => null),
      ]);
      setJobs(next);
      setStats(nextStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <section className="mb-10 rounded-2xl border border-emerald/25 bg-emerald/5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
            Booking requests
          </p>
          <h2 className="mt-1 text-xl font-bold text-white">Quotes &amp; confirmed jobs</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/65">
            Customers enquire online. After you confirm and they pay via your SumUp link, mark the
            job paid (adds it to the calendar), then assign a driver by email with their pay for
            the journey.
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
              Unique live quotes emailed to you
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
        <ul className="mt-6 space-y-4">
          {jobs.map((job) => {
            const badge = statusBadge(job);
            const draft = draftFor(job);
            return (
              <li
                key={job.id}
                className="rounded-2xl border border-white/10 bg-navy/60 p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">{job.customerName}</p>
                    <p className="mt-1 text-sm text-white/65">
                      {job.tripDate} · pick up {job.tripTime} · {job.vehicle}
                    </p>
                    <p className="mt-2 text-sm text-white/80">
                      {job.pickupLabel} → {job.dropoffLabel}
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
                    <dt className="text-white/40">Mobile</dt>
                    <dd>{job.customerMobile || "—"}</dd>
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
      )}
    </section>
  );
}
