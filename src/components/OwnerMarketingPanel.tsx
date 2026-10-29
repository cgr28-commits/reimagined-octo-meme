"use client";

/**
 * Owner dashboard: customers who opted in to marketing, a CSV download, and an email
 * campaign to everyone still subscribed. Every email has a one-click unsubscribe link,
 * and unsubscribed customers are never emailed.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import {
  MARKETING_MESSAGE_MAX,
  MARKETING_SUBJECT_MAX,
  marketingSubscribersCsv,
  type MarketingSubscriberRow,
} from "../../shared/marketing";

const WORKER_BASE = resolveWorkerBaseUrl();

type CampaignLog = { id: string; at: string; subject: string; sent: number; failed: number; total: number };

const SOURCE_LABELS: Record<string, string> = {
  "paid-booking": "Paid booking",
  "booking-request": "Booking request",
  "tour-enquiry": "Tour enquiry",
  "vehicle-enquiry": "Vehicle enquiry",
};

function when(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });
}

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

export default function OwnerMarketingPanel({ ownerKey }: { ownerKey: string }) {
  const [subscribers, setSubscribers] = useState<MarketingSubscriberRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showUnsubscribed, setShowUnsubscribed] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"" | "test" | "send">("");
  const [notice, setNotice] = useState("");
  const [sendError, setSendError] = useState("");
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await ownerFetch<{ subscribers: MarketingSubscriberRow[]; campaigns: CampaignLog[] }>(
        ownerKey,
        "/owner/marketing/subscribers",
      );
      setSubscribers(result.subscribers);
      setCampaigns(result.campaigns ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the marketing list");
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(() => subscribers.filter((s) => !s.unsubscribedAt), [subscribers]);
  const shown = showUnsubscribed ? subscribers : active;

  function downloadCsv() {
    const blob = new Blob([marketingSubscribersCsv(subscribers)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marketing-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function send(test: boolean) {
    setSendError("");
    setNotice("");
    if (!subject.trim() || !message.trim()) {
      setSendError("Please write a subject and a message first.");
      return;
    }
    setBusy(test ? "test" : "send");
    try {
      if (test) {
        const result = await ownerFetch<{ sentTo: string }>(ownerKey, "/owner/marketing/send", {
          subject,
          message,
          test: true,
        });
        setNotice(`Test email sent to ${result.sentTo}. Check how it looks before sending to everyone.`);
      } else {
        const result = await ownerFetch<{ sent: number; failed: number; total: number; notSent: number }>(
          ownerKey,
          "/owner/marketing/send",
          { subject, message, confirm: true },
        );
        setNotice(
          `Sent to ${result.sent} of ${result.total} subscribers` +
            (result.failed ? ` (${result.failed} failed)` : "") +
            (result.notSent ? `. ${result.notSent} more not sent — send again later to reach them.` : "."),
        );
        setConfirming(false);
        setSubject("");
        setMessage("");
        void load();
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Marketing list</h2>
            <p className="text-sm text-white/60">
              {loading ? "Loading…" : `${active.length} subscribed · ${subscribers.length - active.length} unsubscribed`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadCsv}
              disabled={!subscribers.length}
              className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              Download CSV
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white"
            >
              Refresh
            </button>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
        <label className="mt-3 flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={showUnsubscribed} onChange={(e) => setShowUnsubscribed(e.target.checked)} />
          Show unsubscribed
        </label>
        {!loading && !shown.length ? (
          <p className="mt-4 text-sm text-white/60">No one on the list yet. Customers join when they tick the marketing box when booking.</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10">
            {shown.map((s) => (
              <li key={s.email} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                <div className="min-w-0">
                  <p className="break-all font-medium text-white">{s.name ? `${s.name} · ` : ""}{s.email}</p>
                  <p className="text-white/50">
                    {SOURCE_LABELS[s.source] ?? s.source} · opted in {when(s.optedInAt)}
                  </p>
                </div>
                {s.unsubscribedAt ? (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">Unsubscribed {when(s.unsubscribedAt)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-white">Send an email</h2>
        <p className="mt-1 text-sm text-white/60">
          Goes to everyone still subscribed, starting &quot;Hi [first name],&quot; with a &quot;Get a fixed-price quote&quot;
          button and an unsubscribe link. Send yourself a test first.
        </p>
        <label className="mt-4 block text-sm text-white/80">
          Subject
          <input
            value={subject}
            maxLength={MARKETING_SUBJECT_MAX}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Book your Christmas airport runs early"
            className="mt-1 min-h-12 w-full rounded-xl border border-white/15 bg-navy px-3 text-base text-white placeholder:text-white/35"
          />
        </label>
        <label className="mt-3 block text-sm text-white/80">
          Message
          <textarea
            value={message}
            maxLength={MARKETING_MESSAGE_MAX}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            placeholder="Write your message. Leave a blank line between paragraphs."
            className="mt-1 w-full rounded-xl border border-white/15 bg-navy px-3 py-2 text-base text-white placeholder:text-white/35"
          />
        </label>
        {sendError ? <p className="mt-3 text-sm text-red-300">{sendError}</p> : null}
        {notice ? <p className="mt-3 text-sm text-emerald">{notice}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void send(true)}
            className="min-h-12 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === "test" ? "Sending test…" : "Send me a test"}
          </button>
          {confirming ? (
            <>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void send(false)}
                className="min-h-12 rounded-xl bg-emerald px-4 text-sm font-semibold text-navy disabled:opacity-50"
              >
                {busy === "send" ? "Sending… keep this page open" : `Yes, send to ${active.length} subscribers`}
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => setConfirming(false)}
                className="min-h-12 rounded-xl border border-white/15 px-4 text-sm text-white/80 disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={Boolean(busy) || !active.length}
              onClick={() => setConfirming(true)}
              className="min-h-12 rounded-xl bg-emerald px-4 text-sm font-semibold text-navy disabled:opacity-50"
            >
              Send to all subscribers
            </button>
          )}
        </div>
      </section>

      {campaigns.length ? (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-white">Sent emails</h2>
          <ul className="mt-3 divide-y divide-white/10 text-sm">
            {campaigns.map((c) => (
              <li key={c.id} className="py-2 text-white/80">
                <span className="font-medium text-white">{c.subject}</span> · {when(c.at)} · sent {c.sent}/{c.total}
                {c.failed ? ` · ${c.failed} failed` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
