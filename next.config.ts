import type { NextConfig } from "next";
import { transferLegacyRedirectEntries } from "./src/lib/transfer-legacy-redirects.mjs";

const isGithubPages = process.env.GITHUB_PAGES === "true";
const previewAddresses = !isGithubPages && process.env.VERCEL_ENV === "preview" &&
  process.env.VERCEL_GIT_COMMIT_REF === "feat/optional-terminal-access";

const vcardHeaders = [
  { key: "Content-Type", value: "text/vcard; charset=utf-8" },
  {
    key: "Content-Disposition",
    value: 'inline; filename="My-Airport-Taxi-NI.vcf"',
  },
  { key: "Cache-Control", value: "public, max-age=300" },
];

const nextConfig: NextConfig = {
  // The address adapter exists only in this draft's Vercel previews, never static/production builds.
  pageExtensions: ["tsx", "ts", "jsx", "js", ...(previewAddresses ? ["preview.ts"] : [])],
  ...(isGithubPages ? { output: "export" as const } : {}),
  basePath: "",
  trailingSlash: isGithubPages,
  env: {
    NEXT_PUBLIC_BASE_PATH: "",
    NEXT_PUBLIC_PREVIEW_ADDRESSES_URL: previewAddresses && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/preview-addresses` : "",
  },
  images: {
    unoptimized: isGithubPages,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async redirects() {
    if (isGithubPages) {
      return [];
    }
    return transferLegacyRedirectEntries();
  },
  async headers() {
    if (isGithubPages) {
      return [];
    }
    return [
      {
        source: "/My-Airport-Taxi-NI.vcf",
        headers: vcardHeaders,
      },
      {
        source: "/my-airport-taxi-ni.vcf",
        headers: vcardHeaders,
      },
    ];
  },
};

export default nextConfig;
