import { withBasePath } from "@/lib/paths";

const WIDTHS = [960, 1920] as const;

type Props = {
  /** Basename under /images/hero/optimized/{base}-{width}.{ext} */
  baseName: string;
  alt: string;
  priority?: boolean;
  className?: string;
  width?: number;
  height?: number;
};

function srcSet(baseName: string, ext: "avif" | "webp" | "jpg"): string {
  return WIDTHS.map(
    (w) => `${withBasePath(`/images/hero/optimized/${baseName}-${w}.${ext}`)} ${w}w`,
  ).join(", ");
}

export default function OptimizedHeroPicture({
  baseName,
  alt,
  priority = false,
  className = "absolute inset-0 h-full w-full object-cover",
  width = 1920,
  height = 1080,
}: Props) {
  return (
    <picture>
      <source type="image/avif" srcSet={srcSet(baseName, "avif")} sizes="100vw" />
      <source type="image/webp" srcSet={srcSet(baseName, "webp")} sizes="100vw" />
      <img
        src={withBasePath(`/images/hero/optimized/${baseName}-1920.jpg`)}
        srcSet={srcSet(baseName, "jpg")}
        sizes="100vw"
        width={width}
        height={height}
        alt={alt}
        fetchPriority={priority ? "high" : "auto"}
        decoding={priority ? "async" : "async"}
        loading={priority ? "eager" : "lazy"}
        className={className}
      />
    </picture>
  );
}
