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
    const vehicleImageCache = [
      {
        source: "/images/vehicles/:file.webp",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=2592000",
          },
        ],
      },
    ];
    if (isGithubPages) {
      return vehicleImageCache;
    }
    return [
      ...vehicleImageCache,
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
