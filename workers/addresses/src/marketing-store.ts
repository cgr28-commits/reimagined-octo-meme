import {
  MARKETING_CONSENT_VERSION,
  type MarketingOptInSource,
  type MarketingSubscriber,
} from "../shared/marketing";

const SUBSCRIBER_PREFIX = "marketing:sub:";
const INDEX_KEY = "marketing:index";
const UNSUB_TOKEN_PREFIX = "marketing:unsub:";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function subscriberKey(email: string): string {
  return `${SUBSCRIBER_PREFIX}${normalizeEmail(email)}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function marketingStoreConfigured(store?: KVNamespace): store is KVNamespace {
  return Boolean(store);
}

export async function recordMarketingOptIn(
  store: KVNamespace,
  input: {
    email: string;
    name?: string;
    source: MarketingOptInSource;
    consentVersion?: string;
    optedInAt?: string;
  },
): Promise<MarketingSubscriber | null> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    return null;
  }

  const now = input.optedInAt?.trim() || new Date().toISOString();
  const consentVersion = input.consentVersion?.trim() || MARKETING_CONSENT_VERSION;
  const key = subscriberKey(email);
  const existing = await store.get<MarketingSubscriber>(key, "json");

  const record: MarketingSubscriber = {
    email,
    name: input.name?.trim() || existing?.name,
    optedInAt: existing?.unsubscribedAt ? now : existing?.optedInAt || now,
    source: input.source,
    consentVersion,
    unsubscribedAt: undefined,
    unsubscribeToken: existing?.unsubscribeToken,
  };

  await store.put(key, JSON.stringify(record));

  const index = await store.get<string[]>(INDEX_KEY, "json");
  const emails = Array.isArray(index) ? index : [];
  if (!emails.includes(email)) {
    emails.push(email);
    await store.put(INDEX_KEY, JSON.stringify(emails));
  }

  return record;
}

export async function unsubscribeMarketingEmail(
  store: KVNamespace,
  emailInput: string,
): Promise<{ ok: boolean; reason?: "invalid_email" | "not_found" }> {
  const email = normalizeEmail(emailInput);
  if (!isValidEmail(email)) {
    return { ok: false, reason: "invalid_email" };
  }

  const key = subscriberKey(email);
  const existing = await store.get<MarketingSubscriber>(key, "json");
  if (!existing || existing.unsubscribedAt) {
    return { ok: false, reason: "not_found" };
  }

  const record: MarketingSubscriber = {
    ...existing,
    unsubscribedAt: new Date().toISOString(),
  };

  await store.put(key, JSON.stringify(record));
  return { ok: true };
}

/** Everyone on the list (subscribed and unsubscribed), newest opt-in first. */
export async function listMarketingSubscribers(store: KVNamespace): Promise<MarketingSubscriber[]> {
  const index = await store.get<string[]>(INDEX_KEY, "json");
  const emails = Array.isArray(index) ? index : [];
  const out: MarketingSubscriber[] = [];
  for (let i = 0; i < emails.length; i += 25) {
    const batch = await Promise.all(
      emails.slice(i, i + 25).map((email) => store.get<MarketingSubscriber>(subscriberKey(email), "json")),
    );
    for (const record of batch) if (record?.email) out.push(record);
  }
  return out.sort((a, b) => (b.optedInAt || "").localeCompare(a.optedInAt || ""));
}

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The subscriber's one-click unsubscribe token (created on first use). */
export async function ensureMarketingUnsubscribeToken(
  store: KVNamespace,
  subscriber: MarketingSubscriber,
): Promise<string> {
  if (subscriber.unsubscribeToken) return subscriber.unsubscribeToken;
  const token = randomToken();
  const record: MarketingSubscriber = { ...subscriber, unsubscribeToken: token };
  await store.put(subscriberKey(subscriber.email), JSON.stringify(record));
  await store.put(`${UNSUB_TOKEN_PREFIX}${token}`, subscriber.email);
  return token;
}

/** One-click unsubscribe from an email link. */
export async function unsubscribeMarketingToken(store: KVNamespace, tokenInput: string): Promise<boolean> {
  const token = tokenInput.trim().toLowerCase().replace(/[^a-f0-9]/g, "");
  if (token.length < 20) return false;
  const email = await store.get(`${UNSUB_TOKEN_PREFIX}${token}`);
  if (!email) return false;
  await unsubscribeMarketingEmail(store, email);
  return true;
}
