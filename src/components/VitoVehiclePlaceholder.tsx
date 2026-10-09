type Props = {
  compact?: boolean;
};

/** Stand-in until a licensed photograph of the operator's Vito is available. */
export default function VitoVehiclePlaceholder({ compact = false }: Props) {
  return (
    <figure
      className={`overflow-hidden rounded-2xl border border-white/15 bg-[#041428] ${
        compact ? "" : "mx-auto max-w-3xl"
      }`}
    >
      <div
        className={`flex items-center justify-center px-6 ${compact ? "h-36 sm:h-40" : "aspect-[16/9] max-h-64"}`}
        role="img"
        aria-label="Placeholder for a Mercedes-Benz Vito photograph"
      >
        <svg viewBox="0 0 220 90" className="h-16 w-auto text-white/80 sm:h-20" aria-hidden>
          <path
            fill="currentColor"
            d="M28 58c-8 0-14-6-14-14v-6l16-16h78l22 16h48c8 0 14 6 14 14v6c0 8-6 14-14 14H28z"
          />
          <path fill="#071C38" d="M48 46h36v-14H58zM96 46h28l-8-14H96z" />
          <circle cx="58" cy="62" r="8" fill="#2FBF4A" />
          <circle cx="168" cy="62" r="8" fill="#2FBF4A" />
        </svg>
      </div>
      <figcaption className="border-t border-white/10 px-4 py-3 text-sm leading-snug text-white/70">
        Mercedes-Benz Vito photograph to follow. This box is a placeholder, not a picture of a
        specific vehicle.
      </figcaption>
    </figure>
  );
}
