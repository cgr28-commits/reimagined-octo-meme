type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "center" | "left";
  className?: string;
  /** Page heroes should use h1; section blocks keep the default h2. */
  as?: "h1" | "h2";
  /** Stable site-nav target id for measured-header scrolling. */
  navId?: string;
};

export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className = "",
  as = "h2",
  navId,
}: SectionHeadingProps) {
  const alignClass = align === "center" ? "mx-auto text-center" : "text-left";
  const HeadingTag = as;

  return (
    <div className={`section-header max-w-2xl lg:max-w-3xl ${alignClass} ${className}`}>
      <p className="section-eyebrow">{eyebrow}</p>
      <HeadingTag
        className="section-heading mt-4 text-3xl font-bold tracking-tight text-white outline-none sm:text-4xl lg:text-[2.75rem] lg:leading-tight"
        {...(navId
          ? {
              "data-site-nav-heading": navId,
              tabIndex: -1 as const,
            }
          : {})}
      >
        {title}
      </HeadingTag>
      {description ? (
        <p className="section-description mt-5 text-base leading-relaxed text-white/60 lg:mt-6 lg:text-[1.0625rem] lg:leading-relaxed">
          {description}
        </p>
      ) : null}
    </div>
  );
}
