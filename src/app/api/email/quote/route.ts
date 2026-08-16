import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  resolveBookingFromHeader,
  resolveBookingNotificationEmail,
} from "../../../../../shared/email-config";

export const runtime = "nodejs";

type QuoteEmailBody = {
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
  companyWebsite?: string;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function failure(status = 400) {
  return NextResponse.json(
    { success: false, error: "Unable to send email. Please try again." },
    { status },
  );
}

export async function POST(request: Request) {
  let body: QuoteEmailBody;
  try {
    body = (await request.json()) as QuoteEmailBody;
  } catch {
    return failure(400);
  }

  if (readString(body.companyWebsite)) {
    return NextResponse.json({ success: true });
  }

  const to = readString(body.to);
  const subject = readString(body.subject);
  const text = readString(body.text);
  const html = readString(body.html);

  if (!to || !isValidEmail(to) || !subject || !text) {
    return failure(400);
  }

  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  if (!apiKey) {
    console.error("RESEND_API_KEY missing on quote email API");
    return failure(503);
  }

  const env = {
    RESEND_API_KEY: apiKey,
    BOOKING_FROM_EMAIL: process.env.BOOKING_FROM_EMAIL,
    BOOKING_NOTIFICATION_EMAIL: process.env.BOOKING_NOTIFICATION_EMAIL,
    BOOKING_TO_EMAIL: process.env.BOOKING_TO_EMAIL,
  };

  try {
    const resend = new Resend(apiKey);
    const from = resolveBookingFromHeader(env);

    const customer = await resend.emails.send({
      from,
      to,
      subject,
      text,
      html: html || undefined,
    });
    if (customer.error) {
      console.error("Quote email to customer failed", customer.error.message);
      return failure(502);
    }

    await resend.emails.send({
      from,
      to: resolveBookingNotificationEmail(env),
      subject: `Quote emailed to customer — ${subject}`,
      text: `Quote emailed to ${to}\n\n${text}`,
      replyTo: to,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Quote email API failed", error instanceof Error ? error.message : "unknown");
    return failure(502);
  }
}
