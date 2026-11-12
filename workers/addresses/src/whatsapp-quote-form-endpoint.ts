/**
 * The Worker side of the WhatsApp quote form (a WhatsApp Flow), added 12 Nov 2026.
 *
 * - POST /whatsapp/quote-form: WhatsApp's encrypted "data endpoint". Each time the customer
 *   taps a button in the form, WhatsApp sends the screen's answers here (RSA-OAEP + AES-GCM);
 *   we look addresses up on Google and send back the next screen, encrypted.
 * - GET /whatsapp/quote-form/setup: makes sure the encryption key pair exists and that its
 *   public half is registered with WhatsApp (360dialog or Meta). Safe to call repeatedly.
 * - Sending the form to a customer, and reading their submitted form, live in
 *   whatsapp-handlers.ts (sendWhatsAppQuoteForm / applySubmittedQuoteForm).
 *
 * The key pair is made by the Worker on first use and kept in the Worker's KV store, so no
 * one has to copy a private key around. Only its public half ever leaves the Worker.
 */
import { D360_API_BASE, resolveWhatsAppProvider, whatsAppGraphBase } from "../shared/whatsapp-cloud";
import {
  nextQuoteFormScreen,
  type QuoteFormLookup,
  type QuoteFormSession,
} from "../shared/whatsapp-quote-form";
import { findWhatsAppAddressMatches, type WhatsAppEnv } from "./whatsapp-handlers";

const KEYPAIR_KEY = "whatsapp:quote-form:keypair";
export const quoteFormSessionKey = (token: string) => `whatsapp:quote-form:session:${token}`;
export const QUOTE_FORM_SESSION_TTL_SECONDS = 60 * 60 * 24;
/** Re-register the public key at most this often (it only changes if the key pair is replaced). */
const REGISTER_EVERY_MS = 6 * 60 * 60 * 1000;

type StoredKeyPair = {
  /** PKCS#8 private key, base64. */
  privateKey: string;
  /** SPKI public key, PEM. */
  publicKeyPem: string;
  createdAt: string;
  registeredAt?: string;
  registeredWith?: string;
  lastRegisterError?: string;
};

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function pem(label: string, der: ArrayBuffer): string {
  const body = toBase64(der).replace(/(.{64})/g, "$1\n").trim();
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

/** The form's key pair, made (and stored) the first time it's needed. */
export async function getQuoteFormKeyPair(store: KVNamespace): Promise<StoredKeyPair> {
  const existing = await store.get<StoredKeyPair>(KEYPAIR_KEY, "json");
  if (existing?.privateKey && existing.publicKeyPem) return existing;
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  )) as CryptoKeyPair;
  const privateDer = (await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer;
  const publicDer = (await crypto.subtle.exportKey("spki", pair.publicKey)) as ArrayBuffer;
  const stored: StoredKeyPair = {
    privateKey: toBase64(privateDer),
    publicKeyPem: pem("PUBLIC KEY", publicDer),
    createdAt: new Date().toISOString(),
  };
  await store.put(KEYPAIR_KEY, JSON.stringify(stored));
  return stored;
}

/**
 * Register the public key with WhatsApp (needed before the form can be published or opened).
 * 360dialog: POST waba-v2.360dialog.io/whatsapp_business_encryption. Meta: the phone number's
 * whatsapp_business_encryption edge.
 */
