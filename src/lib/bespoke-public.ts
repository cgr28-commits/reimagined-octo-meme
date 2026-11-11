/**
 * Public Event / Business Class request pages: OFF unless the site is built with
 * NEXT_PUBLIC_BESPOKE_PUBLIC_PAGES=1 (the isolated preview build sets it).
 * When off, the pages return 404, are not in the sitemap and are not linked.
 * The Worker has its own switch (BESPOKE_QUOTES_ENABLED); both must be on.
 */
export const BESPOKE_PUBLIC_PAGES_ENABLED = process.env.NEXT_PUBLIC_BESPOKE_PUBLIC_PAGES === "1";

export const EVENTS_HUB_PATH = "/events/";
export const EVENT_TRANSFER_REQUEST_PATH = "/events/transfer-request/";
export const BUSINESS_CLASS_REQUEST_PATH = "/business-class-request/";

/** Cloudflare Turnstile site key (public by design). Empty → online requests stay disabled. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
/** Must match BESPOKE_TURNSTILE_ACTION in the Worker. */
export const BESPOKE_TURNSTILE_ACTION = "bespoke_quote_request";

/** Public form ceiling for event groups: our largest vehicle is the 7-seater (subject to availability). */
export const EVENT_REQUEST_MAX_PASSENGERS = 7;
export const GROUP_VEHICLE_FROM_PASSENGERS = 5;
