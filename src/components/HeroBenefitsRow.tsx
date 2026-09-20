const BENEFITS = [
  {
    label: "Reserved driver",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM6 20a6 6 0 1112 0"
        />
      </svg>
    ),
  },
  {
    label: "Fixed price",
    icon: (
      <span className="text-[1.1rem] font-bold leading-none" aria-hidden>
        £
      </span>
    ),
  },
  {
    label: "Flight monitoring",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          d="M3.5 13.5l7.2-2.1L8 4.5l2.1-.6 4.4 6.3 4.6-1.3a1.8 1.8 0 11.9 3.4L3.8 16.8 3.5 13.5zM10 18.5l2.2-2.4"
        />
      </svg>
    ),
  },
  {
    label: "Airport waiting included",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          d="M12 7.5V12l2.6 1.6M12 21a8.5 8.5 0 100-17 8.5 8.5 0 000 17z"
        />
      </svg>
    ),
  },
] as const;

/** Four-column hero trust row — labels stay real HTML text. */
export default function HeroBenefitsRow() {
  return (
    <ul
      className="hero-benefits-row mb-5 grid grid-cols-4 md:mb-6"
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
          <span className="mt-1.5 max-w-[4.6rem] text-[0.7rem] font-semibold leading-tight text-white sm:max-w-none sm:text-[0.8rem] md:text-[0.85rem]">
            {benefit.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
