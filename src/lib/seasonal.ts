/**
 * Seasonal homepage decorations (owner, 15 Nov 2026).
 *
 * Christmas: a Santa hat on the header logo and fairy lights along the top of the
 * homepage quote card. Purely decorative — no effect on quotes, pricing, booking or
 * payments (the Christmas surcharge lives in the pricing settings, not here).
 *
 * To switch off after Christmas: set `enabled` to false. Everything is drawn from
 * src/app/seasonal-christmas.css and public/seasonal/, so it can also be deleted outright.
 */
export const CHRISTMAS_DECORATIONS = {
  enabled: true,
} as const;
