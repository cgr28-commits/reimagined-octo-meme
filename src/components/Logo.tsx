import LogoMark from "./LogoMark";

interface LogoProps {
  className?: string;
}

export default function Logo({ className = "h-10" }: LogoProps) {
  return (
    <div className={`flex shrink-0 items-center gap-3 ${className}`}>
      <LogoMark className="h-full w-auto max-h-10" />
      <div className="leading-none">
        <span className="block text-[11px] font-extrabold tracking-[0.12em] text-white sm:text-xs">
          MY AIRPORT
        </span>
        <span className="mt-1 block text-[11px] font-extrabold tracking-[0.12em] sm:text-xs">
          <span className="text-white">TAXI </span>
          <span className="text-emerald">NI</span>
        </span>
      </div>
    </div>
  );
}
