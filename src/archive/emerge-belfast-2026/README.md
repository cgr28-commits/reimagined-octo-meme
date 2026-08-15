# EMERGE Belfast 2026 campaign archive

Preserved for **2027 reuse**. Do not delete this folder.

The live public URL stays:

`https://www.myairporttaxini.co.uk/events/emerge-belfast-taxi/`

There is **no permanent 301**. After `expiresOn` (`2026-08-31`, Europe/London inclusive), the live route soft-switches to a noindex “event ended” page. Homepage promo, airport/transfer discovery links and the sitemap entry are hidden. The complete 2026 landing source, design (`.emerge-page` CSS), SEO copy and QuoteCard / SumUp integration remain here and in the live tree.

## Files in this archive

| File | Purpose |
| --- | --- |
| `emerge-belfast-config.json` | Year, expiry, path, venue, destination prefill |
| `lib-emerge-belfast.ts` | Copy, FAQs, WhatsApp message, Service JSON-LD helpers |
| `EmergeBelfastPageClient.tsx` | Full campaign landing UI + QuoteCard destination prefill |
| `EmergePromoCard.tsx` | Homepage promo (date-gated) |
| `EmergeDiscoveryPromo.tsx` | Airport / transfer internal links (date-gated) |
| `page.tsx` | Route entry (metadata + Header/Footer wiring) |
| `emerge-page.css` | Namespaced festival styles from `globals.css` |

## How to revive for 2027

1. Update `src/lib/emerge-belfast-config.json` with the new year, event dates, venue (if needed) and a new `expiresOn`.
2. Refresh copy in `src/lib/emerge-belfast.ts` / `EmergeBelfastPageClient.tsx` from this archive as a starting point (dates, FAQs, festival info panel).
3. Keep the same path `/events/emerge-belfast-taxi/` so Ads and bookmarks continue to work.
4. Confirm QuoteCard still prefills the destination and SumUp / WhatsApp behaviour is unchanged.
5. Create `src/archive/emerge-belfast-2027/` the same way when that campaign ships.
6. Redeploy so sitemap generation and `generateMetadata` robots rules pick up the new active window.

## Pricing / booking

Do not invent prices. The campaign page reuses the site `QuoteCard` and existing SumUp payment flow (`initialDropoffHint` / destination prefill only).
