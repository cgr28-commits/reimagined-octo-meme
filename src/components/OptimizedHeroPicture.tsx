import { withBasePath } from "@/lib/paths";

const DEFAULT_WIDTHS = [960, 1920] as const;

/** 1×1 gif so a desktop-only hero does not download on a phone. */
const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICTAEAOw==";

type Props = {
  /** Basename under /images/hero/optimized/{base}-{width}.{ext} */
  baseName: string;
  alt: string;
  priority?: boolean;
  className?: string;
  width?: number;
  height?: number;
  /**
   * Widths that exist on disk for this basename.
   * Defaults to 960 and 1920 so landing heroes stay unchanged.
   */
  widths?: readonly number[];
  /**
   * Load the photograph only at this viewport width and above.
   * Narrower screens keep the img as a transparent pixel.
   */
  loadFromMinWidth?: number;
};

function srcSet(baseName: string, ext: "avif" | "webp" | "jpg", widths: readonly number[]): string {
  return widths
    .map((w) => `${withBasePath(`/images/hero/optimized/${baseName}-${w}.${ext}`)} ${w}w`)
    .join(", ");
}

export default function OptimizedHeroPicture({
  baseName,
  alt,
  priority = false,
  className = "absolute inset-0 h-full w-full object-cover",
  width = 1920,
  height = 1080,
  widths = DEFAULT_WIDTHS,
  loadFromMinWidth,
}: Props) {
  const fallbackWidth = widths[widths.length - 1] ?? 1920;
  const set = (ext: "avif" | "webp" | "jpg") => srcSet(baseName, ext, widths);
  const media = loadFromMinWidth ? `(min-width: ${loadFromMinWidth}px)` : undefined;
  const desktopOnly = Boolean(loadFromMinWidth);

  return (
    <picture>
      <source {...(media ? { media } : {})} type="image/avif" srcSet={set("avif")} sizes="100vw" />
      <source {...(media ? { media } : {})} type="image/webp" srcSet={set("webp")} sizes="100vw" />
      {desktopOnly ? <source media={media} srcSet={set("jpg")} sizes="100vw" /> : null}
      <img
        src={
          desktopOnly
            ? TRANSPARENT_PIXEL
            : withBasePath(`/images/hero/optimized/${baseName}-${fallbackWidth}.jpg`)
        }
        {...(desktopOnly ? {} : { srcSet: set("jpg"), sizes: "100vw" })}
        width={width}
        height={height}
        alt={alt}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        className={className}
      />
    </picture>
  );
}
