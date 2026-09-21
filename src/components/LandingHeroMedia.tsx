import OptimizedHeroPicture from "@/components/OptimizedHeroPicture";

type Props = {
  /** Optimized hero basename. Omit or leave empty to collapse the media slot. */
  baseName?: string;
  alt?: string;
  /** Airport guides use a slightly taller frame than town/route pages. */
  variant?: "default" | "airport";
};

/**
 * Landing hero photograph. Renders nothing when no image is configured,
 * so pages without a photo do not reserve an empty image-sized band.
 */
export default function LandingHeroMedia({
  baseName,
  alt,
  variant = "default",
}: Props) {
  if (!baseName || !alt) return null;

  const frameClass =
    variant === "airport"
      ? "relative h-64 overflow-hidden sm:h-80 lg:h-[22rem]"
      : "relative h-56 overflow-hidden sm:h-72";

  return (
    <div className={frameClass} data-landing-hero>
      <OptimizedHeroPicture baseName={baseName} alt={alt} priority />
      {variant === "airport" ? (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/50 to-navy/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-navy/60 via-transparent to-navy/40" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/55 to-navy/25" />
      )}
    </div>
  );
}
