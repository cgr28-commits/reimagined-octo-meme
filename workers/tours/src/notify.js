/**
 * Owner notification for a new Private Tours enquiry.
 *
 * Sends ONE short email through Resend when RESEND_API_KEY and TOURS_NOTIFY_EMAIL are both set; otherwise it does nothing
 * (staging sends nothing). The email carries only the reference, date, guest count, cruise flag and a link to the owner
 * view. It never contains the customer's name, phone, email, notes or mobility preferences: those stay in the owner-only
 * enquiry record. Failures are swallowed by the caller; the enquiry is already stored.
 */
const FROM_DEFAULT = "bookings@myairporttaxini.co.uk";

export function buildOwnerNotification(record, env) {
  const r = record.request || {};
  const lines = [
    `New Private Tours enquiry ${record.id}.`,
    `Date: ${r.date || "not given"}`,
    `Guests: ${r.guests ?? "not given"}`,
    record.cruise ? "Cruise guest: yes (check the all-aboard time)" : null,
    record.controls?.manualReview ? "Held for manual review by your emergency controls." : null,
    "Provisional price and journey times are estimates. Check them before you reply.",
    env.TOURS_OWNER_URL ? `Open your enquiries: ${env.TOURS_OWNER_URL}` : null,
    "Customer details are in the owner view only (kept 30 days).",
  ].filter(Boolean);
  return { subject: `Private Tours enquiry ${record.id}`, text: lines.join("\n") };
}

export async function notifyOwner(env, record, fetchImpl = fetch) {
  const key = typeof env.RESEND_API_KEY === "string" ? env.RESEND_API_KEY.trim() : "";
  const to = typeof env.TOURS_NOTIFY_EMAIL === "string" ? env.TOURS_NOTIFY_EMAIL.trim() : "";
  if (!key || !to) return { sent: false, reason: "not-configured" };
  const { subject, text } = buildOwnerNotification(record, env);
  const from = (typeof env.TOURS_FROM_EMAIL === "string" && env.TOURS_FROM_EMAIL.trim()) || FROM_DEFAULT;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `tours-${record.id}` },
      body: JSON.stringify({ from: `My Airport Taxi NI <${from}>`, to: [to], subject, text }),
      signal: controller.signal,
    });
    return { sent: res.ok, status: res.status };
  } catch {
    return { sent: false, reason: "error" };
  } finally {
    clearTimeout(timer);
  }
}
