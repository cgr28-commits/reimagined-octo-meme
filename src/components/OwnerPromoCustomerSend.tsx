"use client";

/**
 * Owner Dashboard → Promo Codes → "Send codes to my customer list" (owner, 16 Nov 2026).
 * Loads past customers from paid bookings, ticks the ones who can get a thank-you code,
 * sends a test copy to the owner, then sends each ticked customer their own code in batches.
 */
import { useCallback, useMemo, useState } from "react";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import {
  CUSTOMER_OFFER_DEFAULT_VALIDITY_DAYS,
  CUSTOMER_OFFER_EXCLUSION_LABEL,
  type CustomerOfferExclusion,
} from "../../shared/promo-customer-offer";

const WORKER_BASE = resolveWorkerBaseUrl();

type Row = {
  email: string;
  name: string;
  bookings: number;
  lastTripDate: string;
  refundedOrCancelled: boolean;
  exclusions: CustomerOfferExclusion[];
  sendable: boolean;
  suggested: boolean;
};

type ListResponse = { ok: true; customers: Row[]; batchMax: number; preview: boolean };
type SendResult = { email: string; outcome: "sent" | "preview" | "skipped" | "failed"; code?: string; reason?: string };

async function ownerFetch<T>(ownerKey: string, path: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${WORKER_BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error || "Something went wrong");
  return payload;
}

function tripDay(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || "—";
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}

function reasonLabel(reason?: string): string {
  if (!reason) return "";
  return (CUSTOMER_OFFER_EXCLUSION_LABEL as Record<string, string>)[reason] ?? reason.replace(/_/g, " ");
}

