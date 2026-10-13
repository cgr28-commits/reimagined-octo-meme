import type { Metadata } from "next";
import CorkTransferLanding from "@/components/CorkTransferLanding";
import { CORK_TRANSFER_PAGES } from "@/lib/cork-transfer-content";
import { SITE } from "@/lib/data";
const page = CORK_TRANSFER_PAGES["belfast-to-cork"];
const path = "/transfers/belfast-to-cork/";
export const metadata: Metadata = {
  title: `${page.title} | ${SITE.name}`, description: page.description,
  alternates: { canonical: path },
  openGraph: { title: page.title, description: page.description, url: path, images: [{ url: "/og-image-square.png", alt: SITE.name }] },
};
export default function Page() { return <CorkTransferLanding direction="belfast-to-cork" />; }
