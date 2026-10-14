import type { Metadata } from "next";
import MeetGreetPageClient from "./MeetGreetPageClient";
export const metadata: Metadata = { title: "Add Meet & Greet | My Airport Taxi NI", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Page() { return <MeetGreetPageClient />; }
