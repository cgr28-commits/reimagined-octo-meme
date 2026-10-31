/**
 * POST /voice/quote — live fixed price for the phone assistant (fonio "API Request" tool).
 *
 * Same path as WhatsApp quotes: availability rules first, then the website pricing engine via
 * createPricedQuickQuote, which also stores a Quick Quote so the caller can be sent a booking
 * link. Never prices from the request; never reveals surcharges. Answers fast (fonio waits ~5s).
 */
import { voiceQuoteDraft, voiceQuoteSay, type VoiceQuoteInput } from "../shared/voice-quote";
import { whatsAppDraftToQuoteBody, whatsAppQuoteLinkHours, WHATSAPP_SHORT_NOTICE_LINK_HOURS } from "../shared/whatsapp-quote-bot";
import { createPricedQuickQuote } from "./quick-quote-handlers";
import { consumeQuickQuoteCreateQuota } from "./quick-quote-store";
import { checkWhatsAppAvailability } from "./whatsapp-handlers";

type Env = Omit<Parameters<typeof createPricedQuickQuote>[1], "TRACKING_STORE"> & { TRACKING_STORE?: KVNamespace };

const VOICE_QUOTES_PER_HOUR = 60;

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** fonio may send the fields at the top level or wrapped (parameters / args / data). */
function readInput(body: unknown): VoiceQuoteInput {
  const root = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  for (const key of ["parameters", "args", "arguments", "data", "input"]) {
    const inner = root[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) return { ...root, ...(inner as object) } as VoiceQuoteInput;
  }
  return root as VoiceQuoteInput;
}

export async function handleVoiceQuote(request: Request, env: Env): Promise<Response> {
  const store = env.TRACKING_STORE;
  if (!store) return reply({ ok: false, say: "I can't get a price right now. The team will text you the price shortly." }, 503);

  const body = await request.json().catch(() => null);
  const input = readInput(body);
  const checked = voiceQuoteDraft(input);
  if (!checked.ok) return reply({ ok: false, missing: checked.missing, say: checked.say });
  const draft = checked.draft;

  if ((await consumeQuickQuoteCreateQuota(store, "voice:fonio", VOICE_QUOTES_PER_HOUR)) === "limited") {
    return reply({ ok: false, say: "I can't get a price just now. Can I take your details so the team can text you the price?" });
  }

  const availability = await checkWhatsAppAvailability(draft, store);
  if (!availability.ok) {
    const say =
      availability.reason === "notice"
        ? "That's a bit too soon for us to guarantee a car. Can I take your details so the team can see if they can fit you in?"
        : availability.reason === "closed"
          ? "We're not taking bookings for that time. Can I take your details so the team can get back to you?"
          : "We're fully booked at that time. Would a slightly earlier or later pickup work?";
    return reply({ ok: false, unavailable: availability.reason, say });
  }

  const priced = await createPricedQuickQuote(
    whatsAppDraftToQuoteBody(draft),
    { ...env, TRACKING_STORE: store },
    { createdByOwner: false },
  );
  if (!priced.ok) {
    return reply({
      ok: false,
      say: "I couldn't work out that journey. Could you give me the full address or postcode for the pickup and the destination?",
    });
  }

  const amount = priced.record.quotedAmount;
  const shortNotice = whatsAppQuoteLinkHours(draft) === WHATSAPP_SHORT_NOTICE_LINK_HOURS;
  return reply({
    ok: true,
    price: priced.record.quotedAmountLabel,
    priceGbp: amount,
    returnJourney: Boolean(draft.returnJourney),
    requestOnly: availability.requestOnly,
    priceHeldHours: whatsAppQuoteLinkHours(draft),
    bookingLink: priced.bookingUrl,
    say: voiceQuoteSay({ amount, draft, requestOnly: availability.requestOnly, shortNotice }),
  });
}
