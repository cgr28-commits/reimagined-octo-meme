/** Stroke icons for the mobile Owner Dashboard (24px grid, currentColor). */
import type { ReactElement, SVGProps } from "react";

type IconProps = { size?: number } & Omit<SVGProps<SVGSVGElement>, "width" | "height">;

function base(paths: ReactElement, { size = 22, strokeWidth = 1.9, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => base(<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />, p);
export const CalendarIcon = (p: IconProps) =>
  base(
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </>,
    p,
  );
export const ChatIcon = (p: IconProps) => base(<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5z" />, p);
export const MailIcon = (p: IconProps) =>
  base(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
    </>,
    p,
  );
export const PeopleIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.7 2.8 2.4 3 5.2" />
    </>,
    p,
  );
export const MoreIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </>,
    p,
  );
export const BellIcon = (p: IconProps) =>
  base(
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>,
    p,
  );
export const ClockIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
    p,
  );
export const CardIcon = (p: IconProps) =>
  base(
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M2.5 10h19" />
    </>,
    p,
  );
export const PhoneIcon = (p: IconProps) =>
  base(<path d="M5 3h3.5l2 5-2.5 1.5a11 11 0 0 0 6.5 6.5L16 13.5l5 2V19a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z" />, p);
export const NavigateIcon = (p: IconProps) => base(<path d="m3 11 18-8-8 18-2-8z" />, p);
export const CopyIcon = (p: IconProps) =>
  base(
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </>,
    p,
  );
export const SearchIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>,
    p,
  );
export const BackIcon = (p: IconProps) => base(<path d="m15 6-6 6 6 6" />, { strokeWidth: 2.2, ...p });
export const ChevronIcon = (p: IconProps) => base(<path d="m9 6 6 6-6 6" />, p);
export const SendIcon = (p: IconProps) => base(<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z" />, p);
export const ExternalIcon = (p: IconProps) => base(<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />, p);
export const AlertIcon = (p: IconProps) =>
  base(
    <>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4M12 17v.5" />
    </>,
    p,
  );
export const PlaneIcon = (p: IconProps) =>
  base(
    <>
      <path d="M2 16h20" />
      <path d="M5.5 13 3 8h2.5l2.5 3h5L10 3h3l5 8h2.5a1.5 1.5 0 0 1 0 3H8z" />
    </>,
    p,
  );
export const CheckIcon = (p: IconProps) => base(<path d="m5 12 5 5 9-10" />, { strokeWidth: 2.6, ...p });
