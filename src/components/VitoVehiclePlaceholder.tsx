import DesktopVehicleSources from "./DesktopVehicleSources";
import { withBasePath } from "@/lib/paths";

type Props = {
  compact?: boolean;
};

/** Representative 7-seater people carrier. A specific vehicle is not guaranteed. */
export default function VitoVehiclePlaceholder({ compact = false }: Props) {
  return (
    <figure
      className={`desktop-vito-figure overflow-hidden rounded-2xl border border-white/15 bg-white ${
        compact ? "" : "mx-auto max-w-3xl"
      }`}
    >
      <picture className="contents">
      <DesktopVehicleSources vehicle="minibus" sizes={compact ? "40vw" : "768px"} />
      <img
        src={withBasePath("/images/vehicles/quote-minibus.webp")}
        alt="Representative black 7-seater people carrier"
        width={1400}
        height={700}
        className={`w-full bg-white object-contain ${compact ? "max-h-40" : "h-auto max-h-72"}`}
      />
      </picture>
      <figcaption className="border-t border-white/10 bg-[#071c38] px-4 py-3 text-sm leading-snug text-white/80">
        Representative 7-seater. The people carrier sent for a group
        transfer can vary.
      </figcaption>
    </figure>
  );
}
