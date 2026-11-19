import type { AirportPageHero } from "@/lib/airport-page-hero";
import { withBasePath } from "@/lib/paths";

/**
 * Laptops 1200px+ and short phones keep the transparent pixel, so the photo is never downloaded
 * there. Must match the height threshold in airport-page-hero.css.
 */
const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICTAEAOw==";

const PHONE = "(max-width: 767.98px) and (min-height: 700px)";
const TABLET = "(min-width: 768px) and (max-width: 1199.98px)";

/**
 * Airport guide pages, Design 3 only: phone banner and tablet photo hero.
 * Hidden by default; shown and positioned by airport-page-hero.css.
 */
export default function AirportPageHeroPhoto({ baseName, badge }: AirportPageHero) {
  const src = (variant: "phone" | "tablet", ext: "avif" | "webp" | "jpg") =>
    withBasePath(`/images/hero/optimized/${baseName}-${variant}.${ext}`);
  return (
    <div data-airport-hero className="hidden" aria-hidden="true">
      <picture>
        <source media={PHONE} type="image/avif" srcSet={src("phone", "avif")} />
        <source media={PHONE} type="image/webp" srcSet={src("phone", "webp")} />
        <source media={PHONE} srcSet={src("phone", "jpg")} />
        <source media={TABLET} type="image/avif" srcSet={src("tablet", "avif")} />
        <source media={TABLET} type="image/webp" srcSet={src("tablet", "webp")} />
        <source media={TABLET} srcSet={src("tablet", "jpg")} />
        <img
          src={TRANSPARENT_PIXEL}
          alt=""
          width={960}
          height={640}
          fetchPriority="high"
          decoding="async"
          data-airport-hero-img
        />
      </picture>
      <span data-airport-hero-badge>{badge}</span>
    </div>
  );
}
