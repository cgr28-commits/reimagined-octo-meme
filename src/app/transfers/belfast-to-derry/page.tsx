import type { Metadata } from "next";
import DerryTransferLanding from "@/components/DerryTransferLanding";
import { DERRY_TRANSFER_PAGE as page } from "@/lib/derry-transfer-content";
import { SITE } from "@/lib/data";
const path = "/transfers/belfast-to-derry/";
export const metadata: Metadata = {
  title: `${page.title} | ${SITE.name}`, description: page.description,
  alternates: { canonical: path },
  openGraph: { title: page.title, description: page.description, url: path, images: [{ url: "/og-image-square.png?v=20261113b", alt: SITE.name }] },
};
export default function Page() { return <DerryTransferLanding />; }
