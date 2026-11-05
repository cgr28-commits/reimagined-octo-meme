import type { Metadata } from "next";
import DublinCityTransferLanding from "@/components/DublinCityTransferLanding";
import {
  CHRISTMAS_BELFAST_DUBLIN_PAGE as page,
  CHRISTMAS_BELFAST_DUBLIN_PATH as path,
} from "@/lib/christmas-belfast-dublin-content";

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  alternates: { canonical: path },
  openGraph: {
    title: page.title,
    description: page.description,
    url: path,
    images: [{ url: "/images/hero/optimized/xmas-belfast-city-hall-1920.jpg", width: 1920, height: 1080, alt: "Belfast City Hall at Christmas" }],
  },
};

export default function Page() {
  return <DublinCityTransferLanding page={page} path={path} />;
}
