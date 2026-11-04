/**
 * POST /voice/inbound — fonio Inbound Webhook (before the conversation).
 *
 * Official docs: https://fonio.info/en/developers/inbound-webhook
 * Fonio POSTs the caller number; we must respond with JSON within 5,000 ms.
 *
 * Privacy: never return addresses, booking references, payment status, or full
 * booking details. At most a first name + whether we recognise an upcoming job
 * so the assistant can greet politely and ask for the MAT reference to verify.
 */
import { sameCustomerPhone } from "../shared/whatsapp-pickup-info";
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

export async function handleVoiceInbound(request: Request, env: Env): Promise<Response> {
  const store = env.TRACKING_STORE;
  // Empty object is a valid fonio response when nothing is known.
  if (!store) return reply({});

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
  if (!mobile) return reply({});

  try {
    const upcoming = await listUpcomingPaidBookings(store, { pastDays: 1, futureDays: 180, limit: 250 });
    const mine = upcoming.filter((b) => sameCustomerPhone(b.mobileNumber, mobile));
    if (!mine.length) return reply({ knownCaller: false, hasUpcomingBooking: false });

    const name = firstName(String(mine[0]?.customerName ?? ""));
    return reply({
      knownCaller: true,
      hasUpcomingBooking: true,
      ...(name ? { name } : {}),
      // Prompt guidance only — the assistant must still verify with reference + mobile
      // via /voice/booking before reading any journey details.
      sayHint:
        "Greet them warmly by first name if we have it. Ask how we can help. Do not read booking details until they give the M-A-T booking reference and Booking Lookup verifies it.",
    });
  } catch (error) {
    console.error("voice inbound lookup failed", error instanceof Error ? error.message : error);
    // Safe empty context — never fail the call start because of a lookup error.
    return reply({ knownCaller: false, hasUpcomingBooking: false });
  }
}
