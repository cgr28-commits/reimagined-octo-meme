"use client";

/**
 * Owner dashboard: what WhatsApp customers asked the quote assistant and what it replied.
 * The owner can reply from here — it goes from the assistant's number, in the same chat.
 * Kept 30 days. The owner is also emailed each chat once it goes quiet.
 */
import { useCallback, useEffect, useState } from "react";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";

const WORKER_BASE = resolveWorkerBaseUrl();

type ChatSummary = {
  phone: string;
  name?: string;
  updatedAt: string;
  lastText: string;
  lastFrom: "customer" | "assistant" | "team";
};

type ChatEntry = { at: string; from: "customer" | "assistant" | "team"; text: string; failed?: boolean };
type ChatRecord = { phone: string; name?: string; messages: ChatEntry[] };

async function ownerGet<T>(ownerKey: string, query = ""): Promise<T> {
  const response = await fetch(`${WORKER_BASE}/owner/whatsapp-chats${query}`, {
    headers: { Accept: "application/json", "X-Owner-Key": ownerKey.trim() },
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error || "Could not load WhatsApp chats");
  return payload;
}

async function ownerPost(ownerKey: string, body: Record<string, unknown>): Promise<{ assistantPaused: boolean }> {
  const response = await fetch(`${WORKER_BASE}/owner/whatsapp-chats/reply`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Owner-Key": ownerKey.trim() },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { assistantPaused?: boolean; error?: string } | null;
  if (!response.ok || !payload) throw new Error(payload?.error || "Could not send");
  return { assistantPaused: payload.assistantPaused === true };
}

/** WhatsApp only delivers normal replies within 24 hours of the customer's last message. */
function replyWindowOpen(chat: ChatRecord): boolean {
  const last = [...chat.messages].reverse().find((m) => m.from === "customer");
  return Boolean(last) && Date.now() - Date.parse(last!.at) < 24 * 60 * 60 * 1000;
}

function who(entry: ChatEntry, name?: string): string {
  return entry.from === "customer" ? name || "Customer" : entry.from === "team" ? "You" : "Assistant";
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OwnerWhatsAppChatsPanel({ ownerKey }: { ownerKey: string }) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [openPhone, setOpenPhone] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatRecord | null>(null);
  const [assistantPaused, setAssistantPaused] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await ownerGet<{ chats: ChatSummary[] }>(ownerKey);
      setChats(result.chats ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load WhatsApp chats");
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(phone: string) {
    if (openPhone === phone) {
      setOpenPhone(null);
      setChat(null);
      return;
    }
    setOpenPhone(phone);
    setChat(null);
    setDraft("");
    setReplyError("");
    await loadChat(phone);
  }

  async function loadChat(phone: string) {
    try {
      const result = await ownerGet<{ chat: ChatRecord; assistantPaused?: boolean }>(
        ownerKey,
        `?phone=${encodeURIComponent(phone)}`,
      );
      setChat(result.chat);
      setAssistantPaused(result.assistantPaused === true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this chat");
    }
  }

  async function sendReply(phone: string) {
    if (!draft.trim()) return;
    setSending(true);
    setReplyError("");
    try {
      const result = await ownerPost(ownerKey, { phone, text: draft });
      setDraft("");
      setAssistantPaused(result.assistantPaused);
      await loadChat(phone);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  async function handBack(phone: string) {
    setReplyError("");
    try {
      await ownerPost(ownerKey, { phone, action: "resume" });
      setAssistantPaused(false);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "Could not update");
    }
  }

  return (
    <section className="space-y-3" data-owner-whatsapp-chats>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">WhatsApp chats</h2>
          <p className="text-xs text-white/60">
            What customers asked the quote assistant and what it replied (last 30 days).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-10 rounded-xl border border-white/20 px-3 text-sm font-semibold text-white"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p> : null}
      {loading ? <p className="text-sm text-white/60">Loading…</p> : null}
      {!loading && !chats.length && !error ? (
        <p className="text-sm text-white/60">No WhatsApp chats yet.</p>
      ) : null}

      <ul className="space-y-2">
        {chats.map((c) => (
          <li key={c.phone} className="rounded-xl border border-white/10 bg-navy-dark/60">
            <button
              type="button"
              onClick={() => void open(c.phone)}
              aria-expanded={openPhone === c.phone}
              className="flex w-full min-w-0 items-start justify-between gap-3 px-3 py-3 text-left"
            >
              <span className="min-w-0">
                <span className="block font-semibold text-white">{c.name || `+${c.phone}`}</span>
                <span className="block truncate text-xs text-white/60">
                  {c.lastFrom === "assistant" ? "Assistant: " : c.lastFrom === "team" ? "You: " : ""}
                  {c.lastText}
                </span>
              </span>
              <span className="shrink-0 text-xs text-white/50">{when(c.updatedAt)}</span>
            </button>

            {openPhone === c.phone ? (
              <div className="space-y-2 border-t border-white/10 px-3 py-3">
                <p className="text-sm font-semibold text-white/80">+{c.phone}</p>
                {!chat ? <p className="text-sm text-white/60">Loading chat…</p> : null}
                {chat?.messages.map((m, i) => (
                  <div
                    key={`${m.at}-${i}`}
                    className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm ${
                      m.from === "customer"
                        ? "bg-white/10 text-white"
                        : m.from === "team"
                          ? "ml-auto bg-sky-500/20 text-white"
                          : "ml-auto bg-emerald/15 text-white"
                    }`}
                  >
                    <span className="mb-0.5 block text-[0.7rem] font-semibold uppercase tracking-wide text-white/50">
                      {who(m, c.name)} · {when(m.at)}
                      {m.failed ? " · not delivered" : ""}
                    </span>
                    {m.text}
                  </div>
                ))}
                {chat ? (
                  <div className="space-y-2 border-t border-white/10 pt-3" data-owner-whatsapp-reply>
                    {assistantPaused ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                        <span>The assistant is paused for this customer while you reply.</span>
                        <button
                          type="button"
                          onClick={() => void handBack(c.phone)}
                          className="min-h-9 rounded-lg border border-amber-200/40 px-3 font-semibold"
                        >
                          Hand back to assistant
                        </button>
                      </div>
                    ) : null}
                    {replyWindowOpen(chat) ? (
                      <>
                        <textarea
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          rows={3}
                          placeholder="Reply from your WhatsApp business number…"
                          className="w-full rounded-xl border border-white/15 bg-navy px-3 py-2 text-base text-white"
                        />
                        <button
                          type="button"
                          disabled={sending || !draft.trim()}
                          onClick={() => void sendReply(c.phone)}
                          className="min-h-11 w-full rounded-xl bg-emerald px-4 text-sm font-bold text-navy disabled:opacity-50"
                        >
                          {sending ? "Sending…" : "Send reply"}
                        </button>
                        <p className="text-xs text-white/50">
                          Sent from the assistant&apos;s number in the same chat. The assistant stays quiet for this
                          customer until you hand it back (or 12 hours).
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-white/60">
                        It&apos;s more than 24 hours since this customer last messaged, so WhatsApp won&apos;t deliver a
                        reply from the business number.{" "}
                        <a
                          href={`https://wa.me/${c.phone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-emerald underline-offset-2 hover:underline"
                        >
                          Message them from your own WhatsApp
                        </a>
                        .
                      </p>
                    )}
                    {replyError ? (
                      <p className="rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">{replyError}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
