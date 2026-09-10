import {
  buildQuoteContactFingerprint,
  buildQuoteLeadFingerprint,
  hasQuoteLeadContact,
  sanitizeQuoteLeadContact,
  type QuoteLeadDetails,
  type QuoteLeadKind,
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

function journeyOnlyDetails(details: QuoteLeadDetails): QuoteLeadDetails {
  const {
    customerName: _name,
    customerEmail: _email,
    mobileNumber: _mobile,
    ...journey
  } = details;
  void _name;
  void _email;
  void _mobile;
  return journey;
}

async function postQuoteSessionToWorker(
  details: QuoteLeadDetails,
  fingerprint: string,
  kind: QuoteLeadKind,
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
        kind,
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
    console.error("Quote lead request failed", error);
    return { ok: false, emailed: false, recorded: false };
  }
}

/** Persist / update one quote session and email the owner once per quoteTransactionId. */
export async function submitQuoteLead(details: QuoteLeadDetails): Promise<void> {
  const journey = journeyOnlyDetails(details);
  const fingerprint = buildQuoteLeadFingerprint(journey);
  const worker = await postQuoteSessionToWorker(journey, fingerprint, "quote");
  if (worker.ok || worker.recorded) {
    if (worker.emailed) {
      rememberSentFingerprint(fingerprint);
    }
    return;
  }
  // Fail safely — never block the quote UI.
}

/**
 * One contact-details follow-up after an explicit booking-details action.
 * Remembered only after the worker reports emailed=true so a failed send can retry.
 */
export async function submitQuoteContactLead(details: QuoteLeadDetails): Promise<void> {
  const contact = sanitizeQuoteLeadContact(details);
  if (!hasQuoteLeadContact(contact) || !details.quoteTransactionId?.trim()) {
    return;
  }

  const journey = journeyOnlyDetails(details);
  const payload = { ...journey, ...contact };
  const fingerprint = buildQuoteContactFingerprint(payload);
  if (readSentFingerprints().has(fingerprint)) {
    return;
  }

  const worker = await postQuoteSessionToWorker(payload, fingerprint, "contact");
  if (worker.emailed) {
    rememberSentFingerprint(fingerprint);
  }
}

/**
 * Record the latest quote session and send the first owner quote email.
 * Cleanup is a no-op so remounts cannot cancel. Failures never block the UI.
 */
export function scheduleQuoteLeadAlert(
  details: QuoteLeadDetails,
  options?: { enabled?: boolean },
): () => void {
  if (options?.enabled === false || typeof window === "undefined") {
    return () => {};
  }

  void submitQuoteLead(details).catch((error) => {
    console.error("Quote lead email failed via worker", error);
  });

  return () => {};
}

/**
 * Send the one-off contact-details owner email after Pay / Book / continue.
 * Must not be called while the customer is typing.
 */
export function scheduleQuoteContactAlert(
  details: QuoteLeadDetails,
  options?: { enabled?: boolean },
): void {
  if (options?.enabled === false || typeof window === "undefined") {
    return;
  }

  void submitQuoteContactLead(details).catch((error) => {
    console.error("Quote contact email failed via worker", error);
  });
}
