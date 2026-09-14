/** Previously indexed transfer slugs that permanently redirect to a new canonical. */
export const TRANSFER_LEGACY_REDIRECTS = [
  { fromSlug: "newtownabbey-to-belfast-city", toSlug: "newtownabbey-to-belfast-city-airport" },
  { fromSlug: "newtownabbey-to-dublin", toSlug: "newtownabbey-to-dublin-airport" },
  { fromSlug: "lisburn-to-belfast-city", toSlug: "lisburn-to-belfast-city-airport" },
  { fromSlug: "lisburn-to-dublin", toSlug: "lisburn-to-dublin-airport" },
  { fromSlug: "bangor-to-belfast-city", toSlug: "bangor-to-belfast-city-airport" },
  { fromSlug: "bangor-to-dublin", toSlug: "bangor-to-dublin-airport" },
];

export function transferLegacyRedirectEntries() {
  return TRANSFER_LEGACY_REDIRECTS.flatMap(({ fromSlug, toSlug }) => {
    const destination = `/transfers/${toSlug}/`;
    return [
      { source: `/transfers/${fromSlug}`, destination, permanent: true },
      { source: `/transfers/${fromSlug}/`, destination, permanent: true },
    ];
  });
}
