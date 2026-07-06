type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "center" | "left";
  className?: string;
};

export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className = "",
}: SectionHeadingProps) {
  const alignClass = align === "center" ? "mx-auto text-center" : "text-left";

  return (
    <div className={`section-header max-w-2xl ${alignClass} ${className}`}>
      <p className="section-eyebrow">{eyebrow}</p>
      <h2 className="section-heading mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
        {title}
      </h2>
      {description ? (
        <p className="section-description mt-5 text-base leading-relaxed text-white/60">
          {description}
        </p>
      ) : null}
    </div>
  );
}
