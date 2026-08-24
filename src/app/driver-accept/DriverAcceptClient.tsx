"use client";

import { useEffect, useState } from "react";
import { SITE } from "@/lib/data";
import { confirmDriverAcceptJob, lookupDriverAcceptJob } from "@/lib/booking-jobs-api";
import { formatDriverPayAmount } from "../../../shared/tracking";

type JobSummary = Awaited<ReturnType<typeof lookupDriverAcceptJob>>;

export default function DriverAcceptClient() {
  const [token, setToken] = useState("");
  const [job, setJob] = useState<JobSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token")?.trim() || "";
    setToken(value);
    if (!value) {
      setError("This confirmation link is missing a token.");
      setLoading(false);
      return;
    }

    void lookupDriverAcceptJob(value)
      .then((next) => {
        setJob(next);
        if (next.driverAssignmentStatus === "accepted") {
          setDone(true);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load this job");
      })
      .finally(() => setLoading(false));
  }, []);

  async function accept() {
    if (!token || confirming) return;
    setConfirming(true);
    setError("");
    try {
      await confirmDriverAcceptJob(token, "accept");
      setDone(true);
      setJob((prev) => (prev ? { ...prev, driverAssignmentStatus: "accepted" } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm job");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <main className="min-h-dvh overflow-x-hidden bg-navy px-4 py-12">
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald">{SITE.name}</p>
        <h1 className="mt-2 text-2xl font-bold text-white">Confirm job assignment</h1>

        {loading ? <p className="mt-6 text-sm text-white/65">Loading job…</p> : null}
        {error ? (
          <p className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        {job ? (
          <div className="mt-6 space-y-3 text-sm text-white/80">
            <p>
              Hi {job.driverFirstName || "there"} — please confirm you can cover this journey.
            </p>
            <div className="rounded-xl border border-white/10 bg-navy/50 p-4">
              <p>
                <strong className="text-white">Customer:</strong> {job.customerName}
              </p>
              <p className="mt-2">
                <strong className="text-white">Pickup:</strong> {job.pickupLabel}
              </p>
              <p className="mt-2">
                <strong className="text-white">Drop-off:</strong> {job.dropoffLabel}
              </p>
              <p className="mt-2">
                <strong className="text-white">Date / pick up time:</strong> {job.tripDate} at{" "}
                {job.tripTime}
              </p>
              <p className="mt-2">
                <strong className="text-white">Your pay for this journey:</strong>{" "}
                {formatDriverPayAmount(job.driverPayAmount)}
              </p>
              <p className="mt-2 text-white/55">
                You will be paid after each journey (usually the next day).
              </p>
            </div>

            {done ? (
              <p className="rounded-xl border border-emerald/35 bg-emerald/10 px-4 py-3 font-semibold text-emerald">
                Thanks — this job is confirmed. It will appear on your Driver Dashboard under Today
                or Upcoming.
              </p>
            ) : (
              <button
                type="button"
                disabled={confirming}
                onClick={() => void accept()}
                className="w-full rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy transition-colors hover:bg-emerald-light disabled:opacity-60"
              >
                {confirming ? "Confirming…" : "Confirm I accept this job"}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
