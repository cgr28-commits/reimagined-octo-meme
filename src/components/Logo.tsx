import Image from "next/image";
import { withBasePath } from "@/lib/paths";

interface LogoProps {
  className?: string;
  /** Dark-header PNG by default; use light on pale backgrounds. */
  theme?: "dark" | "light";
}

const LOGO_WIDTH = 697;
const LOGO_HEIGHT = 541;

export default function Logo({
  className = "h-11",
  theme = "dark",
}: LogoProps) {
  const src =
    theme === "light"
      ? withBasePath("/logo-light.png")
      : withBasePath("/logo.png");

  return (
    <Image
      src={src}
      alt="My Airport Taxi NI"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      className={`${className} w-auto shrink-0 object-contain`}
      priority
    />
  );
}
