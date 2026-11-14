/**
 * Whether the quote tools ask for the pickup date and time before showing a price, as the owner's
 * live surcharge settings stood when this site was built. Used for the first paint only, so the
 * form does not jump; the live settings take over as soon as they load.
 *
 * Rewritten by scripts/snapshot-quote-schedule-default.mjs on every build. The value committed
 * here is the fallback when that lookup cannot run.
 */
export const QUOTE_SCHEDULE_UP_FRONT_AT_BUILD: boolean = false;
