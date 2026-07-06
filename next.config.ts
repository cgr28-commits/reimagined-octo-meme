import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";
// Use "" for a custom domain (e.g. www.myairporttaxini.co.uk).
// Leave unset to serve from github.io/reimagined-octo-meme.
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH ??
  (isGithubPages ? "/reimagined-octo-meme" : "");

const nextConfig: NextConfig = {
  ...(isGithubPages ? { output: "export" as const } : {}),
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  trailingSlash: isGithubPages,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
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
};

export default nextConfig;
