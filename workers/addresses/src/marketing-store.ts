import {
  MARKETING_CONSENT_VERSION,
  type MarketingOptInSource,
  type MarketingSubscriber,
} from "../shared/marketing";

const SUBSCRIBER_PREFIX = "marketing:sub:";
const INDEX_KEY = "marketing:index";

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
