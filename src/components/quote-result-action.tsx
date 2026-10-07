/**
 * Shared look for the four quote-result actions: navy panels with white icons.
 * The page behind them is already navy, so the panel is the lighter navy token.
 */
export const QUOTE_RESULT_ACTION_CLASS =
  "flex min-h-[3.85rem] w-full flex-col items-center justify-center gap-0.5 rounded-2xl border border-white/25 bg-navy-light px-2 py-1.5 text-center text-white shadow-sm transition-colors hover:border-white/45 hover:bg-[#14386a]";

export function QuoteResultActionIcon({
  name,
  className = "h-[1.15rem] w-[1.15rem] text-white",
}: {
  name: "route" | "save" | "restart" | "whatsapp";
  className?: string;
}) {
  if (name === "route") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 21s6-5.15 6-10a6 6 0 1 0-12 0c0 4.85 6 10 6 10Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle cx="12" cy="11" r="2.05" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === "save") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M7 4.75h10a1 1 0 0 1 1 1V19.5l-6-3.15-6 3.15V5.75a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "restart") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M19.25 12a7.25 7.25 0 1 1-2.05-5.05"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M19.25 4.6V8.1h-3.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12.04 3.2a8.7 8.7 0 0 0-7.48 13.1L3.4 20.6l4.42-1.16A8.7 8.7 0 1 0 12.04 3.2Zm4.86 12.28c-.2.56-1.16 1.02-1.62 1.08-.42.06-.96.08-1.55-.1-.36-.1-.82-.26-1.42-.5-2.5-1.08-4.12-3.6-4.24-3.76-.12-.18-1-1.34-1-2.56s.64-1.82.86-2.06c.22-.24.48-.3.64-.3h.46c.14 0 .34-.06.54.4.2.48.68 1.66.74 1.78.06.12.1.26.02.42-.08.16-.12.26-.24.4-.12.14-.26.32-.36.42-.12.12-.24.26-.1.5.14.24.62 1.02 1.34 1.66.92.82 1.7 1.08 1.94 1.2.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.4.66 1.64.78.24.12.4.18.46.28.06.1.06.58-.14 1.14Z"
      />
    </svg>
  );
}
