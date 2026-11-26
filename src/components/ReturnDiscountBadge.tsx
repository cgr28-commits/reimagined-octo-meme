"use client";

import { returnDiscountBadgeText, useReturnDiscountPercent } from "@/lib/use-return-discount-percent";

/** "5% off" / "Save 5%" badge on a Return button — renders nothing while the return discount is 0%. */
export default function ReturnDiscountBadge({ style = "off", className }: { style?: "off" | "save"; className: string }) {
  const text = returnDiscountBadgeText(useReturnDiscountPercent(), style);
  if (!text) return null;
  return <span className={className}>{text}</span>;
}
