import {
  MARKETING_CONSENT_VERSION,
  type MarketingOptInSource,
  type MarketingSubscriber,
} from "../shared/marketing";

const SUBSCRIBER_PREFIX = "marketing:sub:";
const INDEX_KEY = "marketing:index";
const UNSUB_TOKEN_PREFIX = "marketing:unsub:";
/** Past customers (not on the opt-in list) who unsubscribed from a customer offer email. */
const OPTOUT_PREFIX = "marketing:optout:";
/** Customer-offer unsubscribe token per email (customers who never opted in). */
const CUSTOMER_TOKEN_PREFIX = "marketing:custtoken:";

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
    consentWording?: string;
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
    ...(input.consentWording?.trim()
      ? { consentWording: input.consentWording.trim() }
      : existing?.consentWording
        ? { consentWording: existing.consentWording }
        : {}),
    unsubscribedAt: undefined,
    unsubscribeToken: existing?.unsubscribeToken,
  };

  await store.put(key, JSON.stringify(record));
  // Opting in again overrides an earlier "no offers" from a customer offer email.
  await store.delete(`${OPTOUT_PREFIX}${email}`);

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
  if (!existing) {
    // Not on the opt-in list (e.g. a past customer who got a thank-you offer): remember the
    // "no offers" so customer-list sends skip them from now on.
    if (await store.get(`${OPTOUT_PREFIX}${email}`)) return { ok: false, reason: "not_found" };
    await store.put(`${OPTOUT_PREFIX}${email}`, new Date().toISOString());
    return { ok: true };
  }
  if (existing.unsubscribedAt) {
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

/** One-click unsubscribe from an email link. Returns the address unsubscribed ("" when none). */
export async function unsubscribeMarketingToken(store: KVNamespace, tokenInput: string): Promise<string> {
  const token = tokenInput.trim().toLowerCase().replace(/[^a-f0-9]/g, "");
  if (token.length < 20) return "";
  const email = await store.get(`${UNSUB_TOKEN_PREFIX}${token}`);
  if (!email) return "";
  const result = await unsubscribeMarketingEmail(store, email);
  return result.ok ? email : "";
}

/** True when this address has said no to offers (unsubscribed subscriber or opted-out customer). */
export async function isMarketingOptedOut(store: KVNamespace, emailInput: string): Promise<boolean> {
  const email = normalizeEmail(emailInput);
  if (!isValidEmail(email)) return false;
  if (await store.get(`${OPTOUT_PREFIX}${email}`)) return true;
  const existing = await store.get<MarketingSubscriber>(subscriberKey(email), "json");
  return Boolean(existing?.unsubscribedAt);
}

/**
 * One-click unsubscribe token for any address (subscriber or past customer). Subscribers keep
 * their existing token; past customers get one stored outside the opt-in list, so sending them
 * an offer never adds them to the marketing list.
 */
export async function ensureCustomerUnsubscribeToken(store: KVNamespace, emailInput: string): Promise<string> {
  const email = normalizeEmail(emailInput);
  const subscriber = await store.get<MarketingSubscriber>(subscriberKey(email), "json");
  if (subscriber?.email) return ensureMarketingUnsubscribeToken(store, subscriber);
  const existing = await store.get(`${CUSTOMER_TOKEN_PREFIX}${email}`);
  if (existing) return existing;
  const token = randomToken();
  await store.put(`${UNSUB_TOKEN_PREFIX}${token}`, email);
  await store.put(`${CUSTOMER_TOKEN_PREFIX}${email}`, token);
  return token;
}
