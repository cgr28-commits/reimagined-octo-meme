/**
 * Private Tours launch switch. Build-time only.
 * "live" (NEXT_PUBLIC_TOURS_MODE=live, set by the production Pages build once the owner has given final approval) makes the
 * pages indexable and removes the staging banner. Anything else (unset, staging previews) keeps them noindex with the banner.
 */
export const TOURS_LIVE = process.env.NEXT_PUBLIC_TOURS_MODE === "live";
