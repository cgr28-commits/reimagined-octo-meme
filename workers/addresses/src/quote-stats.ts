import { STARTING_BOOKING_REF } from "../shared/booking-reference";
import { corsHeaders } from "../shared/google-places";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";

const QUOTE_LEADS_TOTAL_KEY = "quote_leads_total";
const QUOTE_LEADS_DEDUPED_KEY = "quote_leads_deduped_total";
const QUOTE_LEADS_LAST_AT_KEY = "quote_leads_last_at";
const NEXT_BOOKING_REF_KEY = "next_booking_ref";

export type QuoteStatsEnv = DriverAuthEnv & {
  BOOKING_COUNTER?: KVNamespace;
};

export type QuoteStatsSnapshot = {
  quoteLeadsTotal: number;
  quoteLeadsDedupedTotal: number;
  quoteLeadsLastAt: string | null;
  bookingsIssuedTotal: number;
  nextBookingRef: number | null;
  counterConfigured: boolean;
};

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function parseNonNegativeInt(value: string | null): number {
  if (!value) {
    return 0;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

async function readCounter(store: KVNamespace, key: string): Promise<number> {
  return parseNonNegativeInt(await store.get(key));
}

async function incrementCounter(store: KVNamespace, key: string): Promise<number> {
  const next = (await readCounter(store, key)) + 1;
  await store.put(key, String(next));
  return next;
}

export async function recordQuoteLeadSent(env: QuoteStatsEnv): Promise<number | null> {
  if (!env.BOOKING_COUNTER) {
    return null;
  }

  const total = await incrementCounter(env.BOOKING_COUNTER, QUOTE_LEADS_TOTAL_KEY);
  await env.BOOKING_COUNTER.put(QUOTE_LEADS_LAST_AT_KEY, new Date().toISOString());
  return total;
}

export async function recordQuoteLeadDeduped(env: QuoteStatsEnv): Promise<number | null> {
  if (!env.BOOKING_COUNTER) {
    return null;
  }

  return incrementCounter(env.BOOKING_COUNTER, QUOTE_LEADS_DEDUPED_KEY);
}

export async function readQuoteStats(env: QuoteStatsEnv): Promise<QuoteStatsSnapshot> {
  if (!env.BOOKING_COUNTER) {
    return {
      quoteLeadsTotal: 0,
      quoteLeadsDedupedTotal: 0,
      quoteLeadsLastAt: null,
      bookingsIssuedTotal: 0,
      nextBookingRef: null,
      counterConfigured: false,
    };
  }

  const store = env.BOOKING_COUNTER;
  const [quoteLeadsTotal, quoteLeadsDedupedTotal, quoteLeadsLastAt, nextStored] =
    await Promise.all([
      readCounter(store, QUOTE_LEADS_TOTAL_KEY),
      readCounter(store, QUOTE_LEADS_DEDUPED_KEY),
      store.get(QUOTE_LEADS_LAST_AT_KEY),
      store.get(NEXT_BOOKING_REF_KEY),
    ]);

  let nextBookingRef: number | null = null;
  let bookingsIssuedTotal = 0;
  if (nextStored) {
    const parsed = Number(nextStored);
    if (Number.isFinite(parsed) && parsed >= STARTING_BOOKING_REF) {
      nextBookingRef = Math.floor(parsed);
      bookingsIssuedTotal = Math.max(0, nextBookingRef - STARTING_BOOKING_REF);
    }
  }

  return {
    quoteLeadsTotal,
    quoteLeadsDedupedTotal,
    quoteLeadsLastAt: quoteLeadsLastAt?.trim() || null,
    bookingsIssuedTotal,
    nextBookingRef,
    counterConfigured: true,
  };
}

export async function handleQuoteStatsRequest(
  request: Request,
  env: QuoteStatsEnv,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized — owner access required" }, 401, origin);
  }

  const stats = await readQuoteStats(env);
  return jsonResponse({ ok: true, ...stats }, 200, origin);
}
