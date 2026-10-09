import type { Metadata } from "next";
import VitoGroupLanding from "@/components/VitoGroupLanding";
import { SITE } from "@/lib/data";
import { vitoPageBySlug } from "@/lib/vito-group-content";

const page = vitoPageBySlug("private-group-transfers-belfast")!;

export const metadata: Metadata = {
  title: `${page.seoTitle} | ${SITE.name}`,
  description: page.description,
  alternates: { canonical: page.path },
  openGraph: {
    title: `${page.seoTitle} | ${SITE.name}`,
    description: page.description,
    url: page.path,
  },
};

export default function PrivateGroupTransfersBelfastPage() {
  return <VitoGroupLanding page={page} />;
}
