import { airportPickupOffers, buildMeetGreetOfferEmail, meetGreetCheckoutReference, verifyMeetGreetPayment, MEET_GREET_EMAIL_DELAY_MS, type MeetGreetUpgrade } from "../shared/meet-greet-upgrade";
import { meetGreetFeeGbp } from "../shared/meet-greet";
import { getPaidBookingRecord, listPaidBookingsCreatedSince, updatePaidBookingFields, savePaidBookingRecord } from "./paid-booking-store";
import { loadOwnerPricingOrDefault } from "./owner-pricing-handlers";
import { trySendResendOnlyCustomerEmail, type WorkerEmailEnv } from "./worker-email";
import { sendUpdatedConfirmationFromCanonicalRecord } from "./send-updated-confirmation";
import { createSumUpHostedCheckout, getSumUpCheckout, listSumUpCheckoutsByReference, isDuplicateSumUpCheckoutError, getSuccessfulTransactionCode, getSuccessfulTransactionId } from "../shared/sumup-checkout";
import { parseLondonLocalDateTime } from "../shared/uk-time";
import { corsHeaders } from "../shared/google-places";

export type MeetGreetEnv = WorkerEmailEnv & { TRACKING_STORE?: KVNamespace; MEET_GREET_COORDINATOR?: DurableObjectNamespace; SUMUP_API_KEY?: string; SUMUP_MERCHANT_CODE?: string };
const origin = "https://www.myairporttaxini.co.uk";
const validToken = (token: string) => /^[a-f0-9]{64}$/.test(token);
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
const tokenKey = (token: string) => `meet-greet:token:${token}`;
const checkoutKey = (id: string) => `meet-greet:checkout:${id}`;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });

