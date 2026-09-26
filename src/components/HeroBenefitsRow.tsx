const BENEFITS = [
  {
    label: "Pre-booked driver",
    lines: ["Pre-booked", "driver"],
    icon: (
      <svg viewBox="0 0 24 24" fill="#ffffff" aria-hidden>
        <circle cx="12" cy="8" r="4.15" />
        <path d="M4.55 19.4c1-4.15 3.95-6.35 7.45-6.35s6.45 2.2 7.45 6.35c.1.45-.25.85-.72.85H5.27c-.47 0-.82-.4-.72-.85z" />
      </svg>
    ),
  },
  {
    label: "Fixed price",
    lines: ["Fixed", "price"],
    icon: (
      <svg className="hero-benefit-pound" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="#ffffff"
          fillRule="evenodd"
          d="M12.15 2.7c2.55 0 4.45 1.7 4.55 4.05.05 1.55-.7 2.65-2.35 3.4l-.55.25v1.35h3.35v2.15h-3.35v1.7h3.85v2.15H6.35v-2.15h3.15v-1.7H6.35v-2.15h2.55c.15-1.55.2-2.7.15-4.15-.1-2.15-1.55-3.7-3.7-4.15l.7-2.05c1.55.25 2.7.95 3.2 2.05.55-1.35 1.85-2.15 3.6-2.15zm-.05 2.15c-1.15 0-1.9.7-1.95 1.85-.05 1.05.15 1.85.55 2.55h2.55c.85-.45 1.3-1.05 1.25-1.9-.05-1.05-.85-1.7-1.85-1.7z"
        />
      </svg>
    ),
  },
  {
    label: "Flight monitoring",
    lines: ["Flight", "monitoring"],
    icon: (
      <svg viewBox="0 0 24 24" fill="#ffffff" aria-hidden>
        <path d="M21.2 16.15v-2.2L13.15 8.9V3.2c0-1.1-.9-2-2-2s-2 .9-2 2v5.7L1.1 13.95v2.2l8.05-2.55V19.2l-2.2 1.65v1.6l3.95-1.1 3.95 1.1v-1.6L13.15 19.2v-5.6l8.05 2.55z" />
      </svg>
    ),
  },
  {
    label: "Airport waiting included",
    lines: ["Airport", "waiting included"],
    icon: (
      <svg viewBox="0 0 24 24" fill="#ffffff" aria-hidden>
        <path
          fillRule="evenodd"
          d="M12 2.2a9.8 9.8 0 100 19.6 9.8 9.8 0 000-19.6zM5.55 12a6.45 6.45 0 1112.9 0 6.45 6.45 0 01-12.9 0z"
        />
        <path d="M13 6.55h-2v6.35l4.2 2.55 1-1.62-3.2-1.95V6.55z" />
      </svg>
    ),
  },
] as const;

/** Four-column hero trust row — labels stay real HTML text. */
export default function HeroBenefitsRow() {
  return (
    <ul
      className="hero-benefits-row mt-2.5 mb-[18px] grid grid-cols-4 md:mt-0 md:mb-5"
      aria-label="Why book with My Airport Taxi NI"
    >
      {BENEFITS.map((benefit, index) => {
        const waiting = benefit.label === "Airport waiting included";
        return (
          <li
            key={benefit.label}
            className={`flex min-w-0 flex-col items-center px-0.5 text-center sm:px-1 ${
              index > 0 ? "hero-benefit-divider" : ""
            }${waiting ? " hero-benefit-waiting" : ""}`}
          >
            <span className="hero-benefit-icon" aria-hidden>
              {benefit.icon}
            </span>
            <span
              className={`hero-benefit-label mt-1 min-h-[2.1rem] text-[0.8rem] font-semibold leading-[1.28] tracking-tight text-white md:mt-1.5 md:min-h-0 md:text-[0.85rem] md:leading-tight md:tracking-normal${
                waiting ? " hero-benefit-label-waiting" : ""
              }`}
            >
              <span className="md:hidden">
                {benefit.lines[0]}
                <br />
                <span className="hero-benefit-line-2">{benefit.lines[1]}</span>
              </span>
              <span className="hidden md:inline">{benefit.label}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
