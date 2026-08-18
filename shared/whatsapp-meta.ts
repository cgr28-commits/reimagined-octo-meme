/**
 * Meta WhatsApp Cloud API helpers — webhook verify + signature check.
 * Tokens stay in Worker env only (never NEXT_PUBLIC_*).
 */

export type MetaWhatsAppTextMessage = {
  messageId: string;
  fromWaId: string;
  timestamp: string;
  text: string;
};

export type MetaWebhookParseResult =
  | { ok: true; messages: MetaWhatsAppTextMessage[] }
  | { ok: false; reason: string };

/** Timing-safe hex compare for HMAC signatures. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left.length !== right.length || left.length === 0) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function verifyMetaWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  const secret = appSecret.trim();
  if (!secret) {
    return false;
  }
  const header = (signatureHeader ?? "").trim();
  const match = header.match(/^sha256=(.+)$/i);
  if (!match?.[1]) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const digest = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqualHex(digest, match[1]);
}

export function parseMetaWhatsAppWebhook(payload: unknown): MetaWebhookParseResult {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "invalid_payload" };
  }
  const root = payload as {
    object?: string;
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            id?: string;
            from?: string;
            timestamp?: string;
            type?: string;
            text?: { body?: string };
          }>;
          contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        };
      }>;
    }>;
  };

  if (root.object !== "whatsapp_business_account") {
    return { ok: false, reason: "not_whatsapp" };
  }

  const messages: MetaWhatsAppTextMessage[] = [];
  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (message.type && message.type !== "text") {
          continue;
        }
        const text = message.text?.body?.trim() ?? "";
        const from = message.from?.trim() ?? "";
        const id = message.id?.trim() ?? "";
        if (!text || !from || !id) continue;
        messages.push({
          messageId: id,
          fromWaId: from,
          timestamp: message.timestamp ?? "",
          text,
        });
      }
    }
  }

  return { ok: true, messages };
}

export async function sendWhatsAppTextMessage(input: {
  accessToken: string;
  phoneNumberId: string;
  toWaId: string;
  body: string;
}): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const token = input.accessToken.trim();
  const phoneNumberId = input.phoneNumberId.trim();
  if (!token || !phoneNumberId) {
    return { ok: false, error: "WhatsApp Cloud API is not configured" };
  }

  const response = await fetch(
    `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.toWaId,
        type: "text",
        text: { preview_url: true, body: input.body.slice(0, 4096) },
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    return {
      ok: false,
      error: payload?.error?.message || `WhatsApp send failed (${response.status})`,
    };
  }

  return { ok: true, messageId: payload?.messages?.[0]?.id };
}
