import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";

const vcardHeaders = [
  { key: "Content-Type", value: "text/vcard; charset=utf-8" },
  {
    key: "Content-Disposition",
    value: 'inline; filename="My-Airport-Taxi-NI.vcf"',
  },
  { key: "Cache-Control", value: "public, max-age=300" },
];

const nextConfig: NextConfig = {
  ...(isGithubPages ? { output: "export" as const } : {}),
  basePath: "",
  trailingSlash: isGithubPages,
  env: {
    NEXT_PUBLIC_BASE_PATH: "",
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
