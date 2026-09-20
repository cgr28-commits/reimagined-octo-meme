const BENEFITS = [
  {
    label: "Reserved driver",
    lines: ["Reserved", "driver"],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 12c2.3 0 4.15-1.85 4.15-4.15S14.3 3.7 12 3.7 7.85 5.55 7.85 7.85 9.7 12 12 12z" />
        <path d="M4.4 19.35c.7-3.45 3.7-5.55 7.6-5.55s6.9 2.1 7.6 5.55c.12.58-.34 1.15-.93 1.15H5.33c-.59 0-1.05-.57-.93-1.15z" />
      </svg>
    ),
  },
  {
    label: "Fixed price",
    lines: ["Fixed", "price"],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M8.15 20.2V18.9c1.55-.18 2.38-1.05 2.55-2.4l.22-1.9H8.4v-1.55h2.7l.42-3.55c.28-2.2 1.72-3.5 4.05-3.5 1.2 0 2.25.38 3 .98l-.88 1.42c-.52-.42-1.22-.68-2-.68-1.15 0-1.85.62-2 1.88l-.4 3.45h3.45v1.55h-3.62l-.22 1.85c-.2 1.22-.78 2.08-1.82 2.55.68.1 1.42.18 2.22.18h3.15v1.5H8.15z" />
      </svg>
    ),
  },
  {
    label: "Flight monitoring",
    lines: ["Flight", "monitoring"],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M21 15.7v-1.7l-7.4-4.6V4.4c0-.77-.62-1.4-1.4-1.4s-1.4.63-1.4 1.4v5l-7.4 4.6v1.7l7.4-2.3v4.9l-1.85 1.4V21l3.25-.95L17.25 21v-1.3l-1.85-1.4v-4.9L21 15.7z" />
      </svg>
    ),
  },
  {
    label: "Airport waiting included",
    lines: ["Airport", "waiting included"],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2.2C6.65 2.2 2.2 6.65 2.2 12S6.65 21.8 12 21.8 21.8 17.35 21.8 12 17.35 2.2 12 2.2zm.75 10.35-3.55 2.15a.85.85 0 01-1.16-.35.85.85 0 01.28-1.14l3.05-1.85V6.9c0-.47.38-.85.85-.85s.85.38.85.85v5.65z" />
      </svg>
    ),
  },
] as const;

/** Four-column hero trust row — labels stay real HTML text. */
export default function HeroBenefitsRow() {
  return (
    <ul
      className="hero-benefits-row mb-2 grid grid-cols-4 md:mb-5"
      aria-label="Why book with My Airport Taxi NI"
    >
      {BENEFITS.map((benefit, index) => (
        <li
          key={benefit.label}
          className={`flex min-w-0 flex-col items-center px-0.5 text-center sm:px-1 ${
            index > 0 ? "hero-benefit-divider" : ""
          }`}
        >
          <span className="hero-benefit-icon" aria-hidden>
            {benefit.icon}
          </span>
          <span className="mt-0.5 min-h-[1.7rem] text-[0.7rem] font-semibold leading-[1.15] text-white md:mt-1.5 md:min-h-0 md:text-[0.85rem] md:leading-tight">
            <span className="md:hidden">
              {benefit.lines[0]}
              <br />
              {benefit.lines[1]}
            </span>
            <span className="hidden md:inline">{benefit.label}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
