import type { MetadataRoute } from "next";
import { SITE, SITE_OFFLINE } from "@/lib/data";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const offlineActive =
    SITE_OFFLINE.enabled && Date.parse(SITE_OFFLINE.until) > Date.now();

  if (offlineActive) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/driver/",
        "/owner/",
        "/track/demo/",
        "/test-booking/",
        "/admin/",
        "/tip",
        // Static files in public/ — email previews, sample invoices and partner
        // proposals. Not customer pages; keep them out of search results.
        "/email-previews/",
        "/partners/",
        "/*-example.html",
      ],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
