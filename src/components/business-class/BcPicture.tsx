import { withBasePath } from "@/lib/paths";
import type { BcPhoto } from "@/lib/business-class-page-content";

const DIR = "/images/business-class";

function srcSet(baseName: string, ext: "avif" | "webp" | "jpg", widths: readonly number[]) {
  return widths.map((w) => `${withBasePath(`${DIR}/${baseName}-${w}.${ext}`)} ${w}w`).join(", ");
}

type Props = {
  photo: BcPhoto;
  sizes: string;
  className?: string;
  /** Hero only: eager, high fetch priority. Everything else lazy-loads. */
  priority?: boolean;
  /** Optional portrait art-direction below 768px (hero). */
  portrait?: { baseName: string; widths: readonly number[] };
  /** Decorative tone for placeholder panels. */
  tone?: "navy" | "midnight";
  /** Where the placeholder label sits (keep it clear of overlapping panels). */
  labelAt?: "bottom" | "top";
};

/**
 * Licensed photograph as AVIF/WebP/JPEG with explicit dimensions (no layout shift),
 * or — where the photograph is still to be sourced — a clearly labelled, art-directed
 * placeholder panel. Placeholders never claim to be a licensed photograph.
 */
export default function BcPicture({ photo, sizes, className = "", priority = false, portrait, tone = "navy", labelAt = "bottom" }: Props) {
  if (photo.kind === "placeholder") {
    return (
      <div
        role="img"
        aria-label={`Photograph to follow: ${photo.label}`}
        data-bc-photo-placeholder={photo.label}
        title={`Placeholder — photograph required: ${photo.brief}`}
        className={`bc-placeholder ${tone === "midnight" ? "bc-placeholder--midnight" : ""} ${labelAt === "top" ? "bc-placeholder--label-top" : ""} ${className}`}
      >
        <span className="bc-placeholder__frame" aria-hidden="true" />
        <span className="bc-placeholder__label" aria-hidden="true">
          <span className="bc-placeholder__tag">Photograph to follow</span>
          <span className="bc-placeholder__name">{photo.label}</span>
        </span>
      </div>
    );
  }
  const largest = photo.widths[photo.widths.length - 1];
  return (
    <picture>
      {portrait ? (
        <>
          <source media="(max-width: 767px)" type="image/avif" srcSet={srcSet(portrait.baseName, "avif", portrait.widths)} sizes="100vw" />
          <source media="(max-width: 767px)" type="image/webp" srcSet={srcSet(portrait.baseName, "webp", portrait.widths)} sizes="100vw" />
          <source media="(max-width: 767px)" srcSet={srcSet(portrait.baseName, "jpg", portrait.widths)} sizes="100vw" />
        </>
      ) : null}
      <source type="image/avif" srcSet={srcSet(photo.baseName, "avif", photo.widths)} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet(photo.baseName, "webp", photo.widths)} sizes={sizes} />
      <img
        src={withBasePath(`${DIR}/${photo.baseName}-${largest}.jpg`)}
        srcSet={srcSet(photo.baseName, "jpg", photo.widths)}
        sizes={sizes}
        width={photo.width}
        height={photo.height}
        alt={photo.alt}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        {...(priority ? { fetchPriority: "high" as const } : {})}
        className={className}
      />
    </picture>
  );
}
