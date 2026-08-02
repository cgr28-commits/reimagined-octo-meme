import {
  MARKETING_CONSENT_VERSION,
  type MarketingOptInSource,
} from "../shared/marketing";
import { corsHeaders } from "../shared/google-places";
import {
  marketingStoreConfigured,
  recordMarketingOptIn,
  unsubscribeMarketingEmail,
} from "./marketing-store";

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

const VALID_SOURCES = new Set<MarketingOptInSource>([
  "paid-booking",
  "booking-request",
  "tour-enquiry",
]);

type MarketingEnv = {
  TRACKING_STORE?: KVNamespace;
};

export async function handleMarketingOptInRequest(
  request: Request,
  env: MarketingEnv,
  origin: string | null,
): Promise<Response> {
  if (!marketingStoreConfigured(env.TRACKING_STORE)) {
    return json({ error: "Marketing list is not configured" }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const email = String(body.email ?? "").trim();
  const name = String(body.name ?? "").trim() || undefined;
  const source = String(body.source ?? "").trim() as MarketingOptInSource;
  const consentVersion = String(body.consentVersion ?? MARKETING_CONSENT_VERSION).trim();
  const optedInAt = String(body.optedInAt ?? "").trim() || undefined;

  if (!email || !VALID_SOURCES.has(source)) {
    return json({ error: "Missing or invalid fields" }, 400, origin);
  }

  const record = await recordMarketingOptIn(env.TRACKING_STORE, {
    email,
    name,
    source,
    consentVersion,
    optedInAt,
  });

  if (!record) {
    return json({ error: "Invalid email address" }, 400, origin);
  }

  return json({ ok: true, subscribed: true }, 200, origin);
}

export async function handleMarketingUnsubscribeRequest(
  request: Request,
  env: MarketingEnv,
  origin: string | null,
): Promise<Response> {
  if (!marketingStoreConfigured(env.TRACKING_STORE)) {
    return json({ error: "Marketing list is not configured" }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  const email = String(body.email ?? "").trim();
  if (!email) {
    return json({ error: "Missing email address" }, 400, origin);
  }

  const result = await unsubscribeMarketingEmail(env.TRACKING_STORE, email);
  if (!result.ok && result.reason === "invalid_email") {
    return json({ error: "Invalid email address" }, 400, origin);
  }

  // Always return ok for privacy — do not reveal whether an address was subscribed.
  return json({ ok: true }, 200, origin);
}

export async function maybeRecordMarketingFromPayload(
  store: KVNamespace | undefined,
  payload: {
    email?: string;
    name?: string;
    source: MarketingOptInSource;
    marketingOptIn?: boolean;
    marketingOptInAt?: string;
    marketingConsentVersion?: string;
  },
): Promise<void> {
  if (!marketingStoreConfigured(store) || !payload.marketingOptIn) {
    return;
  }

  const email = payload.email?.trim();
  if (!email) {
    return;
  }

  await recordMarketingOptIn(store, {
    email,
    name: payload.name?.trim(),
    source: payload.source,
    consentVersion: payload.marketingConsentVersion,
    optedInAt: payload.marketingOptInAt,
  });
}
