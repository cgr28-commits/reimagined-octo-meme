/**
 * WhatsApp assistant: "Where's my driver?" — find the customer's journey for today
 * (matched on the WhatsApp number they booked with) and give them the driver's
 * name and mobile so they can call or text directly.
 *
 * The driver is the accepted assigned driver when there is one; otherwise the owner,
 * who drives the job. Nothing is disclosed for a journey booked on another number.
 */
import type { TrackingJobRecord } from "./tracking";
import { sameCustomerPhone } from "./whatsapp-pickup-info";

const DRIVER_CONTACT_QUESTION = new RegExp(
  [
    String.raw`\bwhere(?:'?s|\s+is|\s+are)\s+(?:my|the|our)\s+(?:driver|taxi|cab|car|lift)\b`,
    String.raw`\b(?:driver|taxi|cab)(?:'?s)?\s+(?:phone\s+|mobile\s+|contact\s+)?(?:number|mobile|contact)\b`,
    String.raw`\b(?:contact|call|ring|text|phone|reach)\s+(?:my|the|our)\s+driver\b`,
    String.raw`\b(?:driver|taxi|cab)\s+(?:is\s+|has\s+)?(?:still\s+)?(?:not|isn'?t|hasn'?t|has\s+not|not\s+yet)\s+(?:here|arrived|come|turned\s+up|shown\s+up|showed\s+up|outside)\b`,
    String.raw`\b(?:driver|taxi|cab)\s+(?:is\s+)?(?:running\s+)?late\b`,
    String.raw`\bis\s+(?:my|the|our)\s+(?:driver|taxi|cab)\s+(?:coming|on\s+(?:the|his|her|their)\s+way|here|outside|nearly\s+here|close|far\s+away)\b`,
    String.raw`\bno\s+sign\s+of\s+(?:my|the|our)\s+(?:driver|taxi|cab)\b`,
  ].join("|"),
  "i",
);

export function isWhatsAppDriverContactQuestion(text: string): boolean {
  return DRIVER_CONTACT_QUESTION.test(text.replace(/[’‘]/g, "'"));
}

const FINISHED = new Set(["arrived_destination", "completed", "stopped"]);

/** The customer's next live journey: from 4 hours ago up to 24 hours ahead. */
export function pickDriverContactJob(
  jobs: TrackingJobRecord[],
  phone: string,
  now: Date = new Date(),
): TrackingJobRecord | null {
  const from = now.getTime() - 4 * 60 * 60 * 1000;
  const to = now.getTime() + 24 * 60 * 60 * 1000;
  const live = jobs
    .filter((job) => sameCustomerPhone(job.customerMobile, phone))
    .filter((job) => !job.refundedAt && !FINISHED.has(job.journeyStatus ?? "idle"))
    .filter((job) => {
      const at = Date.parse(job.pickupAt);
      return Number.isFinite(at) && at >= from && at <= to;
    })
    .sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
  return live[0] ?? null;
}

export type WhatsAppDriverContact = { name: string; mobile: string };

/**
 * Accepted assigned driver first; otherwise the owner (who drives unassigned jobs).
 * Empty mobile means there is no number to give.
 */
export function resolveWhatsAppDriverContact(
  job: TrackingJobRecord,
  owner: { displayName?: string | null; mobile?: string | null } | null,
): WhatsAppDriverContact {
  const firstName = (name?: string | null) => name?.trim().split(/\s+/)[0] ?? "";
  if (job.assignmentStatus === "accepted" && job.assignedDriverMobile?.trim()) {
    return { name: firstName(job.assignedDriverName), mobile: job.assignedDriverMobile.trim() };
  }
  return { name: firstName(owner?.displayName), mobile: owner?.mobile?.trim() ?? "" };
}

/** "07700900123" / "+447700900123" → "07700 900123" (other formats left as typed). */
export function formatUkMobileForDisplay(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  const national = digits.startsWith("44") && digits.length === 12 ? `0${digits.slice(2)}` : digits;
  return /^07\d{9}$/.test(national) ? `${national.slice(0, 5)} ${national.slice(5)}` : mobile.trim();
}

export function buildWhatsAppDriverContactReply(
  job: TrackingJobRecord,
  driver: WhatsAppDriverContact,
): string {
  const place = (label: string) => label.split(",")[0]!.trim();
  const who = driver.name ? `Your driver is *${driver.name}*` : "Your driver";
  const pickup = `Your pickup is at ${job.tripTime} from ${place(job.pickupLabel)}`;
  return (
    `${who} — you can call or text them on *${formatUkMobileForDisplay(driver.mobile)}*. 📞\n\n` +
    `${pickup}${job.flightNumber ? ` (flight ${job.flightNumber})` : ""}.`
  );
}

export const WHATSAPP_DRIVER_NOT_FOUND_REPLY =
  "I can't see a journey for today on this WhatsApp number. If you booked with a different mobile, " +
  "please send your booking reference (it starts with MAT-) — I've also let the team know so they can help you straight away.";

export const WHATSAPP_DRIVER_NO_NUMBER_REPLY =
  "I've found your journey, but I don't have a number for your driver to hand. " +
  "I've let the team know and they'll get back to you here straight away.";
