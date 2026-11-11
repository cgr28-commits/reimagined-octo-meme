import { SITE } from "@/lib/data";

/** Same telephone button everywhere: site header, booking steps 2 and 3, mobile header. */
export const CALL_US_HREF = "tel:+442896022952";

type Props = {
  /** "header": main site header (desktop). "booking": vehicle and checkout steps. "compact": mobile header. */
  variant?: "header" | "booking" | "compact";
  className?: string;
};

export default function CallUsButton({ variant = "header", className }: Props) {
  return (
    <a
      href={CALL_US_HREF}
      data-call-us-pill={variant}
      data-results-desktop-phone={variant === "booking" ? "" : undefined}
      aria-label={`Call us on ${SITE.officeLandlineDisplay}`}
      className={className}
    >
      <svg
        data-phone-icon
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
      </svg>
      <span data-phone-label>Call Us</span>
      <span data-phone-number>{SITE.officeLandlineDisplay}</span>
    </a>
  );
}
