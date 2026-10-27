/**
 * WhatsApp quote follow-up: one friendly nudge when a customer got a price but
 * hasn't booked. Sent once, a couple of hours after their last message, and only
 * inside WhatsApp's 24-hour customer service window (so it is a free reply).
 */

export type WhatsAppFollowUp = {
  phone: string;
  name?: string;
  quoteId: string;
  amountLabel: string;
  bookingUrl: string;
  /** e.g. "BT9 5AB → Belfast International Airport, Fri 30 Oct at 05:00". */
  journeyLabel?: string;
  dueAt: string;
  lastCustomerAt: string;
};

const FOLLOW_UP_PREFIX = "whatsapp:followup:";
const FOLLOW_UP_TTL_SECONDS = 60 * 60 * 24;
/** Stay well inside the 24h window measured from the customer's last message. */
export const WHATSAPP_FOLLOW_UP_WINDOW_MS = 23 * 60 * 60 * 1000;
export const WHATSAPP_FOLLOW_UP_DEFAULT_HOURS = 2;

const followUpKey = (phone: string) => `${FOLLOW_UP_PREFIX}${phone}`;

/** Hours to wait (env WHATSAPP_FOLLOW_UP_HOURS); 0 or "off" turns follow-ups off. */
export function whatsAppFollowUpDelayMs(raw: string | undefined): number | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return WHATSAPP_FOLLOW_UP_DEFAULT_HOURS * 60 * 60 * 1000;
  if (value === "off" || value === "false") return null;
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return Math.min(hours, 20) * 60 * 60 * 1000;
}

async function save(store: KVNamespace, record: WhatsAppFollowUp): Promise<void> {
  await store.put(followUpKey(record.phone), JSON.stringify(record), {
    expirationTtl: FOLLOW_UP_TTL_SECONDS,
    metadata: { dueAt: record.dueAt },
  });
}

export async function scheduleWhatsAppFollowUp(
  store: KVNamespace,
  input: Omit<WhatsAppFollowUp, "dueAt" | "lastCustomerAt">,
  delayMs: number,
  now: Date = new Date(),
): Promise<void> {
  await save(store, {
    ...input,
    dueAt: new Date(now.getTime() + delayMs).toISOString(),
    lastCustomerAt: now.toISOString(),
  });
}

/** The customer is still chatting: push the nudge back so it never interrupts them. */
export async function deferWhatsAppFollowUp(
  store: KVNamespace,
  phone: string,
  delayMs: number,
  now: Date = new Date(),
): Promise<void> {
  const current = await store.get<WhatsAppFollowUp>(followUpKey(phone), "json");
  if (!current) return;
  await save(store, {
    ...current,
    dueAt: new Date(now.getTime() + delayMs).toISOString(),
    lastCustomerAt: now.toISOString(),
  });
}

export async function cancelWhatsAppFollowUp(store: KVNamespace, phone: string): Promise<void> {
  await store.delete(followUpKey(phone));
}

export async function getWhatsAppFollowUp(store: KVNamespace, phone: string): Promise<WhatsAppFollowUp | null> {
  return store.get<WhatsAppFollowUp>(followUpKey(phone), "json");
}

/** Phones whose follow-up time has passed (from list metadata, no per-key reads). */
export async function listDueWhatsAppFollowUps(store: KVNamespace, now: Date, limit = 20): Promise<string[]> {
  const due: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.list<{ dueAt?: string }>({ prefix: FOLLOW_UP_PREFIX, cursor, limit: 1000 });
    for (const key of page.keys) {
      const dueAt = Date.parse(key.metadata?.dueAt ?? "");
      if (Number.isFinite(dueAt) && dueAt <= now.getTime()) due.push(key.name.slice(FOLLOW_UP_PREFIX.length));
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && due.length < limit);
  return due.slice(0, limit);
}

export function isInsideWhatsAppServiceWindow(record: WhatsAppFollowUp, now: Date): boolean {
  const last = Date.parse(record.lastCustomerAt);
  return Number.isFinite(last) && now.getTime() - last < WHATSAPP_FOLLOW_UP_WINDOW_MS;
}

/** "Stop", "no thanks", "booked elsewhere"… — never nudge after these. */
export function isWhatsAppFollowUpOptOut(text: string): boolean {
  return /\b(stop|unsubscribe|no thanks?|not (needed|required|interested)|booked (elsewhere|already|with someone else)|already booked|found (a|another) (taxi|driver|company))\b/i.test(
    text,
  );
}

export function buildWhatsAppFollowUpText(record: WhatsAppFollowUp): string {
  const hi = record.name?.trim() ? `Hi ${record.name.trim().split(/\s+/)[0]}` : "Hi";
  const journey = record.journeyLabel ? ` for ${record.journeyLabel}` : "";
  return (
    `${hi}, just checking in on your quote${journey}: *${record.amountLabel}* fixed price.\n\n` +
    `It only takes a couple of minutes to book and pay securely here:\n${record.bookingUrl}\n\n` +
    `Any questions (luggage, child seats, flight delays), just reply here and I'll help.`
  );
}
