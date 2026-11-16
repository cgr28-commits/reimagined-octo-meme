import type { Metadata } from "next";
import DublinCityTransferLanding from "@/components/DublinCityTransferLanding";
import { DUBLIN_TO_BELFAST_PAGE as page, DUBLIN_TO_BELFAST_PATH as path } from "@/lib/dublin-to-belfast-content";

// The title is already a full route query, so no brand suffix (same rule as the Dublin Airport pages).
export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  alternates: { canonical: path },
  openGraph: {
    title: page.title,
    description: page.description,
    url: path,
    images: [{ url: "/images/hero/optimized/belfast-big-fish-1920.jpg", alt: "The Big Fish landmark on Donegall Quay in Belfast" }],
  },
};

export default function Page() {
  return <DublinCityTransferLanding page={page} path={path} direction="dublin-to-belfast" />;
}
