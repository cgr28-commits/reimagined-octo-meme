const BENEFITS = [
  {
    label: "Reserved driver",
    lines: ["Reserved", "driver"],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 12a4.1 4.1 0 100-8.2 4.1 4.1 0 000 8.2z" />
        <path d="M5.2 19.6c.6-3.2 3.3-5.2 6.8-5.2s6.2 2 6.8 5.2c.1.6-.3 1.2-.9 1.2H6.1c-.6 0-1-.6-.9-1.2z" />
      </svg>
    ),
  },
  {
    label: "Fixed price",
    lines: ["Fixed", "price"],
    icon: (
      <span className="text-[1.05rem] font-bold leading-none" aria-hidden>
        £
      </span>
    ),
  },
  {
    label: "Flight monitoring",
    lines: ["Flight", "monitoring"],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M21.2 11.1c.7-.2 1.3.4 1.1 1.1l-.6 2.1c-.1.4-.5.7-.9.7l-6.1.3-2.8 5.3c-.2.4-.7.5-1.1.3l-1.3-.7c-.3-.2-.4-.6-.2-.9l2.1-4.3-4.8.2-1.6 1.7c-.2.2-.4.3-.7.3H3.1c-.4 0-.7-.4-.6-.8l.6-2.2c.1-.3.3-.5.6-.6l6.7-1.8L5.8 7.2c-.3-.4 0-.9.5-.9h1.5c.2 0 .5.1.6.3l3.3 3.7 5.4-1.5c.2 0 .3 0 .5.1l3.6 2.2z" />
      </svg>
    ),
  },
  {
    label: "Airport waiting included",
    lines: ["Airport", "waiting included"],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 3.4a8.6 8.6 0 100 17.2 8.6 8.6 0 000-17.2zm.7 8.7-2.8 1.7a.7.7 0 01-1-.3.7.7 0 01.2-.9l2.4-1.5V7.6c0-.4.3-.7.7-.7s.7.3.7.7v4.5z" />
      </svg>
    ),
  },
] as const;

/** Four-column hero trust row — labels stay real HTML text. */
export default function HeroBenefitsRow() {
  return (
    <ul
      className="hero-benefits-row mb-3 grid grid-cols-4 md:mb-5"
      aria-label="Why book with My Airport Taxi NI"
    >
      {BENEFITS.map((benefit, index) => (
        <li
          key={benefit.label}
          className={`flex min-w-0 flex-col items-center px-1 text-center ${
            index > 0 ? "hero-benefit-divider" : ""
          }`}
        >
          <span className="hero-benefit-icon" aria-hidden>
            {benefit.icon}
          </span>
          <span className="mt-1 min-h-[2rem] text-[0.7rem] font-semibold leading-[1.15] text-white md:mt-1.5 md:min-h-0 md:text-[0.85rem] md:leading-tight">
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