export default function OwnerPromoCustomerSend({ ownerKey, onSent }: { ownerKey: string; onSent?: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [batchMax, setBatchMax] = useState(20);
  const [preview, setPreview] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [days, setDays] = useState(String(CUSTOMER_OFFER_DEFAULT_VALIDITY_DAYS));
  const [busy, setBusy] = useState<"" | "loading" | "test" | "sending">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<SendResult[]>([]);

  const load = useCallback(async () => {
    setBusy("loading");
    setError("");
    setNotice("");
    try {
      const data = await ownerFetch<ListResponse>(ownerKey, "/owner/promo/customers");
      setRows(data.customers);
      setBatchMax(data.batchMax || 20);
      setPreview(Boolean(data.preview));
      setTicked(new Set(data.customers.filter((r) => r.suggested).map((r) => r.email)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load customers");
    } finally {
      setBusy("");
    }
  }, [ownerKey]);

  const sendable = useMemo(() => (rows ?? []).filter((r) => r.sendable), [rows]);
  const chosen = useMemo(() => sendable.filter((r) => ticked.has(r.email)), [sendable, ticked]);

  function toggle(email: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  async function sendTest() {
    setBusy("test");
    setError("");
    setNotice("");
    try {
      const r = await ownerFetch<{ sentTo: string; preview?: boolean }>(ownerKey, "/owner/promo/customers/send", {
        test: true,
        validityDays: Number(days),
      });
      setNotice(r.preview ? "Preview site: test email not sent." : `Test email sent to ${r.sentTo}. It uses a sample code that won't work at checkout.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test email failed");
    } finally {
      setBusy("");
    }
  }

  async function sendAll() {
    if (!chosen.length) return;
    const ok = window.confirm(
      `Send ${chosen.length} customer${chosen.length === 1 ? "" : "s"} their own 10% code, valid ${days} days?\n\nThis emails real customers and can't be undone.`,
    );
    if (!ok) return;
    setBusy("sending");
    setError("");
    setNotice("");
    setResults([]);
    const emails = chosen.map((r) => r.email);
    const all: SendResult[] = [];
    setProgress({ done: 0, total: emails.length });
    try {
      for (let i = 0; i < emails.length; i += batchMax) {
        const batch = emails.slice(i, i + batchMax);
        const r = await ownerFetch<{ results: SendResult[] }>(ownerKey, "/owner/promo/customers/send", {
          emails: batch,
          validityDays: Number(days),
          confirm: true,
        });
        all.push(...r.results);
        setResults([...all]);
        setProgress({ done: Math.min(emails.length, i + batch.length), total: emails.length });
      }
      const sent = all.filter((r) => r.outcome === "sent" || r.outcome === "preview").length;
      const failed = all.filter((r) => r.outcome === "failed").length;
      const skipped = all.filter((r) => r.outcome === "skipped").length;
      setNotice(
        `${preview ? "Preview: codes created, no emails sent" : "Done"} — ${sent} sent${failed ? `, ${failed} failed` : ""}${skipped ? `, ${skipped} skipped` : ""}.`,
      );
      onSent?.();
      await load();
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "Sending stopped"} — ${all.length} handled before it stopped. Reload the list before trying again.`);
    } finally {
      setBusy("");
      setProgress(null);
    }
  }

  const inputClass =
    "mt-1 block w-24 rounded-lg border border-white/15 bg-white px-3 py-2 text-sm font-semibold text-[#071c38] focus:outline-none focus:ring-2 focus:ring-emerald";

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5" data-promo-customer-send>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Send codes to my customer list</h3>
          <p className="text-xs text-white/55">
            Everyone who has booked and paid. Each customer gets their own 10% code by email, with an unsubscribe link.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy !== ""}
          className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy === "loading" ? "Loading…" : rows ? "Reload list" : "Load my customers"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-300" role="alert">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm text-emerald" role="status">{notice}</p> : null}
      {preview ? <p className="mt-2 text-xs font-semibold text-[#fcd34d]">Preview site: no emails are sent; codes show here instead.</p> : null}

      {rows ? (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-white/70">
              Code lasts (days)
              <input
                className={inputClass}
                inputMode="numeric"
                value={days}
                onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
              />
            </label>
            <button
              type="button"
              onClick={() => void sendTest()}
              disabled={busy !== ""}
              className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === "test" ? "Sending…" : "Email me a test copy"}
            </button>
            <button
              type="button"
              onClick={() => void sendAll()}
              disabled={busy !== "" || !chosen.length}
              className="min-h-11 rounded-xl bg-[#2fbf4a] px-5 text-sm font-bold !text-[#071c38] disabled:opacity-50"
            >
              {busy === "sending" && progress ? `Sending ${progress.done}/${progress.total}…` : `Send to ${chosen.length} customer${chosen.length === 1 ? "" : "s"}`}
            </button>
          </div>
          <p className="mt-2 text-xs text-white/55">
            {rows.length} customers · {sendable.length} can get a code · {chosen.length} ticked. Cancelled or refunded customers are unticked;
            tick them if you still want to send.
          </p>

          <ul className="mt-3 max-h-[28rem] divide-y divide-white/10 overflow-auto rounded-xl border border-white/10">
            {rows.map((r) => {
              const result = results.find((x) => x.email === r.email);
              return (
                <li key={r.email} className="flex items-start gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 accent-[#2fbf4a]"
                    checked={r.sendable && ticked.has(r.email)}
                    disabled={!r.sendable || busy !== ""}
                    onChange={() => toggle(r.email)}
                    aria-label={`Send a code to ${r.name || r.email}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{r.name || r.email}</p>
                    <p className="truncate text-xs text-white/60">
                      {r.email} · {r.bookings} booking{r.bookings === 1 ? "" : "s"} · last trip {tripDay(r.lastTripDate)}
                    </p>
                    {r.exclusions.length ? (
                      <p className="mt-0.5 text-xs font-semibold text-[#fcd34d]">{r.exclusions.map((x) => reasonLabel(x)).join(" · ")}</p>
                    ) : null}
                    {result ? (
                      <p className={`mt-0.5 text-xs font-semibold ${result.outcome === "failed" ? "text-red-300" : "text-emerald"}`}>
                        {result.outcome === "sent"
                          ? `Sent ${result.code}`
                          : result.outcome === "preview"
                            ? `Preview code ${result.code}`
                            : result.outcome === "failed"
                              ? `Failed: ${result.reason}`
                              : `Skipped: ${reasonLabel(result.reason)}`}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
