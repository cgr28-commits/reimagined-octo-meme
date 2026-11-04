/**
 * POST /voice/quote — live fixed price for the phone assistant (fonio "API Request" tool).
 *
 * Same path as WhatsApp quotes: availability rules first, then the website pricing engine via
 * createPricedQuickQuote, which also stores a Quick Quote so the caller can be sent a booking
 * link. Never prices from the request; never reveals surcharges. Answers fast (fonio waits ~5s).
 */
import { voiceQuoteDraft, voiceQuoteSay, type VoiceQuoteInput } from "../shared/voice-quote";
import { VOICE_LINK_SENT_SAY } from "../shared/voice-greeting";
import { whatsAppDraftToQuoteBody, whatsAppQuoteLinkHours, WHATSAPP_SHORT_NOTICE_LINK_HOURS } from "../shared/whatsapp-quote-bot";
import { createPricedQuickQuote } from "./quick-quote-handlers";
import { consumeQuickQuoteCreateQuota } from "./quick-quote-store";
import { checkWhatsAppAvailability } from "./whatsapp-handlers";
import { sendQuoteLinkWhatsApp, tripWhen, type WhatsAppTemplateEnv } from "./whatsapp-templates";
import { markVoiceLinkSent } from "./voice-followup";

type Env = Omit<Parameters<typeof createPricedQuickQuote>[1], "TRACKING_STORE"> & { TRACKING_STORE?: KVNamespace };

/** What a phone quote priced, so "send me the link" can only send links this endpoint made. */
type VoiceQuoteMemo = { amountLabel: string; journeyLabel: string; whenLabel: string; heldFor: string; bookingUrl?: string };

/** Ready-to-send text message with the booking link (fonio "Send SMS" backup to WhatsApp). */
function smsText(memo: VoiceQuoteMemo, bookingUrl: string): string {
  return `My Airport Taxi NI: your fixed price for ${memo.journeyLabel} on ${memo.whenLabel} is ${memo.amountLabel}, held for ${memo.heldFor}. Check your details and book here: ${bookingUrl}`;
}
const MEMO_TTL_SECONDS = 3 * 60 * 60;
const memoKey = (id: string) => `voice:quote:${id}`;

function placeName(label: string | undefined): string {
  return String(label ?? "").split(",")[0]!.trim();
}

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
  if (!store) {
    return reply({
      ok: false,
      toolFailed: true,
      say: "I'm sorry — I can't get a price right now. Can I take your name and mobile so the team can text you back?",
    }, 503);
  }

  const body = await request.json().catch(() => null);
  const input = readInput(body);
  const checked = voiceQuoteDraft(input);
  if (!checked.ok) {
    return reply({
      ok: false,
      missing: checked.missing,
      ...(checked.askNext ? { askNext: checked.askNext } : {}),
      say: checked.say,
    });
  }
  const draft = checked.draft;

  if ((await consumeQuickQuoteCreateQuota(store, "voice:fonio", VOICE_QUOTES_PER_HOUR)) === "limited") {
    return reply({
      ok: false,
      say: "I've given a lot of prices just now. Can I take your name and mobile so the team can text you the price?",
    });
  }

  const availability = await checkWhatsAppAvailability(draft, store);
  if (!availability.ok) {
    const say =
      availability.reason === "notice"
        ? "That's a bit soon for us to guarantee a car. Can I take your name and mobile so the team can see if they can fit you in?"
        : availability.reason === "closed"
          ? "We're not taking bookings for that time. Can I take a message and have the team call you back?"
          : "We're fully booked at that time. Would a slightly earlier or later pickup work for you?";
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
      needsClearerAddress: true,
      say: "I couldn't quite place that journey. Could you give me the full pickup address or postcode?",
    });
  }

  const amount = priced.record.quotedAmount;
  const linkHours = whatsAppQuoteLinkHours(draft);
  const shortNotice = linkHours === WHATSAPP_SHORT_NOTICE_LINK_HOURS;
  const memo: VoiceQuoteMemo = {
    amountLabel: priced.record.quotedAmountLabel,
    journeyLabel: `${placeName(draft.pickupAddress)} to ${placeName(draft.dropoffAddress)}${draft.returnJourney ? " (return)" : ""}`,
    whenLabel: tripWhen(draft.outboundDate, draft.outboundTime),
    heldFor: `${linkHours} hours`,
    bookingUrl: priced.bookingUrl,
  };
  await store.put(memoKey(priced.record.id), JSON.stringify(memo), { expirationTtl: MEMO_TTL_SECONDS });
  return reply({
    ok: true,
    quoteId: priced.record.id,
    price: priced.record.quotedAmountLabel,
    priceGbp: amount,
    returnJourney: Boolean(draft.returnJourney),
    requestOnly: availability.requestOnly,
    priceHeldHours: linkHours,
    bookingLink: priced.bookingUrl,
    smsText: smsText(memo, priced.bookingUrl),
    vehicle: priced.record.journey.vehicleType ?? null,
    say: voiceQuoteSay({ amount, draft, vehicle: priced.record.journey.vehicleType, requestOnly: availability.requestOnly, shortNotice }),
  });
}

