"use client";

import Image from "next/image";

/**
 * Source canvases are all 1400×700, but the cars occupy different fractions
 * of that canvas. Scale each asset so the vehicle itself, not the empty
 * margin, fills the same fixed frame.
 *
 * Option cards keep each vehicle fully inside the frame. The white studio
 * canvas is object-contain, so the car is not cropped or stretched.
 */
export const VEHICLE_ART_SCALE = {
  saloon: "scale-100",
  estate: "scale-100",
  executive: "scale-100",
  minibus: "scale-100",
} as const;

/** Full vehicle inside the fixed option frame. The frame itself does not grow. */
const OPTION_ART_BOX = {
  saloon: "h-full w-full",
  estate: "h-full w-full",
  executive: "h-full w-full",
  minibus: "h-full w-full",
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
      : "relative mx-auto h-[3.3rem] w-full max-w-[11.5rem]";
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
        sizes={size === "option" ? "184px" : "184px"}
        priority={size === "result"}
      />
    </span>
  );
}
