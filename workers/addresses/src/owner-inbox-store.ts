/**
 * KV storage for the owner inbox.
 *   inbox:msg:<id>      → InboxMessage
 *   inbox:index         → message ids, newest first (capped)
 *   inbox:webhook       → { id, secret, createdAt } Resend receiving webhook
 *   inbox:seen:<id>     → dedupe marker for webhook retries
 */
import type { InboxMessage } from "../shared/owner-inbox";

const MESSAGE_TTL = 60 * 60 * 24 * 400;
const INDEX_KEY = "inbox:index";
const INDEX_CAP = 1000;
export const INBOX_WEBHOOK_KEY = "inbox:webhook";

export type InboxWebhookConfig = { id?: string; secret: string; createdAt: string; source: "api" | "manual" };

export async function saveInboxMessage(store: KVNamespace, message: InboxMessage): Promise<void> {
  await store.put(`inbox:msg:${message.id}`, JSON.stringify(message), { expirationTtl: MESSAGE_TTL });
  const existing = await store.get<string[]>(INDEX_KEY, "json");
  const ids = Array.isArray(existing) ? existing.filter((id) => id !== message.id) : [];
  ids.unshift(message.id);
  await store.put(INDEX_KEY, JSON.stringify(ids.slice(0, INDEX_CAP)));
}

export async function getInboxMessage(store: KVNamespace, id: string): Promise<InboxMessage | null> {
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(id)) return null;
  return store.get<InboxMessage>(`inbox:msg:${id}`, "json");
}

export async function updateInboxMessage(
  store: KVNamespace,
  id: string,
  patch: Partial<Pick<InboxMessage, "read" | "archived">>,
): Promise<InboxMessage | null> {
  const message = await getInboxMessage(store, id);
  if (!message) return null;
  const next = { ...message, ...patch };
  await store.put(`inbox:msg:${id}`, JSON.stringify(next), { expirationTtl: MESSAGE_TTL });
  return next;
}

/** Most recent messages (newest first). */
export async function listInboxMessages(store: KVNamespace, limit = 300): Promise<InboxMessage[]> {
  const ids = (await store.get<string[]>(INDEX_KEY, "json")) ?? [];
  const out: InboxMessage[] = [];
  for (const id of ids.slice(0, limit)) {
    const message = await getInboxMessage(store, id);
    if (message) out.push(message);
  }
  return out;
}

export async function markWebhookEventSeen(store: KVNamespace, eventId: string): Promise<boolean> {
  const key = `inbox:seen:${eventId}`;
  if (await store.get(key)) return false;
  await store.put(key, "1", { expirationTtl: 60 * 60 * 24 * 7 });
  return true;
}

export async function getInboxWebhookConfig(store: KVNamespace): Promise<InboxWebhookConfig | null> {
  return store.get<InboxWebhookConfig>(INBOX_WEBHOOK_KEY, "json");
}

export async function saveInboxWebhookConfig(store: KVNamespace, config: InboxWebhookConfig): Promise<void> {
  await store.put(INBOX_WEBHOOK_KEY, JSON.stringify(config));
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Svix-style signature check used by Resend webhooks:
 * HMAC-SHA256(base64decode(secret without "whsec_"), `${id}.${timestamp}.${body}`), header "v1,<b64> v1,<b64>".
 * Rejects timestamps more than 5 minutes off.
 */
export async function verifyResendWebhookSignature(input: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signatureHeader: string | null;
  body: string;
  nowSeconds?: number;
}): Promise<boolean> {
  const { id, timestamp, signatureHeader } = input;
  if (!id || !timestamp || !signatureHeader || !input.secret) return false;
  const ts = Number(timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 5 * 60) return false;
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = base64ToBytes(input.secret.replace(/^whsec_/, ""));
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = bytesToBase64(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${input.body}`)),
  );
  return signatureHeader
    .split(" ")
    .map((part) => part.trim())
    .some((part) => {
      const [version, sig] = part.split(",");
      return version === "v1" && sig === expected;
    });
}

export async function signResendWebhookForTest(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(secret.replace(/^whsec_/, "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `v1,${bytesToBase64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)))}`;
}