/** Per-booking durable serialization: offers, checkout creation, attachment and retries. */
export class MeetGreetCoordinator {
  constructor(private state: DurableObjectState, private env: MeetGreetEnv) {}
  async fetch(request: Request): Promise<Response> {
    return this.state.blockConcurrencyWhile(async () => {
      try { return await this.handle(request); } catch (error) { console.error("Meet & Greet action failed", error); return json({ error: "We couldn’t process this upgrade. Please retry or contact us." }, 503); }
    });
  }
  async alarm() {
    await this.state.blockConcurrencyWhile(async () => {
      try {
        await this.offer();
        for (const item of (await this.state.storage.get<MeetGreetUpgrade[]>("offers")) ?? []) {
          if (item.checkoutId && !item.confirmationSentAt) await this.settle(item);
        }
      } catch (error) { console.error("Meet & Greet retry failed", error); }
      const offers = (await this.state.storage.get<MeetGreetUpgrade[]>("offers")) ?? [];
      const reference = await this.state.storage.get<string>("reference");
      const booking = reference && this.env.TRACKING_STORE ? await getPaidBookingRecord(this.env.TRACKING_STORE, reference) : null;
      const pricing = await loadOwnerPricingOrDefault(this.env);
      const eligible = booking ? airportPickupOffers(booking, pricing) : [];
      for (const item of offers) {
        if (!item.offeredAt && !item.checkoutId && !eligible.some(x => x.leg === item.leg && x.airportCode === item.airport)) {
          item.closedReason = "This offer is no longer available."; await this.save(item);
        }
      }
      if (offers.some(x => x.checkoutId && !x.confirmationSentAt && !x.closedReason) || offers.some(x => !x.offeredAt && !x.paidAt && !x.closedReason)) {
        await this.state.storage.setAlarm(Date.now() + 5 * 60_000);
      }
    });
  }
  private async save(item: MeetGreetUpgrade) {
    const items = (await this.state.storage.get<MeetGreetUpgrade[]>("offers")) ?? [];
    await this.state.storage.put("offers", [...items.filter(x => x.token !== item.token), item]);
  }
  private async handle(request: Request): Promise<Response> {
    const body = await request.json() as { action: string; paymentReference?: string; token?: string; fallback?: boolean; apiOrigin?: string };
    if (body.action === "queue" && body.paymentReference) {
      if (!await this.state.storage.get("reference")) {
        await this.state.storage.put("reference", body.paymentReference);
        const booking = this.env.TRACKING_STORE ? await getPaidBookingRecord(this.env.TRACKING_STORE, body.paymentReference) : null;
        const dueAt = body.fallback && booking ? Date.parse(booking.createdAt) + MEET_GREET_EMAIL_DELAY_MS : Date.now() + MEET_GREET_EMAIL_DELAY_MS;
        await this.state.storage.put("dueAt", dueAt);
        await this.state.storage.setAlarm(Math.max(Date.now() + 1000, dueAt));
      }
      return json({ ok: true });
    }
    const item = ((await this.state.storage.get<MeetGreetUpgrade[]>("offers")) ?? []).find(x => x.token === body.token);
    if (!item) return json({ error: "This upgrade link is unavailable." }, 404);
    if (body.action === "confirm" || (body.action === "status" && item.checkoutId)) await this.settle(item);
    if (body.action === "confirm") return json({ ok: true, paid: !!item.paidAt });
    const booking = this.env.TRACKING_STORE ? await getPaidBookingRecord(this.env.TRACKING_STORE, item.paymentReference) : null;
    if (item.paidAt) return json({ state: "paid", bookingReference: item.customerReference, airport: item.airport, amount: item.amount, leg: item.leg, confirmationSent: !!item.confirmationSentAt, ...(item.closedReason ? { warning: item.closedReason } : {}) });
    if (item.closedReason) return json({ error: item.closedReason }, 410);
    const pricing = await loadOwnerPricingOrDefault(this.env);
    const eligible = booking && airportPickupOffers(booking, pricing, new Date(), false).some(x => x.leg === item.leg && x.airportCode === item.airport) &&
      item.pickupDate === (item.leg === "return" ? booking.returnDate : booking.tripDate) && item.pickupTime === (item.leg === "return" ? booking.returnTime : booking.tripTime) &&
      item.pickupLabel === (item.leg === "return" ? booking.dropoffLabel : booking.pickupLabel);
    if (!eligible) return json({ error: "This offer is no longer available. Please contact us if you’d like Meet & Greet." }, 410);
    if (body.action === "checkout") {
      if (!this.env.SUMUP_API_KEY || !this.env.SUMUP_MERCHANT_CODE || !this.env.TRACKING_STORE) return json({ error: "Online payment is unavailable." }, 503);
      if (!item.checkoutId) {
        item.checkoutReference = meetGreetCheckoutReference(item);
        await this.save(item); // stable reference saved before network call
        let checkout;
        try {
          checkout = await createSumUpHostedCheckout(this.env.SUMUP_API_KEY, this.env.SUMUP_MERCHANT_CODE, {
            amount: item.amount, description: `${item.customerReference} — Meet & Greet ${item.airport} ${item.leg} collection`, checkoutReference: item.checkoutReference,
            redirectUrl: `${origin}/meet-and-greet/?t=${item.token}`, returnUrl: `${body.apiOrigin}/payments/webhook`,
          });
        } catch (error) {
          if (!isDuplicateSumUpCheckoutError(error)) throw error;
          const rows = await listSumUpCheckoutsByReference(this.env.SUMUP_API_KEY, item.checkoutReference);
          const found = rows.find(x => x.checkout_reference === item.checkoutReference && x.amount === item.amount && x.currency === "GBP");
          if (!found) throw error;
          checkout = { checkoutId: found.id, paymentUrl: found.hosted_checkout_url ?? "", checkoutReference: item.checkoutReference };
        }
        item.checkoutId = checkout.checkoutId; item.paymentUrl = checkout.paymentUrl;
        await this.save(item);
        await this.env.TRACKING_STORE.put(checkoutKey(item.checkoutId), JSON.stringify({ reference: item.paymentReference, token: item.token }), { expirationTtl: 31536000 });
        await this.state.storage.setAlarm(Date.now() + 60_000);
      }
      await this.settle(item);
      if (item.paidAt) return json({ state: "paid", bookingReference: item.customerReference });
      if (item.closedReason) return json({ error: item.closedReason }, 410);
      if (!item.paymentUrl) return json({ error: "This payment link has expired. Please contact us." }, 410);
      return json({ paymentUrl: item.paymentUrl });
    }
    return json({ state: "open", bookingReference: item.customerReference, airport: item.airport, amount: item.amount, leg: item.leg, pickupDate: item.pickupDate, pickupTime: item.pickupTime, pickupLabel: item.pickupLabel, dropoffLabel: item.dropoffLabel });
  }
  private async offer() {
    const reference = await this.state.storage.get<string>("reference");
    const dueAt = await this.state.storage.get<number>("dueAt");
    if (!reference || !this.env.TRACKING_STORE || (dueAt && Date.now() < dueAt)) return;
    const booking = await getPaidBookingRecord(this.env.TRACKING_STORE, reference);
    if (!booking) return;
    const pricing = await loadOwnerPricingOrDefault(this.env);
    for (const { leg, airportCode } of airportPickupOffers(booking, pricing)) {
      let item = ((await this.state.storage.get<MeetGreetUpgrade[]>("offers")) ?? []).find(x => x.leg === leg);
      if (item?.offeredAt || item?.paidAt) continue;
      item ??= { token: newToken(), paymentReference: reference, customerReference: booking.customerReference!, airport: airportCode, leg,
        amount: meetGreetFeeGbp(airportCode, pricing.meetGreet), pickupDate: leg === "return" ? booking.returnDate! : booking.tripDate,
        pickupTime: leg === "return" ? booking.returnTime! : booking.tripTime, pickupLabel: leg === "return" ? booking.dropoffLabel : booking.pickupLabel,
        dropoffLabel: leg === "return" ? booking.pickupLabel : booking.dropoffLabel };
      await this.save(item);
      await this.env.TRACKING_STORE.put(tokenKey(item.token), reference, { expirationTtl: 31536000 });
      const mail = buildMeetGreetOfferEmail(item, booking.customerName);
      const result = await trySendResendOnlyCustomerEmail(this.env, { idempotencyKey: `meet-greet-offer-${item.token}`, to: booking.customerEmail, toName: booking.customerName, subject: mail.subject, body: mail.text, htmlBody: mail.html });
      if (result.sent) { item.offeredAt = new Date().toISOString(); await this.save(item); }
    }
  }
  private async settle(item: MeetGreetUpgrade) {
    if (!item.checkoutId || !this.env.SUMUP_API_KEY || !this.env.TRACKING_STORE) return;
    const checkout = await getSumUpCheckout(this.env.SUMUP_API_KEY, item.checkoutId);
    if (!verifyMeetGreetPayment(item, checkout)) {
      if (checkout.status === "PAID") throw new Error("Meet & Greet payment proof mismatch");
      const pickupAt = parseLondonLocalDateTime(item.pickupDate, item.pickupTime);
      if (["FAILED", "EXPIRED", "CANCELLED"].includes(checkout.status ?? "") || !pickupAt || pickupAt.getTime() <= Date.now()) {
        item.closedReason = "This payment link is no longer available. Please contact us."; await this.save(item);
      }
      return;
    }
    item.paidAt ??= new Date().toISOString();
    item.transactionCode = getSuccessfulTransactionCode(checkout); item.transactionId = getSuccessfulTransactionId(checkout);
    await this.save(item); // money evidence before attachment or email
    let booking = await getPaidBookingRecord(this.env.TRACKING_STORE, item.paymentReference);
    if (!booking) throw new Error("Original booking missing after upgrade payment");
    const alreadyAttached = booking.meetGreetUpgrades?.some(x => x.checkoutId === item.checkoutId);
    if (!alreadyAttached) {
      const collectionAt = parseLondonLocalDateTime(item.leg === "return" ? booking.returnDate ?? "" : booking.tripDate, item.leg === "return" ? booking.returnTime ?? "" : booking.tripTime);
      const cancelled = !collectionAt || collectionAt.getTime() <= Date.now() || booking.operationalStatus === "cancelled" || ["cancelled", "refunded"].includes(booking.status) || booking.cancelledLegs?.includes(item.leg);
      const upgrades = [...(booking.meetGreetUpgrades ?? []), { ...item, attachedAt: new Date().toISOString() }];
      const sum = (booking.additionalPayments ?? []).reduce((n, x) => n + x.amount, 0);
      const original = booking.originalAmount ?? booking.amount - sum;
      const payments = [...(booking.additionalPayments ?? []), { amount: item.amount, checkoutId: item.checkoutId, paymentReference: item.checkoutReference!, amendmentId: `meet-greet-${item.token}`, paidAt: item.paidAt, transactionCode: item.transactionCode, transactionId: item.transactionId }];
      const patch = { meetGreetUpgrades: upgrades, additionalPayments: payments, originalAmount: original,
        amountPaidLabel: `£${(original + sum + item.amount).toFixed(2)}`, amount: booking.amount + item.amount,
        totalFare: (booking.totalFare ?? booking.amount) + item.amount, onlineAmountPaid: (booking.onlineAmountPaid ?? original + sum) + item.amount,
        ...(!cancelled ? (item.leg === "return" ? { returnAirportAccessOption: "meet-greet" as const } : { outboundAirportAccessOption: "meet-greet" as const, airportAccessOption: "meet-greet" as const }) : {}),
        ...(cancelled ? { refundDueAmount: (booking.refundDueAmount ?? 0) + item.amount, refundDueReason: "Meet & Greet paid for a cancelled or elapsed collection" } : {}) };
      if (cancelled) { booking = { ...booking, ...patch }; await savePaidBookingRecord(this.env.TRACKING_STORE, booking); }
      else booking = await updatePaidBookingFields(this.env.TRACKING_STORE, item.paymentReference, patch, { changedBy: "System" });
      if (!booking) throw new Error("Booking changed during attachment; retry reconciliation");
    }
    item.attachedAt ??= new Date().toISOString(); await this.save(item);
    if (booking.refundDueReason === "Meet & Greet paid for a cancelled or elapsed collection" || booking.operationalStatus === "cancelled" || ["cancelled", "refunded"].includes(booking.status) || booking.cancelledLegs?.includes(item.leg)) {
      item.closedReason = "Your payment is recorded, but the collection is cancelled or has passed. Please contact Colin for a refund review."; await this.save(item); return;
    }
    if (!item.confirmationSentAt) {
      const result = await sendUpdatedConfirmationFromCanonicalRecord({ env: this.env, record: booking, amendmentId: `meet-greet-${item.token}`, persistStatus: true,
        whatChanged: [`Meet & Greet selected for your ${item.airport} ${item.leg === "return" ? "return " : ""}collection`, `Upgrade payment received: £${item.amount.toFixed(2)} — booking ${item.customerReference}`] });
      if (result.sent) item.confirmationSentAt = new Date().toISOString(); else item.confirmationError = result.error;
      await this.save(item);
    }
  }
}
async function callCoordinator(env: MeetGreetEnv, reference: string, body: unknown) {
  if (!env.MEET_GREET_COORDINATOR) return json({ error: "Meet & Greet upgrades are unavailable." }, 503);
  return env.MEET_GREET_COORDINATOR.get(env.MEET_GREET_COORDINATOR.idFromName(reference)).fetch("https://meet-greet.internal/action", { method: "POST", body: JSON.stringify(body) });
}
export async function queueMeetGreetEmail(env: MeetGreetEnv, paymentReference: string, fallback = false) {
  if (!env.MEET_GREET_COORDINATOR || !env.TRACKING_STORE) return;
  const booking = await getPaidBookingRecord(env.TRACKING_STORE, paymentReference);
  const pricing = await loadOwnerPricingOrDefault(env);
  if (!booking || !airportPickupOffers(booking, pricing, new Date(), false).length) return;
  const result = await callCoordinator(env, paymentReference, { action: "queue", paymentReference, fallback });
  if (!result.ok) throw new Error("Could not queue Meet & Greet email");
}
export async function recoverMeetGreetEmails(env: MeetGreetEnv) {
  if (!env.TRACKING_STORE || !env.MEET_GREET_COORDINATOR) return;
  const pricing = await loadOwnerPricingOrDefault(env);
  if (!Object.values(pricing.meetGreetEmail?.enabled ?? {}).some(Boolean)) return;
  const since = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
  for (const booking of await listPaidBookingsCreatedSince(env.TRACKING_STORE, since)) {
    if (airportPickupOffers(booking, pricing).length) await queueMeetGreetEmail(env, booking.paymentReference, true);
  }
}
export async function handleMeetGreetUpgrade(request: Request, env: MeetGreetEnv, requestOrigin: string | null) {
  const url = new URL(request.url); const action = url.pathname.split("/").pop()!;
  if (!["status", "checkout", "confirm"].includes(action) || (action === "status" ? request.method !== "GET" : request.method !== "POST")) return json({ error: "Method not allowed" }, 405);
  const body = request.method === "GET" ? { token: url.searchParams.get("t") } : await request.json().catch(() => ({})) as { token?: string };
  const token = String(body.token ?? "");
  const reference = validToken(token) && env.TRACKING_STORE ? await env.TRACKING_STORE.get(tokenKey(token)) : null;
  const response = reference ? await callCoordinator(env, reference, { action, token, apiOrigin: new URL(request.url).origin }) : json({ error: "This upgrade link is unavailable." }, 404);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(requestOrigin))) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}
export async function confirmMeetGreetWebhook(env: MeetGreetEnv, checkoutId: string): Promise<"missing" | "done" | "retry"> {
  const link = env.TRACKING_STORE ? await env.TRACKING_STORE.get<{ reference: string; token: string }>(checkoutKey(checkoutId), "json") : null;
  if (!link) return "missing";
  const response = await callCoordinator(env, link.reference, { action: "confirm", token: link.token });
  return response.ok ? "done" : "retry";
}
