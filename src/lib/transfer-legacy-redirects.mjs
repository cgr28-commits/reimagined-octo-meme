import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Previously indexed transfer slugs that permanently redirect to a new canonical. */
export const TRANSFER_LEGACY_REDIRECTS = [
  { fromSlug: "newtownabbey-to-belfast-city", toSlug: "newtownabbey-to-belfast-city-airport" },
  { fromSlug: "newtownabbey-to-dublin", toSlug: "newtownabbey-to-dublin-airport" },
  { fromSlug: "lisburn-to-belfast-city", toSlug: "lisburn-to-belfast-city-airport" },
  { fromSlug: "lisburn-to-dublin", toSlug: "lisburn-to-dublin-airport" },
  { fromSlug: "bangor-to-belfast-city", toSlug: "bangor-to-belfast-city-airport" },
  { fromSlug: "bangor-to-dublin", toSlug: "bangor-to-dublin-airport" },
];

const SITE_URL = "https://www.myairporttaxini.co.uk";

export function transferLegacyRedirectEntries() {
  return TRANSFER_LEGACY_REDIRECTS.flatMap(({ fromSlug, toSlug }) => {
    const destination = `/transfers/${toSlug}/`;
    return [
      { source: `/transfers/${fromSlug}`, destination, permanent: true },
      { source: `/transfers/${fromSlug}/`, destination, permanent: true },
    ];
  });
}

/**
 * GitHub Pages static export cannot apply next.config redirects()
 * (those are disabled when GITHUB_PAGES=true and output is `export`).
 * Pages also cannot emit HTTP 301 for missing paths — it serves 404.html.
 * Write a noindex + canonical + refresh file at each legacy slug so the
 * live host stops serving an unstyled 404 at those URLs.
 */
export function githubPagesLegacyRedirectHtml(toSlug, siteUrl = SITE_URL) {
  const destPath = `/transfers/${toSlug}/`;
  const destAbs = `${siteUrl}${destPath}`;
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <title>Redirecting</title>
  <link rel="canonical" href="${destAbs}">
  <meta name="robots" content="noindex, follow">
  <meta http-equiv="refresh" content="0;url=${destPath}">
  <script>location.replace(${JSON.stringify(destPath)});</script>
</head>
<body>
  <p><a href="${destPath}">Continue to this transfer page</a></p>
</body>
</html>
`;
}

export function writeGitHubPagesLegacyRedirects(outDir, siteUrl = SITE_URL) {
  for (const { fromSlug, toSlug } of TRANSFER_LEGACY_REDIRECTS) {
    const dir = join(outDir, "transfers", fromSlug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), githubPagesLegacyRedirectHtml(toSlug, siteUrl));
  }
}