export async function registerQuoteFormPublicKey(
  env: WhatsAppEnv,
  store: KVNamespace,
  options: { force?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<{ ok: boolean; provider: string | null; error?: string; registeredAt?: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pair = await getQuoteFormKeyPair(store);
  const provider = resolveWhatsAppProvider(env);
  if (
    !options.force &&
    pair.registeredAt &&
    pair.registeredWith === provider &&
    Date.now() - Date.parse(pair.registeredAt) < REGISTER_EVERY_MS
  ) {
    return { ok: true, provider, registeredAt: pair.registeredAt };
  }
  let res: Response;
  try {
    if (provider === "360dialog") {
      res = await fetchImpl(`${D360_API_BASE}/whatsapp_business_encryption`, {
        method: "POST",
        headers: { "D360-API-KEY": env.D360_API_KEY!.trim(), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ business_public_key: pair.publicKeyPem }).toString(),
      });
    } else if (provider === "meta") {
      res = await fetchImpl(
        `${whatsAppGraphBase(env)}/${env.WHATSAPP_PHONE_NUMBER_ID!.trim()}/whatsapp_business_encryption`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN!.trim()}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ business_public_key: pair.publicKeyPem }).toString(),
        },
      );
    } else {
      return { ok: false, provider, error: "WhatsApp isn't configured" };
    }
  } catch (err) {
    return { ok: false, provider, error: err instanceof Error ? err.message : String(err) };
  }
  const body = await res.text().catch(() => "");
  if (!res.ok) {
    const error = `HTTP ${res.status}: ${body.slice(0, 200)}`;
    await store.put(KEYPAIR_KEY, JSON.stringify({ ...pair, lastRegisterError: error }));
    return { ok: false, provider, error };
  }
  const registeredAt = new Date().toISOString();
  const { lastRegisterError: _e, ...rest } = pair;
  await store.put(KEYPAIR_KEY, JSON.stringify({ ...rest, registeredAt, registeredWith: provider ?? undefined }));
  return { ok: true, provider, registeredAt };
}

/** WhatsApp's request, decrypted, with what's needed to encrypt the answer. */
type DecryptedRequest = {
  body: {
    version?: string;
    action?: string;
    screen?: string;
    data?: Record<string, unknown>;
    flow_token?: string;
  };
  aesKey: CryptoKey;
  iv: Uint8Array<ArrayBuffer>;
};

export async function decryptQuoteFormRequest(
  privateKeyB64: string,
  payload: { encrypted_aes_key?: string; encrypted_flow_data?: string; initial_vector?: string },
): Promise<DecryptedRequest> {
  if (!payload.encrypted_aes_key || !payload.encrypted_flow_data || !payload.initial_vector) {
    throw new Error("missing encrypted fields");
  }
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    fromBase64(privateKeyB64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
  const rawAes = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, fromBase64(payload.encrypted_aes_key));
  const aesKey = await crypto.subtle.importKey("raw", rawAes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const iv = fromBase64(payload.initial_vector);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    aesKey,
    fromBase64(payload.encrypted_flow_data),
  );
  return { body: JSON.parse(new TextDecoder().decode(plain)), aesKey, iv };
}

/** The answer, encrypted with the request's AES key and the bit-flipped IV (WhatsApp's scheme). */
export async function encryptQuoteFormResponse(
  aesKey: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  response: unknown,
): Promise<string> {
  const flipped = new Uint8Array(new ArrayBuffer(iv.length));
  for (let i = 0; i < iv.length; i++) flipped[i] = ~iv[i]! & 0xff;
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: flipped, tagLength: 128 },
    aesKey,
    new TextEncoder().encode(JSON.stringify(response)),
  );
  return toBase64(cipher);
}

/** Address search for the form: Google matches (up to 4, always a choice) with the chat's quota. */
function formLookup(env: WhatsAppEnv, store: KVNamespace, phone: string): QuoteFormLookup {
  return async (typed) => {
    const found = await findWhatsAppAddressMatches(env, store, phone, typed, "A2A", {
      maxOptions: 4,
      alwaysOffer: true,
    });
    return Array.isArray(found) ? found : null;
  };
}

