/**
 * WhatsApp assistant transcript for the owner dashboard: what customers sent and
 * what the assistant replied. Kept 30 days, last 60 messages per customer.
 * Never affects replies — every write is best-effort.
 */

export type WhatsAppChatEntry = {
  at: string;
  from: "customer" | "assistant";
  text: string;
  /** Reply was not delivered (e.g. Meta rejected it). */
  failed?: boolean;
};

export type WhatsAppChatRecord = {
  phone: string;
  name?: string;
  updatedAt: string;
  /** When the owner was last emailed this chat's transcript. */
  emailedAt?: string;
  messages: WhatsAppChatEntry[];
};

export type WhatsAppChatSummary = {
  phone: string;
  name?: string;
  updatedAt: string;
  lastText: string;
  lastFrom: WhatsAppChatEntry["from"];
  emailedAt?: string;
};

const CHAT_PREFIX = "whatsapp:chat:";
const CHAT_TTL_SECONDS = 60 * 60 * 24 * 30;
const MAX_MESSAGES = 60;
const MAX_TEXT = 2000;

const chatKey = (phone: string) => `${CHAT_PREFIX}${phone}`;

export async function appendWhatsAppChat(
  store: KVNamespace | undefined,
  phone: string,
  entry: Omit<WhatsAppChatEntry, "at" | "text"> & { text: string },
  name?: string,
): Promise<void> {
  if (!store || !phone) return;
  try {
    const at = new Date().toISOString();
    const current = await store.get<WhatsAppChatRecord>(chatKey(phone), "json");
    const messages = [...(current?.messages ?? []), { ...entry, at, text: entry.text.slice(0, MAX_TEXT) }].slice(
      -MAX_MESSAGES,
    );
    await saveChat(store, {
      phone,
      name: name?.trim() || current?.name,
      updatedAt: at,
      emailedAt: current?.emailedAt,
      messages,
    });
  } catch {
    // Transcript is for the owner only; never block a reply on it.
  }
}

async function saveChat(store: KVNamespace, record: WhatsAppChatRecord): Promise<void> {
  const last = record.messages[record.messages.length - 1];
  const summary: WhatsAppChatSummary = {
    phone: record.phone,
    name: record.name,
    updatedAt: record.updatedAt,
    lastText: (last?.text ?? "").slice(0, 160),
    lastFrom: last?.from ?? "customer",
    emailedAt: record.emailedAt,
  };
  await store.put(chatKey(record.phone), JSON.stringify(record), {
    expirationTtl: CHAT_TTL_SECONDS,
    metadata: summary,
  });
}

/** A chat counts as finished after this long with no new messages. */
export const WHATSAPP_CHAT_IDLE_MS = 30 * 60 * 1000;

/** Finished chats with messages the owner has not been emailed yet. */
export function isWhatsAppChatDueForEmail(summary: WhatsAppChatSummary, now: Date): boolean {
  const updated = Date.parse(summary.updatedAt);
  if (!Number.isFinite(updated) || now.getTime() - updated < WHATSAPP_CHAT_IDLE_MS) return false;
  return !summary.emailedAt || summary.emailedAt < summary.updatedAt;
}

export function formatWhatsAppChatTranscript(record: WhatsAppChatRecord, sinceIso?: string): string {
  const london = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" });
  return record.messages
    .filter((m) => !sinceIso || m.at > sinceIso)
    .map((m) => {
      const who = m.from === "customer" ? record.name || "Customer" : "Assistant";
      return `[${london(m.at)}] ${who}${m.failed ? " (NOT DELIVERED)" : ""}:\n${m.text}`;
    })
    .join("\n\n");
}

export async function markWhatsAppChatEmailed(
  store: KVNamespace,
  record: WhatsAppChatRecord,
  at: string,
): Promise<void> {
  await saveChat(store, { ...record, emailedAt: at });
}

/** Most recent first, from KV list metadata (no per-chat reads). */
export async function listWhatsAppChats(store: KVNamespace, limit = 100): Promise<WhatsAppChatSummary[]> {
  const summaries: WhatsAppChatSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.list<WhatsAppChatSummary>({ prefix: CHAT_PREFIX, cursor, limit: 1000 });
    for (const key of page.keys) {
      if (key.metadata?.updatedAt) summaries.push(key.metadata);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

export async function getWhatsAppChat(store: KVNamespace, phone: string): Promise<WhatsAppChatRecord | null> {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return store.get<WhatsAppChatRecord>(chatKey(digits), "json");
}
