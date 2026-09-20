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
        <path d="M2.5 19.2h19v1.9h-19v-1.9zm16.85-9.55c-.2-.78-1.02-1.24-1.8-1.04L14.4 9.7 8.05 3.7l-1.1 1.05 3.2 6.05-6.85 1.68-1.85-1.5-1.32.72 2.55 4.15 10.85-2.35 5.38-1.45c.78-.2 1.24-1.02 1.04-1.8z" />
      </svg>
    );
  }
  if (id === "from-airport") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M2.5 19.2h19v1.9h-19v-1.9zm7.05-5.55 4.15 1.1 5.05 1.36c.78.2 1.58-.26 1.78-1.04.2-.78-.26-1.58-1.04-1.78l-5.05-1.36-2.62-8.55-1.42-.38v7.85L5.3 9.7l-.88-2.2-1.38-.38v4.92l1.52.4 5z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.4c-3.7 0-6.7 3-6.7 6.7 0 5.05 6.7 12.5 6.7 12.5s6.7-7.45 6.7-12.5c0-3.7-3-6.7-6.7-6.7zm0 9.05A2.4 2.4 0 1112 6.65a2.4 2.4 0 010 4.8z" />
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
        <span className="block text-[0.92rem] font-bold leading-tight text-white sm:text-base">
          {title}
        </span>
        <span className="mt-px block text-[0.72rem] leading-[1.22] text-white/62 sm:mt-0.5 sm:text-[0.8rem]">
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