/**
 * POST /voice/send-link — WhatsApp the caller the booking link for a quote this phone line just
 * gave. Only quotes made by /voice/quote in the last 3 hours, once each, to a UK mobile.
 */
export async function handleVoiceSendLink(request: Request, env: Env & WhatsAppTemplateEnv): Promise<Response> {
  const store = env.TRACKING_STORE;
  const fallback = "No problem – the team will send you the booking link on WhatsApp shortly.";
  if (!store) return reply({ ok: false, say: fallback });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const input = (body && typeof body === "object" ? (body.parameters as Record<string, unknown>) ?? body : {}) as Record<string, unknown>;
  const quoteId = String(input.quoteId ?? "").trim();
  const mobile = String(input.mobile ?? "").trim();
  const name = String(input.name ?? "").trim().slice(0, 40);
  if (!/^[a-f0-9]{16,64}$/i.test(quoteId)) {
    return reply({ ok: false, say: "Let me get the fixed price first, then I can send you the booking link." });
  }
  const memo = await store.get<VoiceQuoteMemo>(memoKey(quoteId), "json");
  if (!memo) return reply({ ok: false, say: "That price has timed out. Let me get a fresh one, then I'll send the link." });
  const digits = mobile.replace(/[^\d+]/g, "");
  if (!/^(\+?44|0)7\d{9}$/.test(digits)) {
    return reply({ ok: false, missing: ["mobile"], say: "What's the best mobile for the link? It should start with 07." });
  }
  const sent = await sendQuoteLinkWhatsApp(env, {
    quoteId,
    customerName: name,
    mobile: digits,
    journeyLabel: memo.journeyLabel,
    whenLabel: memo.whenLabel,
    amountLabel: memo.amountLabel,
    heldFor: memo.heldFor,
  });
  if (sent.sent || sent.reason === "already_sent") {
    await markVoiceLinkSent(store, digits).catch(() => undefined);
    return reply({
      ok: true,
      delivered: true,
      channel: "whatsapp",
      say: `${VOICE_LINK_SENT_SAY} Your driver is confirmed after payment.`,
    });
  }
  console.log(JSON.stringify({ event: "voice_send_link_failed", reason: sent.reason, phoneSuffix: digits.slice(-4) }));
  // The SMS backup still gets them the link, so don't also send a follow-up.
  await markVoiceLinkSent(store, digits).catch(() => undefined);
  // WhatsApp couldn't send: Fonio should Send SMS, then only confirm after SMS succeeds.
  if (memo.bookingUrl) {
    return reply({
      ok: false,
      sendBySms: true,
      delivered: false,
      mobile: digits,
      smsText: smsText(memo, memo.bookingUrl),
      sayAfterSmsSent: `${VOICE_LINK_SENT_SAY} Your driver is confirmed after payment.`,
      say: "One moment — I'm texting you the booking link now.",
    });
  }
  return reply({ ok: false, delivered: false, say: fallback });
}
