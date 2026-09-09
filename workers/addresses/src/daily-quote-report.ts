/**
 * Send the current London calendar day's quote report once at 19:30 London.
 * Includes every website quote session recorded for that London date up to send time.
 * Empty days are skipped. Resend-only. Failures must not affect customers.
 * If the 19:30 cron is missed, a later same-day :30 cron can still send once.
 */

import {
  buildDailyQuoteReportHtml,
  buildDailyQuoteReportSubject,
  buildDailyQuoteReportText,
  shouldSendDailyQuoteReport,
} from "../shared/quote-session";
import { trySendResendOnlyEmail, type WorkerEmailEnv } from "./worker-email";
import {
  hasDailyQuoteReportBeenSent,
  listQuoteSessionsForLondonDay,
  markDailyQuoteReportSent,
  quoteSessionStoreConfigured,
} from "./quote-session-store";

export type DailyQuoteReportEnv = WorkerEmailEnv & {
  TRACKING_STORE?: KVNamespace;
  DAILY_QUOTE_REPORT_LONDON_HOUR?: string;
};

function ownerInbox(env: DailyQuoteReportEnv): string {
  return env.BOOKING_TO_EMAIL?.trim() || "bookings@myairporttaxini.co.uk";
}

export async function processDailyQuoteReport(
  env: DailyQuoteReportEnv,
  now = new Date(),
): Promise<{
  sent: boolean;
  reason: string;
  reportDay: string;
  quoteCount: number;
  provider?: string;
}> {
  if (!quoteSessionStoreConfigured(env.TRACKING_STORE)) {
    return { sent: false, reason: "no_store", reportDay: "", quoteCount: 0 };
  }

  const probe = shouldSendDailyQuoteReport({
    now,
    configuredLondonHour: env.DAILY_QUOTE_REPORT_LONDON_HOUR,
    alreadySent: false,
    quoteCount: 1,
  });
  const alreadySent = await hasDailyQuoteReportBeenSent(env.TRACKING_STORE, probe.reportDay);
  const sessions = alreadySent
    ? []
    : await listQuoteSessionsForLondonDay(env.TRACKING_STORE, probe.reportDay);
  const decision = shouldSendDailyQuoteReport({
    now,
    configuredLondonHour: env.DAILY_QUOTE_REPORT_LONDON_HOUR,
    alreadySent,
    quoteCount: sessions.length,
  });

  if (!decision.send) {
    return {
      sent: false,
      reason: decision.reason,
      reportDay: decision.reportDay,
      quoteCount: sessions.length,
    };
  }

  const send = await trySendResendOnlyEmail(env, {
    to: ownerInbox(env),
    subject: buildDailyQuoteReportSubject(decision.reportDay),
    body: buildDailyQuoteReportText(decision.reportDay, sessions),
    htmlBody: buildDailyQuoteReportHtml(decision.reportDay, sessions),
  });
  if (!send.sent || send.provider !== "resend") {
    console.error("Daily quote report email failed", send.error ?? send.provider);
    return {
      sent: false,
      reason: "email_failed",
      reportDay: decision.reportDay,
      quoteCount: sessions.length,
      provider: send.provider,
    };
  }

  await markDailyQuoteReportSent(env.TRACKING_STORE, decision.reportDay);
  return {
    sent: true,
    reason: "sent",
    reportDay: decision.reportDay,
    quoteCount: sessions.length,
    provider: "resend",
  };
}
