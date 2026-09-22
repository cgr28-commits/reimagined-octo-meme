const BENEFITS = [
  {
    label: "Pre-booked driver",
    lines: ["Pre-booked", "driver"],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <circle cx="12" cy="8" r="3.7" />
        <path d="M5.1 19.2c.85-3.55 3.55-5.45 6.9-5.45s6.05 1.9 6.9 5.45c.12.5-.28.95-.8.95H5.9c-.52 0-.92-.45-.8-.95z" />
      </svg>
    ),
  },
  {
    label: "Fixed price",
    lines: ["Fixed", "price"],
    icon: (
      <span className="hero-benefit-pound" aria-hidden>
        £
      </span>
    ),
  },
  {
    label: "Flight monitoring",
    lines: ["Flight", "monitoring"],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16z" />
      </svg>
    ),
  },
  {
    label: "Airport waiting included",
    lines: ["Airport", "waiting included"],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path
          fillRule="evenodd"
          d="M12 3.25a8.75 8.75 0 100 17.5 8.75 8.75 0 000-17.5zM5.15 12a6.85 6.85 0 1113.7 0 6.85 6.85 0 01-13.7 0z"
        />
        <path d="M12.85 7.2h-1.7v5.55l3.55 2.15.9-1.48-2.75-1.66V7.2z" />
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
          <span className="mt-0.5 min-h-[1.55rem] text-[0.64rem] font-medium leading-[1.15] text-white/88 md:mt-1.5 md:min-h-0 md:text-[0.85rem] md:font-semibold md:leading-tight md:text-white">
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
