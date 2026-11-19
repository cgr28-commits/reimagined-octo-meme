import type { Metadata } from "next";
import Link from "next/link";
import { EVENTS_HUB_PATH, FOO_FIGHTERS_TRANSFER_PATH } from "@/lib/bespoke-public";
import { SITE } from "@/lib/data";
import FooFightersEventsRedirect from "@/components/FooFightersEventsRedirect";

const title = "Foo Fighters concert taxi";
const description =
  "Foo Fighters concert taxis use the Events & Concerts quote tool. Pick Foo Fighters to fill in Croke Park and the concert date.";

export const metadata: Metadata = {
  title: { absolute: `${title} | ${SITE.name}` },
  description,
  robots: { index: false, follow: true },
  alternates: { canonical: EVENTS_HUB_PATH },
  openGraph: { title, description, url: EVENTS_HUB_PATH, type: "website" },
};

/** Old dedicated quote page — send people to the Events quote tool. */
export default function FooFightersTransferPage() {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-xl flex-col justify-center px-5 py-24 text-white">
      <h1 className="text-2xl font-bold">Foo Fighters concert taxis</h1>
      <p className="mt-3 text-base leading-relaxed text-white/80">
        Concert quotes now live on the Events &amp; Concerts page. Use the Foo Fighters box in the quote tool to fill in Croke Park and the concert date.
      </p>
      <p className="mt-6">
        <Link href={EVENTS_HUB_PATH} className="btn-primary inline-flex min-h-12 items-center rounded-full px-5 text-sm font-bold">
          Open Events &amp; Concerts
        </Link>
      </p>
      <p className="mt-4 text-sm text-white/55">
        Previous address: <code className="text-white/70">{FOO_FIGHTERS_TRANSFER_PATH}</code>
      </p>
      <FooFightersEventsRedirect />
    </main>
  );
}
