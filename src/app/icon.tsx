import type { SVGProps } from "react";

const paths = {
  base: "M7 35.8H42.5C47 35.8 51.5 34.8 55.5 32.2",
  car: "M10.5 34.8H46.5C48.8 34.8 50.5 33.2 50.5 31V24.5C50.5 22.2 49.5 20 47.8 18.5L44.5 14.5C43.2 12.8 41.2 11.8 39 11.8H37.5L36.3 9.2C35.8 8.2 34.8 7.5 33.5 7.5H22.5C21.2 7.5 20.2 8.2 19.7 9.2L18.5 11.8H17C14.8 11.8 12.8 12.8 11.5 14.5L8.2 18.5C6.5 20 5.5 22.2 5.5 24.5V31C5.5 33.2 7.2 34.8 9.5 34.8H10.5Z",
  swoosh: "M54 31.5C60 28.5 67.5 22 74.5 13.5",
  plane: "M56.5 22.5L60.5 12.5L86.5 18.5L81.5 21.5L76.5 20.5L71.5 24.5L66.5 23.5L56.5 24.5V22.5Z",
  tail: "M62.5 15.5L64.5 11.5L67.5 14.5L62.5 15.5Z",
  wing: "M74.5 17.5L88.5 15.5L86.5 18.5L74.5 19.5V17.5Z",
};

export default function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect width="48" height="48" rx="12" fill="#071c38" />
      <g transform="translate(3.5 9.5) scale(0.43)">
        <path d={paths.base} stroke="#4dd964" strokeWidth="3.4" strokeLinecap="round" />
        <path fill="#ffffff" d={paths.car} />
        <rect x="3.2" y="16.8" width="3.2" height="4.8" rx="1.2" fill="#ffffff" />
        <rect x="49.8" y="16.8" width="3.2" height="4.8" rx="1.2" fill="#ffffff" />
        <path fill="#2fbf4a" d="M24.8 5.8H31.2L32 8.2H23.9L24.8 5.8Z" />
        <path fill="#071c38" d="M15.8 13.2H39.2L36.8 17.4H18.2L15.8 13.2Z" />
        <rect x="20.8" y="23.2" width="14.4" height="1.8" rx="0.3" fill="#071c38" />
        <rect x="11.8" y="27.4" width="7.2" height="2.1" rx="0.4" fill="#071c38" />
        <rect x="37" y="27.4" width="7.2" height="2.1" rx="0.4" fill="#071c38" />
        <path d={paths.swoosh} stroke="#4dd964" strokeWidth="2.3" strokeLinecap="round" />
        <path fill="#2fbf4a" d={paths.plane} />
        <path fill="#2fbf4a" d={paths.tail} />
        <path fill="#2fbf4a" d={paths.wing} />
      </g>
    </svg>
  );
}
