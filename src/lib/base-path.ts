/**
 * Public asset prefix. Kept independent of data.ts / SITE so webpack/turbopack
 * can initialise BASE_PATH before any page module reads hero image paths.
 */

/** Safe in Next.js, Node, and Cloudflare Workers (no Node `process` types required). */
function readNextPublicBasePath(): string {
  const g = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  return g.process?.env?.NEXT_PUBLIC_BASE_PATH ?? "";
}

export const BASE_PATH = readNextPublicBasePath();

export function withBasePath(path: string): string {
  if (!path.startsWith("/")) {
    return `${BASE_PATH}/${path}`;
  }

  return `${BASE_PATH}${path}`;
}
