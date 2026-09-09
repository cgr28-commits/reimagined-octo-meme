"use client";

import { useEffect } from "react";
import { QUOTE_VEHICLE_IMAGES } from "@/lib/quote-vehicle-image";

/**
 * Warm both quote vehicle webps as soon as the quote form hydrates.
 * <link rel="preload"> discovers them early; new Image() is the Safari/iPhone
 * fetch that actually starts when the image is not yet on-screen.
 */
export default function QuoteVehicleImagePreload() {
  useEffect(() => {
    for (const src of QUOTE_VEHICLE_IMAGES) {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
    }
  }, []);

  return (
    <>
      {QUOTE_VEHICLE_IMAGES.map((src) => (
        <link key={src} rel="preload" as="image" type="image/webp" href={src} />
      ))}
    </>
  );
}
