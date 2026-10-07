/** Small line icons used beside luggage and premium wording on quote vehicle cards. */

export function QuoteSuitcaseIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={`${className} shrink-0 text-current`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7.5 8.5h9A1.5 1.5 0 0 1 18 10v8.5A1.5 1.5 0 0 1 16.5 20h-9A1.5 1.5 0 0 1 6 18.5V10A1.5 1.5 0 0 1 7.5 8.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M9.5 8.5V6.75A1.25 1.25 0 0 1 10.75 5.5h2.5A1.25 1.25 0 0 1 14.5 6.75V8.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function QuoteCrownIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={`${className} shrink-0 text-current`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 16.75 6.15 8.4 9.4 12.1 12 5.75l2.6 6.35 3.25-3.7L20 16.75"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4.75 19.25h14.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
