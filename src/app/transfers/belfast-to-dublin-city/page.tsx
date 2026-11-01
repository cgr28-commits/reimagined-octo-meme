import type { Metadata } from "next";
import DublinCityTransferLanding from "@/components/DublinCityTransferLanding";
import { DUBLIN_CITY_TRANSFER_PAGE as page, DUBLIN_CITY_TRANSFER_PATH as path } from "@/lib/dublin-city-transfer-content";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `${page.title} | ${SITE.name}`,
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
  return <DublinCityTransferLanding />;
}
