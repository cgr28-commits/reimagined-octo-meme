"use client";

/**
 * Owner dashboard: what WhatsApp customers asked the quote assistant and what it replied.
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
  lastFrom: "customer" | "assistant";
};

type ChatEntry = { at: string; from: "customer" | "assistant"; text: string; failed?: boolean };
type ChatRecord = { phone: string; name?: string; messages: ChatEntry[] };

async function ownerGet<T>(ownerKey: string, query = ""): Promise<T> {
  const response = await fetch(`${WORKER_BASE}/owner/whatsapp-chats${query}`, {
    headers: { Accept: "application/json", "X-Owner-Key": ownerKey.trim() },
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error || "Could not load WhatsApp chats");
  return payload;
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
    try {
      const result = await ownerGet<{ chat: ChatRecord }>(ownerKey, `?phone=${encodeURIComponent(phone)}`);
      setChat(result.chat);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this chat");
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
                  {c.lastFrom === "assistant" ? "Assistant: " : ""}
                  {c.lastText}
                </span>
              </span>
              <span className="shrink-0 text-xs text-white/50">{when(c.updatedAt)}</span>
            </button>

            {openPhone === c.phone ? (
              <div className="space-y-2 border-t border-white/10 px-3 py-3">
                <a
                  href={`https://wa.me/${c.phone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm font-semibold text-emerald underline-offset-2 hover:underline"
                >
                  +{c.phone} · reply on WhatsApp
                </a>
                {!chat ? <p className="text-sm text-white/60">Loading chat…</p> : null}
                {chat?.messages.map((m, i) => (
                  <div
                    key={`${m.at}-${i}`}
                    className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm ${
                      m.from === "customer"
                        ? "bg-white/10 text-white"
                        : "ml-auto bg-emerald/15 text-white"
                    }`}
                  >
                    <span className="mb-0.5 block text-[0.7rem] font-semibold uppercase tracking-wide text-white/50">
                      {m.from === "customer" ? c.name || "Customer" : "Assistant"} · {when(m.at)}
                      {m.failed ? " · not delivered" : ""}
                    </span>
                    {m.text}
                  </div>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
