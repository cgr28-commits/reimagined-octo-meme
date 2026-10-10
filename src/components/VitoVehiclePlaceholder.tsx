import { withBasePath } from "@/lib/paths";

type Props = {
  compact?: boolean;
};

/** Representative Vito-style people carrier. A specific vehicle is not guaranteed. */
export default function VitoVehiclePlaceholder({ compact = false }: Props) {
  return (
    <figure
      className={`overflow-hidden rounded-2xl border border-white/15 bg-white ${
        compact ? "" : "mx-auto max-w-3xl"
      }`}
    >
      <img
        src={withBasePath("/images/vehicles/quote-minibus.webp")}
        alt="Representative black Mercedes-Benz Vito-style vehicle"
        width={1400}
        height={700}
        className={`w-full bg-white object-contain ${compact ? "max-h-40" : "h-auto max-h-72"}`}
      />
      <figcaption className="border-t border-white/10 bg-[#071c38] px-4 py-3 text-sm leading-snug text-white/80">
        Representative Mercedes-Benz Vito-style vehicle. The people carrier sent for a group
        transfer can vary.
      </figcaption>
    </figure>
  );
}
