"use client";

import { useCallback, useEffect, useState } from "react";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";

/**
 * One-tap owner approval from WhatsApp / phone notification / email.
 * The signed token is read from the address bar, then removed from it, and is
 * only ever sent to the server in a POST body. Opening the page never acts:
 * the owner confirms with a button press.
 */
type Preview = {
  reference: string;
  status: string;
  customerName: string;
  tripDate: string;
  tripTime: string;
  pickupLabel: string;
  dropoffLabel: string;
  flightNumber: string;
  passengers: number;
  amountLabel: string;
  expiresAt: string;
  cardHeld: boolean;
};

const WORKER_BASE = resolveWorkerBaseUrl();

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
    : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function remaining(expiresAt: string, now: number): string {
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return "Expired";
  const mins = Math.ceil(ms / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min left` : `${mins} min left`;
}

export default function OwnerDecisionClient() {
  const [token, setToken] = useState("");
  const [suggested, setSuggested] = useState<"approve" | "decline" | "">("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = (params.get("t") || "").trim();
    const action = params.get("do");
    setToken(t);
    setSuggested(action === "approve" || action === "decline" ? action : "");
    // Don't leave the token in the address bar or browser history.
    window.history.replaceState(null, "", "/owner/decision/");
    if (!t) {
      setError("This link is not valid.");
      return;
    }
    post("/owner/approval-link/preview", { token: t }).then(({ ok, payload }) => {
      if (!ok) setError(String(payload.error || "This link is not valid."));
      else setPreview(payload as unknown as Preview);
    }).catch(() => setError("Couldn't load the booking. Check your connection and try again."));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const decide = useCallback(
    async (action: "approve" | "decline") => {
      if (!token || busy) return;
      setBusy(true);
      setError("");
      try {
        const { ok, payload } = await post("/owner/approval-link/decide", { token, action });
        if (!ok) {
          setError(String(payload.error || "That didn't work. Please try again or use the Owner Dashboard."));
        } else if (action === "approve") {
          if (payload.cardHold === "capture_failed") {
            setError(
              "Approved, but the card could not be charged yet. It will retry automatically — the customer is not confirmed until payment succeeds.",
            );
          } else {
            setDone(
              payload.bookingConfirmed === false
                ? "Approved and paid. The confirmation is still being sent — check the Owner Dashboard."
                : "Approved — payment taken and the customer's confirmation email has been sent.",
            );
          }
        } else {
          setDone("Declined — the card hold has been released and the customer has been told.");
        }
      } catch {
        setError("Couldn't reach the server. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [token, busy],
  );

  const pending = preview?.status === "SHORT_NOTICE_AWAITING_APPROVAL";
  const left = preview ? remaining(preview.expiresAt, now) : "";
  const expired = left === "Expired";

  return (
    <section className="rounded-3xl border border-white/15 bg-white/[0.05] p-6 shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald">Pending booking</p>
      <h1 className="mt-2 text-2xl font-bold">Approve or decline</h1>

      {!preview && !error ? <p className="mt-4 text-white/75">Loading…</p> : null}

      {preview ? (
        <dl className="mt-5 space-y-2 text-[15px]">
          <Row label="Reference" value={preview.reference} />
          <Row label="Customer" value={preview.customerName || "—"} />
          <Row label="Pickup" value={`${ukDate(preview.tripDate)} at ${preview.tripTime}`} />
          <Row label="From" value={preview.pickupLabel || "—"} />
          <Row label="To" value={preview.dropoffLabel || "—"} />
          {preview.flightNumber ? <Row label="Flight" value={preview.flightNumber} /> : null}
          <Row label="Passengers" value={String(preview.passengers ?? "—")} />
          <Row label="Fare" value={preview.amountLabel} />
          <Row label="Card" value={preview.cardHeld ? "Held — not charged yet" : "Not held"} />
          <Row label="Time left" value={left} />
        </dl>
      ) : null}

      {error ? (
        <p role="alert" className="mt-5 rounded-xl border border-red-300/40 bg-red-500/15 px-4 py-3 text-sm text-red-50">
          {error}
        </p>
      ) : null}

      {done ? (
        <p role="status" className="mt-5 rounded-xl border border-emerald/50 bg-emerald/15 px-4 py-3 text-sm text-white">
          {done}
        </p>
      ) : null}

      {preview && !done && pending && !expired ? (
        <div className="mt-6 grid gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide("approve")}
            className={`min-h-12 rounded-xl px-5 py-3 text-base font-bold text-navy transition disabled:opacity-60 ${
              suggested === "decline" ? "bg-emerald/80" : "bg-emerald"
            }`}
          >
            {busy ? "Working…" : "Approve booking"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide("decline")}
            className="min-h-12 rounded-xl border border-white/30 px-5 py-3 text-base font-semibold text-white disabled:opacity-60"
          >
            Decline booking
          </button>
        </div>
      ) : null}

      {preview && !done && (!pending || expired) ? (
        <p className="mt-5 text-sm text-white/75">
          This request is no longer waiting for a decision ({expired ? "expired" : preview.status.replace("SHORT_NOTICE_", "").toLowerCase().replace(/_/g, " ")}).
        </p>
      ) : null}

      <a href="/owner/?ui=mobile#home" className="mt-6 inline-block text-sm font-semibold text-emerald underline-offset-4 hover:underline">
        View booking details in the Owner Dashboard
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
