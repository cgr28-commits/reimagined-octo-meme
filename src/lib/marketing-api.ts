import {
  MARKETING_CONSENT_VERSION,
  type MarketingOptInFields,
  type MarketingOptInSource,
} from "../../shared/marketing";

const DEFAULT_WORKER_BASE = "https://reimagined-octo-meme.cgr28.workers.dev";

function resolveWorkerBaseUrl(): string {
  const bookings = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (bookings) {
    try {
      const host = new URL(bookings).hostname.toLowerCase();
      if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") {
        return DEFAULT_WORKER_BASE;
      }

      return bookings.replace(/\/bookings\/?$/, "");
    } catch {
      return DEFAULT_WORKER_BASE;
    }
  }

  return DEFAULT_WORKER_BASE;
}

const WORKER_BASE = resolveWorkerBaseUrl();

export function buildMarketingOptInFields(checked: boolean): MarketingOptInFields {
  if (!checked) {
    return {};
  }

  return {
    marketingOptIn: true,
    marketingOptInAt: new Date().toISOString(),
    marketingConsentVersion: MARKETING_CONSENT_VERSION,
  };
}

export async function recordMarketingOptIn(input: {
  email: string;
  name?: string;
  source: MarketingOptInSource;
  fields: MarketingOptInFields;
}): Promise<void> {
  if (!input.fields.marketingOptIn || !input.email.trim()) {
    return;
  }

  try {
    const response = await fetch(`${WORKER_BASE}/marketing/opt-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email: input.email.trim(),
        name: input.name?.trim(),
        source: input.source,
        consentVersion: input.fields.marketingConsentVersion ?? MARKETING_CONSENT_VERSION,
        optedInAt: input.fields.marketingOptInAt,
      }),
    });

    if (!response.ok) {
      console.error("Marketing opt-in API failed", response.status);
    }
  } catch (error) {
    console.error("Marketing opt-in API failed", error);
  }
}

export async function unsubscribeMarketingEmail(email: string): Promise<boolean> {
  const response = await fetch(`${WORKER_BASE}/marketing/unsubscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email: email.trim() }),
  });

  return response.ok;
}
