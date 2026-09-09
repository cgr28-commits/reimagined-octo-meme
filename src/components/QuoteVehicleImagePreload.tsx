"use client";

import { useEffect } from "react";
import { preload } from "react-dom";
import { quoteVehicleImageSrc } from "@/lib/quote-vehicle-image";

type Props = {
  vehicleType: string;
};

/**
 * Start fetching the selected Saloon/Estate quote image as soon as the vehicle
 * is known — before the result card mounts. Switching vehicle updates the
 * preload; we never preload the other type as the visible image.
 */
export default function QuoteVehicleImagePreload({ vehicleType }: Props) {
  const src = quoteVehicleImageSrc(vehicleType);

  if (src) {
    preload(src, { as: "image" });
  }

  useEffect(() => {
    if (!src || typeof document === "undefined") return;

    const existing = document.head.querySelector<HTMLLinkElement>(
      'link[rel="preload"][data-quote-vehicle-image="true"]',
    );
    const alreadyMatches =
      existing &&
      (existing.getAttribute("href") === src || existing.href.endsWith(src));
    if (!alreadyMatches) {
      existing?.remove();
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.type = "image/webp";
      link.href = src;
      link.setAttribute("data-quote-vehicle-image", "true");
      document.head.appendChild(link);
    }

    const img = new Image();
    img.decoding = "async";
    img.src = src;
  }, [src]);

  return null;
}
