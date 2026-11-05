/**
 * POST /voice/message — capture a callback / urgent / unclear enquiry for the team.
 *
 * Used when HTTP quote tools fail, the caller is out of hours, the address is unclear,
 * or they ask for a human. Never creates a paid booking. Stores a redacted call-log
 * entry the owner can read via GET /owner/voice-calls.
 */
import { voiceMobile } from "../shared/voice-booking";
import { appendVoiceCallLog } from "./voice-call-log-store";
import { consumeQuickQuoteCreateQuota } from "./quick-quote-store";

type Env = { TRACKING_STORE?: KVNamespace };

const MESSAGES_PER_HOUR = 40;

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function flatten(body: unknown): Record<string, unknown> {
  const root = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  let out: Record<string, unknown> = { ...root };
  for (const key of ["parameters", "args", "arguments", "data", "input", "variables"]) {
    const inner = root[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) out = { ...out, ...(inner as object) };
  }
  return out;
}

function text(value: unknown, max = 400): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "";
}

function isUrgent(value: unknown): boolean {
  return /^(y|yes|true|1|urgent|emergency|asap|priority)$/i.test(String(value ?? "").trim());
}

export async function handleVoiceMessage(request: Request, env: Env): Promise<Response> {
  const store = env.TRACKING_STORE;
  if (!store) {
    return reply({
      ok: false,
      say: "I'm sorry — I can't leave that message just now. Please call us back, or try WhatsApp on 07549 815538.",
    }, 503);
  }

  const input = flatten(await request.json().catch(() => null));
  const name = text(input.name ?? input.customerName, 40);
  const rawMobile = text(input.mobile ?? input.phone ?? input.fromNumber, 40);
  const mobile = voiceMobile(rawMobile) ?? "";
  const message = text(input.message ?? input.note ?? input.enquiry, 400);
  const pickup = text(input.pickup ?? input.pickupAddress, 80);
  const destination = text(input.destination ?? input.dropoff ?? input.dropoffAddress, 80);
  const urgent = isUrgent(input.urgent ?? input.urgency ?? input.priority);

  if (!message && !pickup && !destination) {
    return reply({
      ok: false,
      missing: ["message"],
      say: "What message would you like me to pass to the team?",
    });
  }
  if (!mobile && !rawMobile) {
    return reply({
      ok: false,
      missing: ["mobile"],
      say: "What's the best number for the team to call you back on?",
    });
  }
  if (!mobile) {
    return reply({
      ok: false,
      missing: ["mobile"],
      say: "Sorry, I didn't catch that as a mobile number. Could you give me an 07 mobile for the callback?",
    });
  }

  if ((await consumeQuickQuoteCreateQuota(store, "voice:message", MESSAGES_PER_HOUR)) === "limited") {
    return reply({
      ok: false,
      say: "I've taken a lot of messages just now. Please try WhatsApp on 07549 815538 and the team will get back to you.",
    });
  }

  const enquiryParts = [
    urgent ? "URGENT" : "Callback",
    name ? `from ${name}` : "",
    pickup && destination ? `${pickup} → ${destination}` : pickup || destination || "",
  ].filter(Boolean);
  const summary = [message || "Caller asked for a callback", enquiryParts.join(" ")].filter(Boolean).join(" — ");

  try {
    await appendVoiceCallLog(store, {
      mobile,
      summary,
      outcome: urgent ? "urgent_message" : "message_captured",
      enquiry: enquiryParts.join(" ").slice(0, 120),
      followUpQueued: false,
    });
  } catch (error) {
    console.error("voice message log failed", error instanceof Error ? error.message : error);
    return reply({
      ok: false,
      say: "I'm sorry — I couldn't save that just now. Please try WhatsApp on 07549 815538.",
    }, 502);
  }

  console.log(
    JSON.stringify({
      event: "voice_message_captured",
      urgent,
      phoneSuffix: mobile.replace(/\D/g, "").slice(-4),
      hasName: Boolean(name),
    }),
  );

  return reply({
    ok: true,
    urgent,
    say: urgent
      ? "I've marked that as urgent for the team and they'll call you back as soon as they can on that mobile."
      : "I've left that with the team and they'll call you back on that mobile.",
  });
}
