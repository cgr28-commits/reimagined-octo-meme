"use client";

import { useState } from "react";
import Image from "next/image";
import { withBasePath } from "@/lib/paths";

interface LogoProps {
  className?: string;
  /** Dark-header PNG by default; use light on pale backgrounds. */
  theme?: "dark" | "light";
  /** Header/footer use the compact 124×96 asset; contact and large uses keep the original. */
  size?: "header" | "original";
  /** Eager-load only the visible header mark; footer and portals stay lazy. */
  priority?: boolean;
  /** Side-by-side lockup (car + plane beside the wordmark) — the current brand logo (Nov 2026). */
  wide?: boolean;
}

const HEADER_LOGO_WIDTH = 124;
const HEADER_LOGO_HEIGHT = 96;
const ORIGINAL_LOGO_WIDTH = 697;
const ORIGINAL_LOGO_HEIGHT = 541;
const WIDE_LOGO_WIDTH = 1011;
const WIDE_LOGO_HEIGHT = 177;

export default function Logo({
  className = "h-11",
  theme = "dark",
  size = "header",
  priority = false,
  wide = false,
}: LogoProps) {
  const [failed, setFailed] = useState(false);
  const compact = size === "header";
  const src = wide
    ? theme === "light"
      ? withBasePath("/logo-wide-light.webp")
      : withBasePath("/logo-header-wide.webp")
    : compact
    ? theme === "light"
      ? withBasePath("/logo-light-header.webp")
      : withBasePath("/logo-header.webp")
    : theme === "light"
      ? withBasePath("/logo-light.png")
      : withBasePath("/logo.png");

  if (failed) return (
    <span role="img" aria-label="My Airport Taxi NI" className={`${className} inline-flex items-center text-sm font-extrabold leading-tight text-white`}>
      MY AIRPORT<br />TAXI NI
    </span>
  );

  return (
    <Image
      src={src}
      onError={() => setFailed(true)}
      alt="My Airport Taxi NI"
      width={wide ? WIDE_LOGO_WIDTH : compact ? HEADER_LOGO_WIDTH : ORIGINAL_LOGO_WIDTH}
      height={wide ? WIDE_LOGO_HEIGHT : compact ? HEADER_LOGO_HEIGHT : ORIGINAL_LOGO_HEIGHT}
      className={`${className} w-auto shrink-0 object-contain`}
      priority={priority}
    />
  );
}
