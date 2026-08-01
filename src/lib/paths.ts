import { SITE } from "./data";

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBasePath(path: string): string {
  if (!path.startsWith("/")) {
    return `${BASE_PATH}/${path}`;
  }

  return `${BASE_PATH}${path}`;
}

/** Absolute URL for static assets — required for Bing/social crawlers. */
export function absoluteSiteUrl(path: string): string {
  return new URL(withBasePath(path), SITE.url).href;
}
