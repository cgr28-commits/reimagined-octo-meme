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
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M2.5 19h19v2h-19v-2z" />
        <path d="M22.07 9.64c-.21-.8-1.04-1.28-1.84-1.06L14.92 10 8 3.57 6.95 4.63l3.54 6.47-7.19 1.76-1.94-1.57-1.38.75L3.5 15.5l11.37-2.47 5.64-1.51c.8-.21 1.28-1.04 1.06-1.84z" />
      </svg>
    );
  }
  if (id === "from-airport") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M2.5 19h19v2h-19v-2z" />
        <g transform="translate(0.4 3.8) rotate(46 12.1 9.7)">
          <path d="M22.07 9.64c-.21-.8-1.04-1.28-1.84-1.06L14.92 10 8 3.57 6.95 4.63l3.54 6.47-7.19 1.76-1.94-1.57-1.38.75L3.5 15.5l11.37-2.47 5.64-1.51c.8-.21 1.28-1.04 1.06-1.84z" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.2c-3.65 0-6.6 2.95-6.6 6.6 0 4.95 6.6 12.95 6.6 12.95s6.6-8 6.6-12.95c0-3.65-2.95-6.6-6.6-6.6zm0 8.95a2.4 2.4 0 110-4.8 2.4 2.4 0 010 4.8z" />
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
      className={`journey-option-card ${selected ? "quote-choice-selected journey-option-card-selected" : ""}`}
    >
      <span className="journey-option-icon" aria-hidden>
        <JourneyIcon id={id} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[0.9rem] font-semibold leading-tight text-white sm:text-base">
          {title}
        </span>
        <span className="mt-0.5 block text-[0.72rem] leading-[1.25] text-white/64 sm:mt-0.5 sm:text-[0.8rem]">
          {description}
        </span>
      </span>
      <span className="journey-option-chevron" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" d="M9 6l6 6-6 6" />
        </svg>
      </span>
    </button>
  );
}
