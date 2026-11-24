import launch from "./private-tours-launch.json";

/**
 * Private Tours launch switch. Build-time only.
 * "Live" makes the pages indexable, removes the staging banner and sends enquiries to the production Worker.
 * It is set by committing `private-tours-launch.json` ({ "live": true, "apiUrl": "<Worker address>" }) in a reviewed pull
 * request, so going live and going back are both visible in git. NEXT_PUBLIC_TOURS_MODE=live overrides it for local builds.
 * Anything else (the committed default, staging previews) keeps the pages noindex with the banner.
 */
export const TOURS_LIVE = launch.live === true || process.env.NEXT_PUBLIC_TOURS_MODE === "live";
export const TOURS_LAUNCH_API_URL: string = launch.live === true ? String(launch.apiUrl || "") : "";
