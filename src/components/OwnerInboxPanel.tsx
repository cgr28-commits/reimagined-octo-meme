"use client";

/**
 * Owner dashboard inbox: emails to bookings@ (copied in from GoDaddy mail), read and reply.
 * Replies go out from bookings@ with the branded signature and are copied back into GoDaddy.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ownerInboxFetch,
  type InboxListResponse,
  type InboxThreadResponse,
} from "@/lib/owner-inbox-api";
import type { InboxMessage, InboxThreadSummary } from "../../shared/owner-inbox";

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" });
}

function fullWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });
}

function SetupCard({ ownerKey, onDone }: { ownerKey: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [manual, setManual] = useState(false);
  const [secret, setSecret] = useState("");
  const [endpoint, setEndpoint] = useState("");

  async function connect(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await ownerInboxFetch(ownerKey, "/owner/inbox/setup", body);
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not connect";
      setError(message);
      if (/paste its signing secret/i.test(message)) {
        setManual(true);
        setEndpoint("https://reimagined-octo-meme.cgr28.workers.dev/inbound/resend");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-white">Connect your inbox</h2>
      <p className="mt-1 text-sm text-white/70">
        Step 1: connect Resend so emails can arrive here. Step 2: in GoDaddy email, forward a copy of all
        bookings@ mail to your Resend receiving address. Your GoDaddy mailbox keeps everything as normal.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void connect({})}
        className="mt-3 min-h-11 rounded-xl bg-emerald px-4 text-sm font-semibold text-navy disabled:opacity-60"
      >
        {busy ? "Connecting…" : "Connect automatically"}
      </button>
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      {manual ? (
        <div className="mt-4 space-y-2 text-sm text-white/75">
          <p>
            In Resend → Webhooks, add <span className="break-all font-mono text-white">{endpoint}</span> with the
            event <span className="font-mono text-white">email.received</span>, then paste the signing secret:
          </p>
          <input
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="whsec_…"
            className="min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 font-mono text-sm text-white"
          />
          <button
            type="button"
            disabled={busy || !secret.trim()}
            onClick={() => void connect({ secret: secret.trim() })}
            className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save secret
          </button>
        </div>
      ) : null}
    </section>
  );
}

function MessageBubble({ message }: { message: InboxMessage }) {
  const [original, setOriginal] = useState(false);
  const mine = message.direction === "out";
  return (
    <li className={`rounded-2xl border p-3 sm:p-4 ${mine ? "border-emerald/25 bg-emerald/10" : "border-white/10 bg-white/[0.04]"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-white/55">
        <span className="font-semibold text-white/85">
          {mine ? "You" : message.counterpartName || message.counterpartEmail}
        </span>
        <span>{fullWhen(message.at)}</span>
      </div>
      {original && message.html ? (
        <iframe
          title="Original email"
          sandbox=""
          srcDoc={message.html}
          className="mt-2 h-96 w-full rounded-lg bg-white"
        />
      ) : (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/90">{message.text}</p>
      )}
      {message.attachments?.length ? (
        <p className="mt-2 text-xs text-white/55">
          📎 {message.attachments.map((a) => a.filename).join(", ")} — open in your GoDaddy mail to download
        </p>
      ) : null}
      {message.html ? (
        <button type="button" onClick={() => setOriginal((v) => !v)} className="mt-2 min-h-9 text-xs text-emerald">
          {original ? "Show plain text" : "Show original email"}
        </button>
      ) : null}
    </li>
  );
}

function ThreadView({
  ownerKey,
  thread,
  onBack,
  onChanged,
}: {
  ownerKey: string;
  thread: InboxThreadSummary;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<InboxThreadResponse | null>(null);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setData(
        await ownerInboxFetch<InboxThreadResponse>(
          ownerKey,
          `/owner/inbox/thread?key=${encodeURIComponent(thread.threadKey)}`,
        ),
      );
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the conversation");
    }
    // onChanged refreshes unread counts; it is stable enough for this panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, thread.threadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await ownerInboxFetch(ownerKey, "/owner/inbox/reply", {
        threadKey: thread.threadKey,
        message: reply,
        ...(bookingRef ? { paymentReference: bookingRef } : {}),
      });
      setReply("");
      setNotice("Sent.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  async function archive(archived: boolean) {
    await ownerInboxFetch(ownerKey, "/owner/inbox/archive", { threadKey: thread.threadKey, archived }).catch(() => undefined);
    onChanged();
    onBack();
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm text-white">
          ← Inbox
        </button>
        <button
          type="button"
          onClick={() => void archive(!thread.archived)}
          className="min-h-11 rounded-xl border border-white/15 px-4 text-sm text-white/80"
        >
          {thread.archived ? "Move to inbox" : "Archive"}
        </button>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-white">{thread.subject}</h2>
        <p className="break-all text-sm text-white/60">
          {thread.counterpartName ? `${thread.counterpartName} · ` : ""}
          {thread.counterpartEmail}
        </p>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!data ? (
        <p className="text-sm text-white/60">Loading…</p>
      ) : (
        <ul className="space-y-3">
          {data.messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </ul>
      )}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:p-4">
        <label className="block text-sm text-white/80">
          Reply
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={6}
            placeholder="Write your reply. Your signature with the logo is added automatically."
            className="mt-1 w-full rounded-xl border border-white/15 bg-navy px-3 py-2 text-base text-white placeholder:text-white/35"
          />
        </label>
        {data?.bookings.length ? (
          <label className="mt-3 block text-sm text-white/80">
            Include booking details
            <select
              value={bookingRef}
              onChange={(e) => setBookingRef(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            >
              <option value="">Don&apos;t include</option>
              {data.bookings.map((b) => (
                <option key={b.paymentReference} value={b.paymentReference}>
                  {b.reference} · {b.tripDate} {b.tripTime} · {b.route}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {notice ? <p className="mt-2 text-sm text-emerald">{notice}</p> : null}
        <button
          type="button"
          disabled={busy || !reply.trim()}
          onClick={() => void send()}
          className="mt-3 min-h-12 w-full rounded-xl bg-emerald px-4 text-sm font-semibold text-navy disabled:opacity-50 sm:w-auto"
        >
          {busy ? "Sending…" : "Send reply"}
        </button>
      </div>
    </section>
  );
}

export default function OwnerInboxPanel({ ownerKey }: { ownerKey: string }) {
  const [data, setData] = useState<InboxListResponse | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<InboxThreadSummary | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await ownerInboxFetch<InboxListResponse>(ownerKey, "/owner/inbox"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the inbox");
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (open) {
    return <ThreadView ownerKey={ownerKey} thread={open} onBack={() => setOpen(null)} onChanged={() => void load()} />;
  }

  const threads = (data?.threads ?? []).filter((t) => (showArchived ? t.archived : !t.archived));
  const unread = (data?.threads ?? []).filter((t) => !t.archived).reduce((n, t) => n + t.unread, 0);

  return (
    <div className="space-y-4">
      {data && !data.connected ? <SetupCard ownerKey={ownerKey} onDone={() => void load()} /> : null}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Inbox</h2>
            <p className="text-sm text-white/60">
              {data ? `${unread} unread · bookings@myairporttaxini.co.uk` : "Loading…"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="min-h-11 rounded-xl border border-white/15 px-4 text-sm text-white/80"
            >
              {showArchived ? "Inbox" : "Archived"}
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
        {data && !threads.length ? (
          <p className="mt-4 text-sm text-white/60">
            {showArchived ? "Nothing archived." : data.connected ? "No emails yet." : "Connect the inbox to see emails here."}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-white/10">
            {threads.map((t) => (
              <li key={t.threadKey}>
                <button
                  type="button"
                  onClick={() => setOpen(t)}
                  className="flex w-full min-h-14 items-start justify-between gap-3 py-3 text-left"
                >
                  <div className="min-w-0">
                    <p className={`truncate text-sm ${t.unread ? "font-bold text-white" : "font-medium text-white/85"}`}>
                      {t.counterpartName || t.counterpartEmail}
                      {t.count > 1 ? <span className="ml-1 font-normal text-white/45">({t.count})</span> : null}
                    </p>
                    <p className={`truncate text-sm ${t.unread ? "text-white" : "text-white/70"}`}>
                      {t.bookingRef ? (
                        <span className="mr-1.5 rounded bg-emerald/15 px-1.5 py-0.5 text-xs font-semibold text-emerald">{t.bookingRef}</span>
                      ) : null}
                      {t.subject}
                    </p>
                    <p className="truncate text-xs text-white/50">
                      {t.lastDirection === "out" ? "You: " : ""}
                      {t.lastSnippet}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-white/50">{when(t.lastAt)}</span>
                    {t.unread ? <span className="h-2.5 w-2.5 rounded-full bg-emerald" aria-label="Unread" /> : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
