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
        <path d="M21.2 11.1c.7-.2 1.3.4 1.1 1.1l-.6 2.1c-.1.4-.5.7-.9.7l-6.1.3-2.8 5.3c-.2.4-.7.5-1.1.3l-1.3-.7c-.3-.2-.4-.6-.2-.9l2.1-4.3-4.8.2-1.6 1.7c-.2.2-.4.3-.7.3H3.1c-.4 0-.7-.4-.6-.8l.6-2.2c.1-.3.3-.5.6-.6l6.7-1.8L5.8 7.2c-.3-.4 0-.9.5-.9h1.5c.2 0 .5.1.6.3l3.3 3.7 5.4-1.5c.2 0 .3 0 .5.1l3.6 2.2z" />
      </svg>
    );
  }
  if (id === "from-airport") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M2.8 12.9c-.7.2-1.3-.4-1.1-1.1l.6-2.1c.1-.4.5-.7.9-.7l6.1-.3 2.8-5.3c.2-.4.7-.5 1.1-.3l1.3.7c.3.2.4.6.2.9L12.6 8.9l4.8-.2 1.6-1.7c.2-.2.4-.3.7-.3h1.2c.4 0 .7.4.6.8l-.6 2.2c-.1.3-.3.5-.6.6l-6.7 1.8 4.6 4.4c.3.4 0 .9-.5.9h-1.5c-.2 0-.5-.1-.6-.3l-3.3-3.7-5.4 1.5c-.2 0-.3 0-.5-.1l-3.6-2.2z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 21.4s6.4-5.6 6.4-11A6.4 6.4 0 005.6 10.4c0 5.4 6.4 11 6.4 11zm0-8.6a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
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
        <span className="mt-0.5 block text-[0.72rem] leading-[1.25] text-white/62 sm:text-[0.8rem]">
          {description}
        </span>
      </span>
      <span className="journey-option-chevron" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M9 6l6 6-6 6" />
        </svg>
      </span>
    </button>
  );
}
