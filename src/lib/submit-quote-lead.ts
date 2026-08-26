import {
  buildQuoteLeadFingerprint,
  type QuoteLeadDetails,
} from "../../shared/quote-lead";
import { readConsentedAdsAttribution } from "@/lib/ads-attribution";

const SESSION_STORAGE_KEY = "matni-quote-lead-sent";
const DEBOUNCE_MS = 4000;

const DEFAULT_WORKER_QUOTE_LEADS =
  "https://reimagined-octo-meme.cgr28.workers.dev/quote-leads";

function resolveQuoteLeadsApiUrl(): string {
  const bookings = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (bookings) {
    try {
      const host = new URL(bookings).hostname.toLowerCase();
      if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") {
        return DEFAULT_WORKER_QUOTE_LEADS;
      }

      return bookings.replace(/\/bookings\/?$/, "/quote-leads");
    } catch {
      return DEFAULT_WORKER_QUOTE_LEADS;
    }
  }

  return DEFAULT_WORKER_QUOTE_LEADS;
}

const QUOTE_LEADS_API_URL = resolveQuoteLeadsApiUrl();

function readSentFingerprints(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function rememberSentFingerprint(fingerprint: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const sent = readSentFingerprints();
    sent.add(fingerprint);
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify([...sent].slice(-20)));
  } catch {
    // Ignore storage failures — server-side dedup still applies.
  }
}

function withAttribution(details: QuoteLeadDetails): QuoteLeadDetails {
  if (details.attribution) {
    return details;
  }

  const attribution = readConsentedAdsAttribution();
  return attribution ? { ...details, attribution } : details;
}

async function postQuoteLeadToWorker(
  details: QuoteLeadDetails,
  fingerprint: string,
): Promise<{ ok: boolean; emailed: boolean; deduplicated: boolean }> {
  try {
    const response = await fetch(QUOTE_LEADS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        ...details,
        fingerprint,
        // Always let the Worker send via Resend / operational providers.
        // Browser FormSubmit previously returned false "success" and skipped email.
        skipEmail: false,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      emailed?: unknown;
      deduplicated?: unknown;
    } | null;

    return {
      ok: response.ok,
      emailed: response.ok && payload?.emailed === true,
      deduplicated: response.ok && payload?.deduplicated === true,
    };
  } catch (error) {
    console.error("Quote lead worker request failed", error);
    return { ok: false, emailed: false, deduplicated: false };
  }
}

export async function submitQuoteLead(details: QuoteLeadDetails): Promise<void> {
  const enriched = withAttribution(details);
  const fingerprint = buildQuoteLeadFingerprint(enriched);
  const sent = readSentFingerprints();
  if (sent.has(fingerprint)) {
    return;
  }

  // Worker-only (Resend / preferWorkerProviders). Do not trust FormSubmit success.
  const worker = await postQuoteLeadToWorker(enriched, fingerprint);
  if (worker.deduplicated || worker.emailed) {
    rememberSentFingerprint(fingerprint);
    return;
  }

  throw new Error("Quote lead email failed via worker");
}

export function scheduleQuoteLeadAlert(
  details: QuoteLeadDetails,
  options?: { enabled?: boolean },
): () => void {
  if (options?.enabled === false || typeof window === "undefined") {
    return () => {};
  }

  const fingerprint = buildQuoteLeadFingerprint(details);
  if (readSentFingerprints().has(fingerprint)) {
    return () => {};
  }

  const timer = window.setTimeout(() => {
    void submitQuoteLead(details).catch((error) => {
      console.error("Quote lead alert failed", error);
    });
  }, DEBOUNCE_MS);

  return () => window.clearTimeout(timer);
}
