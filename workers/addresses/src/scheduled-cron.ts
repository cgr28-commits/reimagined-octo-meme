/**
 * Cloudflare invokes scheduled() once per matching cron.
 * The 5-minute trigger only expires unanswered short-notice requests.
 * The hourly trigger keeps review emails, tracking reminders, return offers,
 * saved-quote reminders, checkout recovery, ads retry, ad-fraud cleanup,
 * and the 19:30 London quote report on their existing cadence.
 * A missing cron (tests / manual dispatch) still runs both, as before.
 */

export const SHORT_NOTICE_EXPIRY_CRON = "*/5 * * * *";
export const HOURLY_SCHEDULED_CRON = "30 * * * *";

export function shouldRunShortNoticeExpiryCron(cron: string | undefined | null): boolean {
  if (!cron) return true;
  return cron === SHORT_NOTICE_EXPIRY_CRON || cron === HOURLY_SCHEDULED_CRON;
}

export function shouldRunHourlyScheduledJobs(cron: string | undefined | null): boolean {
  if (!cron) return true;
  return cron === HOURLY_SCHEDULED_CRON;
}
