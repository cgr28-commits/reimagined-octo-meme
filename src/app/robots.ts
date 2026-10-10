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
        "/driver-contact",
        "/owner/",
        "/track/demo/",
        "/test-booking/",
        "/admin/",
        "/tip",
      ],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
