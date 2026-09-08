/**
 * Send the previous London calendar day's quote report once.
 * Empty days are skipped. Failures must not affect customers.
 */

import {
  buildDailyQuoteReportHtml,
  buildDailyQuoteReportSubject,
  buildDailyQuoteReportText,
  shouldSendDailyQuoteReport,
} from "../shared/quote-session";
import { trySendOwnerOperationalEmail, type WorkerEmailEnv } from "./worker-email";
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
): Promise<{ sent: boolean; reason: string; reportDay: string; quoteCount: number }> {
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

  const send = await trySendOwnerOperationalEmail(env, {
    to: ownerInbox(env),
    subject: buildDailyQuoteReportSubject(decision.reportDay),
    body: buildDailyQuoteReportText(decision.reportDay, sessions),
    htmlBody: buildDailyQuoteReportHtml(decision.reportDay, sessions),
  });
  if (!send.sent) {
    console.error("Daily quote report email failed", send.error);
    return {
      sent: false,
      reason: "email_failed",
      reportDay: decision.reportDay,
      quoteCount: sessions.length,
    };
  }

  await markDailyQuoteReportSent(env.TRACKING_STORE, decision.reportDay);
  return {
    sent: true,
    reason: "sent",
    reportDay: decision.reportDay,
    quoteCount: sessions.length,
  };
}
