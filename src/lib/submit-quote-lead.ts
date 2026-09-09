import {
  buildQuoteLeadFingerprint,
  type QuoteLeadDetails,
} from "../../shared/quote-lead";

const SESSION_STORAGE_KEY = "matni-quote-lead-sent";

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
    // Ignore storage failures — server-side upsert still applies.
  }
}

async function postQuoteSessionToWorker(
  details: QuoteLeadDetails,
  fingerprint: string,
): Promise<{ ok: boolean; emailed: boolean; recorded: boolean }> {
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
        // Never send an immediate owner email from quote view / recalculation.
        skipEmail: true,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      emailed?: unknown;
      recorded?: unknown;
    } | null;

    return {
      ok: response.ok,
      emailed: payload?.emailed === true,
      recorded: response.ok && payload?.recorded !== false,
    };
  } catch (error) {
    console.error("Quote session record failed", error);
    return { ok: false, emailed: false, recorded: false };
  }
}

/** Persist / update one quote session. Never emails the owner. */
export async function submitQuoteLead(details: QuoteLeadDetails): Promise<void> {
  const fingerprint = buildQuoteLeadFingerprint(details);
  const worker = await postQuoteSessionToWorker(details, fingerprint);
  if (worker.ok || worker.recorded) {
    rememberSentFingerprint(fingerprint);
    return;
  }
  // Fail safely — never block the quote UI.
}

/**
 * Record the latest quote session state for the daily owner report.
 * Does not send an owner email. Cleanup is a no-op so remounts cannot cancel.
 */
export function scheduleQuoteLeadAlert(
  details: QuoteLeadDetails,
  options?: { enabled?: boolean },
): () => void {
  if (options?.enabled === false || typeof window === "undefined") {
    return () => {};
  }

  void submitQuoteLead(details).catch((error) => {
    console.error("Quote session record failed", error);
  });

  return () => {};
}
