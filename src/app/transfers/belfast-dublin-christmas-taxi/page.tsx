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
    images: [{ url: "/images/hero/optimized/dublin-beckett-bridge-1920.jpg", alt: "Samuel Beckett Bridge, Dublin" }],
  },
};

export default function Page() {
  return <DublinCityTransferLanding page={page} path={path} />;
}
