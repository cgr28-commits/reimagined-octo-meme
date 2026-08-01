import {
  buildQuoteLeadFingerprint,
  type QuoteLeadDetails,
} from "../../shared/quote-lead";

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

export async function submitQuoteLead(details: QuoteLeadDetails): Promise<void> {
  const fingerprint = buildQuoteLeadFingerprint(details);
  const sent = readSentFingerprints();
  if (sent.has(fingerprint)) {
    return;
  }

  const response = await fetch(QUOTE_LEADS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      ...details,
      fingerprint,
    }),
  });

  if (!response.ok) {
    throw new Error(`Quote lead API failed (${response.status})`);
  }

  rememberSentFingerprint(fingerprint);
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
