/** Safe in Next.js, Node, and Cloudflare Workers (no Node `process` types required). */
function readNextPublicBasePath(): string {
  const g = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return g.process?.env?.NEXT_PUBLIC_BASE_PATH ?? "";
}

export const BASE_PATH = readNextPublicBasePath();

/** Canonical public origin — keep in sync with SITE.url in data.ts (avoid circular import). */
const CANONICAL_SITE_ORIGIN = "https://www.myairporttaxini.co.uk";

export function withBasePath(path: string): string {
  if (!path.startsWith("/")) {
    return `${BASE_PATH}/${path}`;
  }

  return `${BASE_PATH}${path}`;
}

/** Absolute URL for static assets — required for Bing/social crawlers. */
export function absoluteSiteUrl(path: string): string {
  return new URL(withBasePath(path), CANONICAL_SITE_ORIGIN).href;
}
