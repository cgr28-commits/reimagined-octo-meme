import { withBasePath } from "@/lib/paths";

const DEFAULT_WIDTHS = [960, 1920] as const;

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
}: Props) {
  const fallbackWidth = widths[widths.length - 1] ?? 1920;
  const set = (ext: "avif" | "webp" | "jpg") => srcSet(baseName, ext, widths);

  return (
    <picture>
      <source type="image/avif" srcSet={set("avif")} sizes="100vw" />
      <source type="image/webp" srcSet={set("webp")} sizes="100vw" />
      <img
        src={withBasePath(`/images/hero/optimized/${baseName}-${fallbackWidth}.jpg`)}
        srcSet={set("jpg")}
        sizes="100vw"
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
