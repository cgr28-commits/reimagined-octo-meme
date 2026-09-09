export { BASE_PATH, withBasePath } from "./base-path";
import { withBasePath } from "./base-path";

/** Canonical public origin — keep in sync with SITE.url in data.ts. */
const CANONICAL_SITE_ORIGIN = "https://www.myairporttaxini.co.uk";

/** Absolute URL for static assets — required for Bing/social crawlers. */
export function absoluteSiteUrl(path: string): string {
  return new URL(withBasePath(path), CANONICAL_SITE_ORIGIN).href;
}
