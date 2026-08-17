import type { Metadata } from "next";
import ShortNoticePayClient from "./ShortNoticePayClient";

export const metadata: Metadata = {
  title: "Pay for approved booking | My Airport Taxi NI",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

export default async function ShortNoticePayPage({ searchParams }: PageProps) {
  const params = searchParams && typeof (searchParams as Promise<unknown>).then === "function"
    ? await (searchParams as Promise<Record<string, string | string[] | undefined>>)
    : ((searchParams as Record<string, string | string[] | undefined>) ?? {});
  const raw = params.token;
  const token = Array.isArray(raw) ? raw[0] ?? "" : String(raw ?? "");

  return (
    <main className="min-h-screen bg-navy px-4 py-10 sm:px-6">
      <div className="mx-auto mb-8 max-w-lg text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald">
          My Airport Taxi NI
        </p>
      </div>
      {token.trim() ? (
        <ShortNoticePayClient token={token.trim()} />
      ) : (
        <div className="mx-auto max-w-lg rounded-2xl border border-red-400/30 bg-navy/80 p-6 text-white">
          <h1 className="text-xl font-bold">Missing payment link</h1>
          <p className="mt-3 text-sm text-white/75">
            This page needs a secure payment token from your approved booking link.
          </p>
        </div>
      )}
    </main>
  );
}
