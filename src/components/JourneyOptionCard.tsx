import type { PointerEvent } from "react";
import type { QuoteJourneyIntent } from "@/lib/quote-journey-intent";

type Props = {
  id: QuoteJourneyIntent;
  title: string;
  description: string;
  selected: boolean;
  onSelect: (id: QuoteJourneyIntent) => void;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
};

function JourneyIcon({ id }: { id: QuoteJourneyIntent }) {
  if (id === "to-airport") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          d="M3.5 13.5l7.2-2.1L8 4.5l2.1-.6 4.4 6.3 4.6-1.3a1.8 1.8 0 11.9 3.4L3.8 16.8 3.5 13.5z"
        />
      </svg>
    );
  }
  if (id === "from-airport") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          d="M21 10.2l-7.1 2.2 2.7 7.1-2.1.6-4.5-6.4-4.6 1.4a1.8 1.8 0 11-.9-3.5l11.7-3.6 1.8 2.2z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        d="M12 21s6-5.2 6-10.2A6 6 0 006 10.8C6 15.8 12 21 12 21z"
      />
      <circle cx="12" cy="10.6" r="1.8" strokeWidth="1.8" />
    </svg>
  );
}

export default function JourneyOptionCard({
  id,
  title,
  description,
  selected,
  onSelect,
  onPointerDown,
}: Props) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onPointerDown={onPointerDown}
      onClick={() => onSelect(id)}
      className={`journey-option-card ${selected ? "journey-option-card-selected" : ""}`}
    >
      <span className="journey-option-icon" aria-hidden>
        <JourneyIcon id={id} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[0.95rem] font-bold leading-tight text-white sm:text-base">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-white/62 sm:text-[0.8rem]">
          {description}
        </span>
      </span>
      <span className="journey-option-chevron" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 6l6 6-6 6" />
        </svg>
      </span>
    </button>
  );
}
