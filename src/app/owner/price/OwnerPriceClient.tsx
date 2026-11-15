"use client";

import { useEffect, useState } from "react";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";

/**
 * "Send a price" from the owner's New request email.
 * The signed token is read from the address bar, then removed from it, and is only
 * ever sent to the server in a POST body. Opening the page never sends anything:
 * the owner types the fare and presses Send price.
 */
type RequestPreview = {
  id: string;
  status: string;
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  tripLabel: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  returnJourney: boolean;
  returnDate: string;
  returnTime: string;
  flightNumber: string;
  passengers: number;
  suitcases: number;
  vehicle: string;
  quotedPrice: string;
  sentQuotePriceLabel: string;
  sentQuoteAt: string;
  sentQuoteExpiresAt: string;
};

const WORKER_BASE = resolveWorkerBaseUrl();
const HOLD_OPTIONS = [
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 720, label: "12 hours" },
  { minutes: 1440, label: "24 hours" },
];

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${WORKER_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    referrerPolicy: "no-referrer",
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, payload };
}

function ukDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function ukInstant(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      });
}

function priceFromLabel(label: string): string {
  const n = Number(String(label || "").replace(/[£,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? String(Math.round(n * 100) / 100) : "";
}

export default function OwnerPriceClient() {
  const [token, setToken] = useState("");
  const [job, setJob] = useState<RequestPreview | null>(null);
  const [price, setPrice] = useState("");
  const [hold, setHold] = useState(1440);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ text: string; payUrl?: string; warn?: boolean } | null>(null);

  useEffect(() => {
    const t = (new URLSearchParams(window.location.search).get("t") || "").trim();
    setToken(t);
    // Don't leave the token in the address bar or browser history.
    window.history.replaceState(null, "", "/owner/price/");
    if (!t) {
      setError("This link is not valid.");
      return;
    }
    post("/owner/request-link/preview", { token: t })
      .then(({ ok, payload }) => {
        if (!ok) {
          setError(String(payload.error || "This link is not valid."));
          return;
        }
        const preview = payload as unknown as RequestPreview;
        setJob(preview);
        setPrice(priceFromLabel(preview.sentQuotePriceLabel || preview.quotedPrice));
      })
      .catch(() => setError("Couldn't load the request. Check your connection and try again."));
  }, []);

  async function send() {
    if (!job || busy) return;
    const amount = Number(price.replace(/[£,\s]/g, ""));
    if (!price.trim() || !Number.isFinite(amount) || amount < 1) {
      setError("Type the fare in pounds, e.g. 185");
      return;
    }
    const holdLabel = HOLD_OPTIONS.find((o) => o.minutes === hold)?.label ?? `${hold} min`;
    if (
      !window.confirm(
        `Email ${job.customerName || "the customer"} a price of £${amount.toFixed(2)} with a card payment link (valid ${holdLabel})?\n\nSends to ${job.customerEmail}`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { ok, payload } = await post("/owner/request-link/send-quote", {
        token,
        quotedPrice: amount,
        validityMinutes: hold,
      });
      if (!ok) {
        setError(String(payload.error || "That didn't work. Please try again or use the Owner Dashboard."));
        return;
      }
      if (payload.job) setJob(payload.job as RequestPreview);
      const payUrl = typeof payload.payUrl === "string" ? payload.payUrl : undefined;
      setDone(
        payload.paymentEmailSent
          ? {
              text: `Price £${amount.toFixed(2)} sent to ${job.customerEmail}. It moves to Booked on your dashboard by itself when they pay.`,
              payUrl,
            }
          : {
              text: `Price saved, but the email to the customer did not send${
                payload.paymentEmailError ? ` (${String(payload.paymentEmailError)})` : ""
              }. Copy the payment link below and send it by WhatsApp.`,
              payUrl,
              warn: true,
            },
      );
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const canPrice = job?.status === "awaiting_payment";

  return (
    <section className="rounded-3xl border border-white/15 bg-white/[0.05] p-6 shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald">Website request</p>
      <h1 className="mt-2 text-2xl font-bold">Send a price</h1>

      {!job && !error ? <p className="mt-4 text-white/75">Loading…</p> : null}

      {job ? (
        <dl className="mt-5 space-y-2 text-[15px]">
          <Row label="Customer" value={job.customerName || "—"} />
          {job.customerMobile ? <Row label="Mobile" value={job.customerMobile} /> : null}
          <Row label="Pickup" value={`${ukDate(job.tripDate)} at ${job.tripTime}`} />
          <Row label="From" value={job.pickupLabel || "—"} />
          <Row label="To" value={job.dropoffLabel || "—"} />
          {job.returnJourney ? (
            <Row label="Return" value={job.returnDate ? `${ukDate(job.returnDate)} at ${job.returnTime}` : "Yes"} />
          ) : null}
          {job.flightNumber ? <Row label="Flight" value={job.flightNumber} /> : null}
          <Row label="Passengers" value={`${job.passengers ?? "—"} · ${job.suitcases ?? 0} cases`} />
          <Row label="Vehicle" value={job.vehicle || "—"} />
          {job.sentQuoteAt ? (
            <Row
              label="Already sent"
              value={`${job.sentQuotePriceLabel || "Price"} · ${ukInstant(job.sentQuoteAt)}`}
            />
          ) : null}
        </dl>
      ) : null}

      {job && canPrice && !done ? (
        <div className="mt-6 grid gap-3">
          {job.sentQuoteAt ? (
            <p className="text-sm text-white/70">
              You can send again to change the price or give them more time — their payment link updates to the new price.
            </p>
          ) : null}
          <label className="text-sm text-white/70">
            Price for {job.returnJourney ? "both journeys" : "the journey"} (£)
            <input
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="185"
              className="mt-1 min-h-12 w-full rounded-xl border border-white/20 bg-navy px-4 py-2 text-lg font-semibold text-white outline-none focus:border-emerald"
            />
          </label>
          <label className="text-sm text-white/70">
            Price held for
            <select
              value={hold}
              onChange={(event) => setHold(Number(event.target.value))}
              className="mt-1 min-h-12 w-full rounded-xl border border-white/20 bg-navy px-4 py-2 text-base text-white outline-none focus:border-emerald"
            >
              {HOLD_OPTIONS.map((option) => (
                <option key={option.minutes} value={option.minutes}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void send()}
            className="min-h-12 rounded-xl bg-emerald px-5 py-3 text-base font-bold text-navy transition disabled:opacity-60"
          >
            {busy ? "Sending…" : job.sentQuoteAt ? "Send new price" : "Send price to customer"}
          </button>
          <p className="text-xs text-white/55">
            The customer gets an email with the price and a card payment link.
          </p>
        </div>
      ) : null}

      {job && !canPrice && !done ? (
        <p className="mt-5 rounded-xl border border-white/15 px-4 py-3 text-sm text-white/80">
          {job.status === "paid" ? "This booking is already paid." : "This request was cancelled."}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-5 rounded-xl border border-red-300/40 bg-red-500/15 px-4 py-3 text-sm text-red-50">
          {error}
        </p>
      ) : null}

      {done ? (
        <div
          role="status"
          className={`mt-5 rounded-xl border px-4 py-3 text-sm text-white ${
            done.warn ? "border-amber-300/50 bg-amber-500/15" : "border-emerald/50 bg-emerald/15"
          }`}
        >
          <p>{done.text}</p>
          {done.payUrl ? (
            <p className="mt-2 break-all text-xs text-white/75">Payment link: {done.payUrl}</p>
          ) : null}
        </div>
      ) : null}

      <a
        href="/owner/?ui=mobile#home"
        className="mt-6 inline-block text-sm font-semibold text-emerald underline-offset-4 hover:underline"
      >
        Open the Owner Dashboard
      </a>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
      <dt className="text-white/60">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}
