"use client";

import Image from "next/image";

/**
 * Source canvases are all 1400×700, but the cars occupy different fractions
 * of that canvas. Scale each asset so the vehicle itself, not the empty
 * margin, fills the same fixed frame.
 */
export const VEHICLE_ART_SCALE = {
  saloon: "scale-[0.96]",
  estate: "scale-[0.92]",
  executive: "scale-[1.16]",
  minibus: "scale-[1.17]",
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
      ? "relative h-16 w-[7.5rem] shrink-0"
      : "relative mx-auto h-10 w-full max-w-[8.75rem]";
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
        className={`h-full w-full object-contain object-center ${VEHICLE_ART_SCALE[vehicle]}`}
        sizes={size === "option" ? "120px" : "168px"}
        priority={size === "result"}
      />
    </span>
  );
}
