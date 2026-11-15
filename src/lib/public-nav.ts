/**
 * Website navigation links. Kept out of src/lib/data.ts because the Cloudflare Worker
 * imports data.ts, and build-time switches (process.env) are not available there.
 *
 * Business Class (/business-class/) appears while its page switch is on.
 */
import { NAV_LINKS } from "@/lib/data";
import { BUSINESS_CLASS_PAGE_PUBLIC_ENABLED } from "@/lib/bespoke-public";

export const BUSINESS_CLASS_NAV_LINK = { label: "Business Class", href: "/business-class/" } as const;

export const PUBLIC_NAV_LINKS: ReadonlyArray<{ label: string; href: string }> = BUSINESS_CLASS_PAGE_PUBLIC_ENABLED
  ? [NAV_LINKS[0], BUSINESS_CLASS_NAV_LINK, ...NAV_LINKS.slice(1)]
  : NAV_LINKS;
