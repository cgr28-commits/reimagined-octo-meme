/**
 * POST /voice/inbound — fonio Inbound Webhook (before the conversation).
 *
 * Official docs: https://fonio.info/en/developers/inbound-webhook
 * Fonio POSTs the caller number; we must respond with JSON within 5,000 ms.
 *
 * Always returns a Europe/London time-of-day greeting that uses the full business
 * name once. Privacy: never return addresses, booking references, or journey details.
 */
import { sameCustomerPhone } from "../shared/whatsapp-pickup-info";
import { voiceOpeningGreeting } from "../shared/voice-greeting";
import { listUpcomingPaidBookings } from "./paid-booking-store";
import { voiceMobile } from "../shared/voice-booking";

type Env = { TRACKING_STORE?: KVNamespace };

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function flatten(body: unknown): Record<string, unknown> {
  const root = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  let out: Record<string, unknown> = { ...root };
  for (const key of ["parameters", "args", "arguments", "data", "input", "call"]) {
    const inner = root[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      out = { ...out, ...(inner as object) };
    }
  }
  return out;
}

function firstName(value: string): string {
  const first = value.trim().split(/\s+/)[0] ?? "";
  return first.replace(/[^A-Za-z'-]/g, "").slice(0, 40);
}

export async function handleVoiceInbound(request: Request, env: Env, now = new Date()): Promise<Response> {
  let input: Record<string, unknown> = {};
  if (request.method === "GET") {
    const url = new URL(request.url);
    input = Object.fromEntries(url.searchParams.entries());
  } else {
    input = flatten(await request.json().catch(() => null));
  }

  const raw =
    String(input.fromNumber ?? input.from_number ?? input.callerNumber ?? input.from ?? input.phone ?? input.mobile ?? "").trim();
  const mobile = voiceMobile(raw);
  const store = env.TRACKING_STORE;

  let name = "";
  let knownCaller = false;
  let hasUpcomingBooking = false;

  if (store && mobile) {
    try {
      const upcoming = await listUpcomingPaidBookings(store, { pastDays: 1, futureDays: 180, limit: 250 });
      const mine = upcoming.filter((b) => sameCustomerPhone(b.mobileNumber, mobile));
      if (mine.length) {
        knownCaller = true;
        hasUpcomingBooking = true;
        name = firstName(String(mine[0]?.customerName ?? ""));
      }
    } catch (error) {
      console.error("voice inbound lookup failed", error instanceof Error ? error.message : error);
    }
  }

  const { dayPart, greeting } = voiceOpeningGreeting({ firstName: name || undefined, now });
  return reply({
    dayPart,
    greeting,
    knownCaller,
    hasUpcomingBooking,
    ...(name ? { name } : {}),
    sayHint:
      "Speak the greeting field once only — it is already Europe/London local time (including daylight saving) and includes My Airport Taxi NI once. Do not rebuild or repeat the greeting. After that use only we/us/our. Do not read booking details until M-A-T reference + mobile are verified with Booking Lookup.",
  });
}
