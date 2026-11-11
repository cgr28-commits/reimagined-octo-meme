/**
 * Owner Enquiries → "Send price".
 *
 * Out-of-area / manual-quote requests land in Enquiries as booking jobs with no
 * price. This turns one into a personalised quote (the same record, approval,
 * payment link and customer email the A2A Quotes queue already uses) so the
 * Owner can type a fare and send it from the enquiry card.
 *
 * Re-sending reuses the same quote record, so the customer only ever has one
 * live payment link for the enquiry.
 */

import type { PaidBookingDetails } from "../shared/booking-notifications";
import type { BookingJobRecord } from "../shared/booking-job";
import {
  createA2aQuoteRequest,
  handleOwnerApproveA2aQuote,
  type A2aQuoteEnv,
} from "./a2a-quote-handlers";
import { getA2aQuoteByReference, saveA2aQuoteRequest } from "./a2a-quote-store";
import { getBookingJob, saveBookingJob } from "./booking-job-store";
import { ownerAuthorized } from "./driver-auth";
import { isValidCustomerEmail } from "../shared/short-notice-payment-email";

export function bookingDetailsFromJob(job: BookingJobRecord): PaidBookingDetails {
  return {
    customerName: job.customerName,
    customerEmail: job.customerEmail,
    mobileNumber: job.customerMobile,
    tripLabel: job.tripLabel || "Transfer",
    pickupLabel: job.pickupLabel,
    dropoffLabel: job.dropoffLabel,
    returnJourney: Boolean(job.returnJourney),
    tripDate: job.tripDate,
    tripTime: job.tripTime,
    returnDate: job.returnDate ?? "",
    returnTime: job.returnTime ?? "",
    flightNumber: job.flightNumber ?? "",
    ...(job.returnFlightNumber ? { returnFlightNumber: job.returnFlightNumber } : {}),
    passengers: job.passengers || 1,
    suitcases: job.suitcases || 0,
    vehicle: job.vehicle || "Saloon",
    isAirportTrip: Boolean(job.isAirportTrip),
    ...(job.airportCode ? { airportCode: job.airportCode } : {}),
    ...(typeof job.isFromAirport === "boolean" ? { isFromAirport: job.isFromAirport } : {}),
    ...(job.pickupPlaceId ? { pickupPlaceId: job.pickupPlaceId } : {}),
    ...(job.dropoffPlaceId ? { dropoffPlaceId: job.dropoffPlaceId } : {}),
  };
}

export async function handleBookingJobSendQuote(
  request: Request,
  env: A2aQuoteEnv,
  body: Record<string, unknown>,
): Promise<
  | {
      ok: true;
      job: BookingJobRecord;
      quoteReference: string;
      payUrl: string;
      paymentEmailSent: boolean;
      paymentEmailError?: string;
    }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required", status: 401 };
  }

  const id = String(body.id ?? "").trim();
  if (!id) return { error: "Missing booking id", status: 400 };

  const job = await getBookingJob(env.TRACKING_STORE, id);
  if (!job) return { error: "Booking not found", status: 404 };
  if (job.status === "paid") return { error: "This booking is already paid.", status: 409 };
  if (job.status === "cancelled") return { error: "This booking was cancelled.", status: 409 };
  if (!job.customerEmail?.trim() || !isValidCustomerEmail(job.customerEmail)) {
    return {
      error: "This customer has no valid email address — send the price by WhatsApp or phone instead.",
      status: 400,
    };
  }

  // Reuse the quote already sent for this enquiry, otherwise create one.
  let quote = job.sentQuoteReference
    ? await getA2aQuoteByReference(env.TRACKING_STORE, job.sentQuoteReference)
    : null;
  if (quote && (quote.status === "CONFIRMED" || quote.paymentReference)) {
    return { error: "The customer has already paid this quote.", status: 409 };
  }
  if (!quote || quote.status === "CANCELLED") {
    quote = await createA2aQuoteRequest({
      store: env.TRACKING_STORE,
      booking: bookingDetailsFromJob(job),
    });
  }
  if (quote.bookingJobId !== job.id) {
    quote = { ...quote, bookingJobId: job.id };
    await saveA2aQuoteRequest(env.TRACKING_STORE, quote);
  }

  const approved = await handleOwnerApproveA2aQuote(request, env, {
    reference: quote.reference,
    quotedPrice: body.quotedPrice,
    validityMinutes: body.validityMinutes,
  });
  if ("error" in approved) return approved;

  const now = new Date().toISOString();
  const nextJob: BookingJobRecord = {
    ...job,
    sentQuoteReference: quote.reference,
    sentQuotePriceLabel: approved.record.quotedPriceLabel ?? undefined,
    sentQuoteAt: now,
    sentQuoteExpiresAt: approved.record.quoteExpiresAt ?? undefined,
    quotedPrice: approved.record.quotedPriceLabel ?? job.quotedPrice ?? null,
  };
  await saveBookingJob(env.TRACKING_STORE, nextJob);

  return {
    ok: true,
    job: nextJob,
    quoteReference: quote.reference,
    payUrl: approved.payUrl,
    paymentEmailSent: approved.paymentEmailSent,
    ...(approved.paymentEmailError ? { paymentEmailError: approved.paymentEmailError } : {}),
  };
}
