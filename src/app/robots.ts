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
      ],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
