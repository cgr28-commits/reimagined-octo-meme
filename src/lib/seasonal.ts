/**
 * Seasonal homepage decorations (owner, 15 Nov 2026).
 *
 * Christmas: a Santa hat on the header logo only (fairy lights and snow were removed 21 Nov 2026). Purely decorative — no effect on quotes, pricing, booking or
 * payments (the Christmas surcharge lives in the pricing settings, not here).
 *
 * To switch off after Christmas: set `enabled` to false. Everything is drawn from
 * src/app/seasonal-christmas.css and public/seasonal/, so it can also be deleted outright.
 */
export const CHRISTMAS_DECORATIONS = {
  enabled: true,
} as const;

/**
 * Christmas homepage video (owner, 17 Nov 2026) — "Coming Home for Christmas?" section
 * directly below the homepage quote calculator. Purely promotional: no effect on quotes,
 * pricing, surcharges, promo codes, booking or payments.
 *
 * Dates are inclusive calendar days in Europe/London (YYYY-MM-DD). The section shows from the
 * start of `showFrom` to the end of `showUntil`, then hides itself. Change the dates (and the
 * video files in public/seasonal/video/) for future Christmas campaigns, or set `enabled` to false.
 */
export const CHRISTMAS_VIDEO = {
  enabled: true,
  showFrom: "2026-11-17",
  showUntil: "2027-01-01",
  timeZone: "Europe/London",
} as const;

/** Today's calendar date in the campaign time zone, as YYYY-MM-DD. */
export function londonDateKey(now: Date, timeZone: string = CHRISTMAS_VIDEO.timeZone): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** True while the Christmas video section should be shown. */
export function isChristmasVideoLive(
  now: Date = new Date(),
  config: { enabled: boolean; showFrom: string; showUntil: string; timeZone: string } = CHRISTMAS_VIDEO,
): boolean {
  if (!config.enabled) return false;
  const today = londonDateKey(now, config.timeZone);
  return today >= config.showFrom && today <= config.showUntil;
}

/**
 * Campaign window for the welcome video. The dashboard controls whether visitors
 * see the video on its own, see it with the email promotion, or skip it entirely.
 */
export const CHRISTMAS_WELCOME = {
  enabled: true,
  showFrom: "2026-11-17",
  showUntil: "2027-01-01",
  timeZone: "Europe/London",
} as const;

/** `<html data-christmas-welcome-shown="1">` while the welcome has been shown this visit (PromoPopup waits). */
export const CHRISTMAS_WELCOME_FLAG = "christmasWelcomeShown";
