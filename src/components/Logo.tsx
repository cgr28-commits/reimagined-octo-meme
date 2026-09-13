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
}

const HEADER_LOGO_WIDTH = 124;
const HEADER_LOGO_HEIGHT = 96;
const ORIGINAL_LOGO_WIDTH = 697;
const ORIGINAL_LOGO_HEIGHT = 541;

export default function Logo({
  className = "h-11",
  theme = "dark",
  size = "header",
  priority = false,
}: LogoProps) {
  const compact = size === "header";
  const src = compact
    ? theme === "light"
      ? withBasePath("/logo-light-header.webp")
      : withBasePath("/logo-header.webp")
    : theme === "light"
      ? withBasePath("/logo-light.png")
      : withBasePath("/logo.png");

  return (
    <Image
      src={src}
      alt="My Airport Taxi NI"
      width={compact ? HEADER_LOGO_WIDTH : ORIGINAL_LOGO_WIDTH}
      height={compact ? HEADER_LOGO_HEIGHT : ORIGINAL_LOGO_HEIGHT}
      className={`${className} w-auto shrink-0 object-contain`}
      priority={priority}
    />
  );
}