/** What the form endpoint answers for one decrypted request (exported for checks). */
export async function answerQuoteFormRequest(
  env: WhatsAppEnv,
  store: KVNamespace,
  body: DecryptedRequest["body"],
  lookupOverride?: QuoteFormLookup,
): Promise<{ status: number; response: unknown }> {
  // WhatsApp's health check.
  if (body.action === "ping") return { status: 200, response: { data: { status: "active" } } };
  // The form reporting a problem it had with an earlier answer: acknowledge.
  if (body.data && typeof body.data === "object" && "error" in body.data) {
    console.error(JSON.stringify({ event: "whatsapp_quote_form_client_error", error: String(body.data.error) }));
    return { status: 200, response: { data: { acknowledged: true } } };
  }
  const token = String(body.flow_token ?? "");
  const session = token ? await store.get<QuoteFormSession>(quoteFormSessionKey(token), "json") : null;
  // An unknown or expired form: WhatsApp shows "this form has expired" (status 427).
  if (!session) return { status: 427, response: { error: "flow_token not valid" } };
  const screen = body.action === "INIT" ? "INIT" : String(body.screen ?? "");
  const next = await nextQuoteFormScreen(
    session,
    screen,
    body.data ?? {},
    lookupOverride ?? formLookup(env, store, session.phone),
  );
  await store.put(quoteFormSessionKey(token), JSON.stringify(session), {
    expirationTtl: QUOTE_FORM_SESSION_TTL_SECONDS,
  });
  return { status: 200, response: { screen: next.screen, data: next.data } };
}

export function isQuoteFormPath(pathname: string): boolean {
  return pathname === "/whatsapp/quote-form";
}

export function isQuoteFormSetupPath(pathname: string): boolean {
  return pathname === "/whatsapp/quote-form/setup";
}

/** POST /whatsapp/quote-form — WhatsApp's encrypted data endpoint. */
export async function handleQuoteFormRequest(request: Request, env: WhatsAppEnv): Promise<Response> {
  const store = env.TRACKING_STORE;
  if (!store || request.method !== "POST") return new Response("Not found", { status: 404 });
  let payload: { encrypted_aes_key?: string; encrypted_flow_data?: string; initial_vector?: string };
  try {
    payload = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const pair = await getQuoteFormKeyPair(store);
  let decrypted: DecryptedRequest;
  try {
    decrypted = await decryptQuoteFormRequest(pair.privateKey, payload);
  } catch (err) {
    // 421 tells WhatsApp to fetch our public key again and retry.
    console.error(JSON.stringify({ event: "whatsapp_quote_form_decrypt_failed", error: String(err) }));
    return new Response("Decryption failed", { status: 421 });
  }
  let answer: { status: number; response: unknown };
  try {
    answer = await answerQuoteFormRequest(env, store, decrypted.body);
  } catch (err) {
    console.error(JSON.stringify({ event: "whatsapp_quote_form_failed", error: String(err) }));
    answer = { status: 500, response: { error: "Something went wrong" } };
  }
  if (answer.status !== 200) return new Response(JSON.stringify(answer.response), { status: answer.status });
  const encrypted = await encryptQuoteFormResponse(decrypted.aesKey, decrypted.iv, answer.response);
  return new Response(encrypted, { status: 200, headers: { "Content-Type": "text/plain" } });
}

/**
 * GET /whatsapp/quote-form/setup — make sure the key pair exists and is registered.
 * Returns only non-secret facts (the public key is public by design).
 */
export async function handleQuoteFormSetup(request: Request, env: WhatsAppEnv): Promise<Response> {
  const store = env.TRACKING_STORE;
  if (!store) return new Response("Not found", { status: 404 });
  void request;
  const result = await registerQuoteFormPublicKey(env, store);
  const pair = await getQuoteFormKeyPair(store);
  return new Response(
    JSON.stringify(
      {
        ...result,
        publicKey: pair.publicKeyPem,
        keyCreatedAt: pair.createdAt,
        formId: env.WHATSAPP_QUOTE_FORM_ID?.trim() || null,
        formMode: env.WHATSAPP_QUOTE_FORM_MODE?.trim() || "published",
        pilot: env.WHATSAPP_QUOTE_FORM?.trim() || "off",
      },
      null,
      2,
    ),
    { status: result.ok ? 200 : 502, headers: { "Content-Type": "application/json" } },
  );
}
