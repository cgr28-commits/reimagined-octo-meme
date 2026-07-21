"use client";

import Link from "next/link";
import { SITE } from "@/lib/data";
import { useIsMobileDevice } from "@/lib/device";

type DeviceBookingCtaProps = {
  whatsappMessage: string;
  desktopHref?: string;
  mobileLabel: string;
  desktopLabel: string;
  className?: string;
};

export default function DeviceBookingCta({
  whatsappMessage,
  desktopHref = "/#quote",
  mobileLabel,
  desktopLabel,
  className = "inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald px-4 py-2.5 text-sm font-semibold text-navy transition-all hover:bg-emerald-light",
}: DeviceBookingCtaProps) {
  const isMobile = useIsMobileDevice();

  if (isMobile === true) {
    return (
      <a
        href={`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(whatsappMessage)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {mobileLabel}
      </a>
    );
  }

  return (
    <Link href={desktopHref} className={className}>
      {desktopLabel}
    </Link>
  );
}
