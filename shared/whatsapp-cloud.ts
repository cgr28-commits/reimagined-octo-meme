/**
 * WhatsApp Business Platform (Cloud API) helpers — webhook parsing, signature
 * verification and outbound text messages.
 *
 * Designed for Coexistence: the business keeps its existing number in the
 * WhatsApp Business app while the Worker also receives and sends via the API.
 * Messages the owner sends from the app arrive as `smb_message_echoes`.
 */

export const WHATSAPP_DEFAULT_GRAPH_VERSION = "v23.0";

export type WhatsAppCloudEnv = {
  /** Permanent System User access token (Worker secret). */
  WHATSAPP_ACCESS_TOKEN?: string;
  /** Phone number ID from WhatsApp Manager → API Setup (not the phone number). */
  WHATSAPP_PHONE_NUMBER_ID?: string;
  /** Meta App secret — verifies X-Hub-Signature-256 on webhook POSTs (Worker secret). */
  WHATSAPP_APP_SECRET?: string;
  /** Any random string; must match the Verify Token entered in the Meta App webhook settings. */
  WHATSAPP_VERIFY_TOKEN?: string;
  /** Optional Graph API version override, e.g. "v23.0". */
  WHATSAPP_GRAPH_VERSION?: string;
};

export type WhatsAppInboundMessage = {
  id: string;
  /** Customer number, digits only in international format (e.g. 447700900123). */
  from: string;
  profileName?: string;
  /** Unix seconds as sent by Meta. */
  timestamp: number;
  type: string;
  /** Text body (or button / list reply title). Empty for media and other types. */
  text: string;
};

export type WhatsAppOwnerEcho = {
  id: string;
  /** Customer number the owner messaged from the WhatsApp Business app. */
  to: string;
  timestamp: number;
};

export type ParsedWhatsAppWebhook = {
  messages: WhatsAppInboundMessage[];
  echoes: WhatsAppOwnerEcho[];
};

export function whatsAppCloudConfigured(env: WhatsAppCloudEnv): boolean {
  return Boolean(
    env.WHATSAPP_ACCESS_TOKEN?.trim() &&
      env.WHATSAPP_PHONE_NUMBER_ID?.trim() &&
      env.WHATSAPP_APP_SECRET?.trim() &&
      env.WHATSAPP_VERIFY_TOKEN?.trim(),
  );
}

/** Digits only, international format without "+" — the form Meta uses for wa_id. */
export function normalizeWhatsAppNumber(value: string): string {
  return String(value ?? "").replace(/\D/g, "");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify Meta's `X-Hub-Signature-256: sha256=<hex>` header over the raw request body. */
export async function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  const header = signatureHeader?.trim() ?? "";
  if (!header.startsWith("sha256=") || !appSecret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqualHex(header.slice("sha256=".length).toLowerCase(), expected);
}

/**
 * GET webhook verification handshake. Returns the challenge to echo back, or null
 * when the mode / token do not match.
 */
export function whatsAppVerifyChallenge(url: URL, verifyToken: string): string | null {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge");
  if (mode !== "subscribe" || !challenge || !verifyToken) return null;
  if (!timingSafeEqualHex(token, verifyToken)) return null;
  return challenge;
}

type RawMessage = {
  id?: string;
  from?: string;
  to?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
};

function messageText(message: RawMessage): string {
  if (message.type === "text") return message.text?.body ?? "";
  if (message.type === "button") return message.button?.text ?? "";
  if (message.type === "interactive") {
    return (
      message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? ""
    );
  }
  return "";
}

/** Extract inbound customer messages and owner app echoes from a webhook payload. */
export function parseWhatsAppWebhook(payload: unknown): ParsedWhatsAppWebhook {
  const out: ParsedWhatsAppWebhook = { messages: [], echoes: [] };
  const body = payload as {
    object?: string;
    entry?: Array<{
      changes?: Array<{
        field?: string;
        value?: {
          contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
          messages?: RawMessage[];
          message_echoes?: RawMessage[];
        };
      }>;
    }>;
  };
  if (body?.object !== "whatsapp_business_account" || !Array.isArray(body.entry)) return out;

  for (const entry of body.entry) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      if (change.field === "messages") {
        const names = new Map<string, string>();
        for (const contact of value.contacts ?? []) {
          if (contact.wa_id && contact.profile?.name) names.set(contact.wa_id, contact.profile.name);
        }
        for (const message of value.messages ?? []) {
          const from = normalizeWhatsAppNumber(message.from ?? "");
          if (!message.id || !from) continue;
          out.messages.push({
            id: message.id,
            from,
            profileName: names.get(message.from ?? ""),
            timestamp: Number(message.timestamp) || 0,
            type: message.type ?? "unknown",
            text: messageText(message).trim(),
          });
        }
      }

      if (change.field === "smb_message_echoes") {
        for (const echo of value.message_echoes ?? []) {
          const to = normalizeWhatsAppNumber(echo.to ?? "");
          if (!echo.id || !to) continue;
          out.echoes.push({ id: echo.id, to, timestamp: Number(echo.timestamp) || 0 });
        }
      }
    }
  }
  return out;
}

export type WhatsAppSendResult = { sent: boolean; messageId?: string; error?: string };

/**
 * Send a free-form text reply. Only valid inside the 24-hour customer service
 * window (i.e. replying to a customer who messaged first) — which is how the
 * quote assistant uses it.
 */
export async function sendWhatsAppText(
  env: WhatsAppCloudEnv,
  to: string,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WhatsAppSendResult> {
  const token = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) return { sent: false, error: "WhatsApp Cloud API not configured" };
  const version = env.WHATSAPP_GRAPH_VERSION?.trim() || WHATSAPP_DEFAULT_GRAPH_VERSION;

  try {
    const res = await fetchImpl(
      `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: normalizeWhatsAppNumber(to),
          type: "text",
          text: { preview_url: true, body: body.slice(0, 4096) },
        }),
      },
    );
    const data = (await res.json().catch(() => null)) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number };
    } | null;
    if (!res.ok) {
      return {
        sent: false,
        error: data?.error?.message
          ? `${data.error.message}${data.error.code ? ` (code ${data.error.code})` : ""}`
          : `HTTP ${res.status}`,
      };
    }
    return { sent: true, messageId: data?.messages?.[0]?.id };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "WhatsApp send failed" };
  }
}
