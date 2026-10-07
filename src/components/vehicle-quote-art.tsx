"use client";

import Image from "next/image";

/**
 * Source canvases are all 1400×700, but the cars occupy different fractions
 * of that canvas. Scale each asset so the vehicle itself, not the empty
 * margin, fills the same fixed frame.
 *
 * Option cards use a larger painted box (about 12% up on the previous
 * scales) sized from each vehicle's opaque bounds, then clip it. That keeps
 * Saloon, Estate, Business Class and the 7 Seater the same visual length
 * without a CSS scale() upscale, and without growing the card.
 */
export const VEHICLE_ART_SCALE = {
  saloon: "scale-[0.96]",
  estate: "scale-[0.92]",
  executive: "scale-[1.16]",
  minibus: "scale-[1.17]",
} as const;

/** Painted size inside the fixed option frame. The frame itself does not grow. */
const OPTION_ART_BOX = {
  saloon: "h-[107%] w-[107%]",
  estate: "h-[103%] w-[103%]",
  executive: "h-[130%] w-[130%]",
  minibus: "h-[132%] w-[132%]",
} as const;

export type VehicleArtId = keyof typeof VEHICLE_ART_SCALE;

export function VehicleQuoteArt({
  vehicle,
  src,
  alt,
  size,
}: {
  vehicle: VehicleArtId;
  src: string;
  alt: string;
  size: "option" | "result";
}) {
  const frame =
    size === "option"
      ? "relative h-[3.35rem] w-[6.4rem] shrink-0"
      : "relative mx-auto h-11 w-full max-w-[9.75rem]";
  return (
    <span
      className={`${frame} flex items-center justify-center overflow-hidden`}
      data-vehicle-art={vehicle}
      data-vehicle-art-size={size}
    >
      <Image
        src={src}
        alt={alt}
        width={1400}
        height={700}
        className={
          size === "option"
            ? `absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 object-contain object-center ${OPTION_ART_BOX[vehicle]}`
            : `h-full w-full object-contain object-center ${VEHICLE_ART_SCALE[vehicle]}`
        }
        sizes={size === "option" ? "184px" : "168px"}
        priority={size === "result"}
      />
    </span>
  );
}
