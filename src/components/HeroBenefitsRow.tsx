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
      <svg className="hero-benefit-pound" viewBox="0 0 24 24" fill="#ffffff" aria-hidden>
        <path d="M13.15 3.2c1.2 0 2.28.35 3.15 1l-1.28 1.82c-.52-.38-1.15-.6-1.85-.6-1.12 0-1.82.68-1.95 1.72-.06.42 0 .82.15 1.18h5.15v2.15h-4.95c.06.5.08 1 .02 1.48h5.1v2.15h-5.2c-.22 1.12-.78 2.05-1.68 2.65H18.2v2.22H5.7v-2.02c1.18-.28 1.98-.98 2.35-2.05.2-.55.3-1.15.35-1.8H5.85v-2.15h2.5c0-.5-.03-1-.1-1.48H5.7V8.62h2.72c.04-.45.14-.88.28-1.28C9.1 4.95 10.75 3.2 13.15 3.2z" />
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
          <span className="hero-benefit-label mt-1 min-h-[1.7rem] text-[0.68rem] font-semibold leading-[1.22] text-white md:mt-1.5 md:min-h-0 md:text-[0.85rem] md:leading-tight">
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
