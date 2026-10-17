import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieSettingsButton from "@/components/CookieSettingsButton";
export const metadata = {
  title: "Cookie Policy | My Airport Taxi NI",
  alternates: { canonical: "/cookies/" },
};
export default function CookiesPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-navy px-4 pb-16 pt-36 text-white">
        <article className="mx-auto max-w-3xl space-y-5">
          <h1 className="text-3xl font-bold">Cookie Policy</h1>
          <p>Updated 17 October 2026</p>
          <p>
            Quotes, bookings and SumUp payments work with essential storage
            only. Optional advertising measurement and website analytics are off
            by default and have separate choices. Personalised advertising is
            disabled.
          </p>
          <CookieSettingsButton />
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Purpose</th>
                <th>Storage and duration</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Essential preferences</td>
                <td>
                  Consent snapshot and essential denial fallback cookie: up to 90 days.
                  Pending withdrawal receipts retry
                  until acknowledged; server denials: 180 days.
                </td>
              </tr>
              <tr>
                <td>Essential booking/payment</td>
                <td>
                  Existing quote and checkout recovery storage, independent of
                  marketing permission. A single-use marker lasting up to one minute
                  restores an unfinished form after a privacy reload in the same tab.
                </td>
              </tr>
              <tr>
                <td>Advertising, only with permission</td>
                <td>
                  First/last campaign visits: up to 90 days or consent expiry.
                  Google Ads may use its own conversion cookies. Quote
                  deduplication and advertising-abuse session identifiers last
                  for the browser session.
                </td>
              </tr>
              <tr>
                <td>Website analytics, only with permission</td>
                <td>
                  Quote-tool diagnostic events and session deduplication.
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            TrafficGuard and its no-JavaScript pixel are disabled. Enhanced
            conversions using email/phone are disabled pending account review.
            Google Ads paid-booking uploads require a recorded, current
            advertising grant and a verified account configuration.
          </p>
          <p>
            Withdraw in Cookie Settings. Optional browser storage is cleared and
            further measurement requests are blocked immediately in this page.
            The page reloads to discard loaded tracking scripts, on reconnection
            if offline. A
            random consent receipt is sent to the server to stop future uploads;
            if offline, server enforcement is pending until delivery. After acknowledgement,
            server denials use strongly consistent storage; unavailable storage
            prevents advertising eligibility. A request already authorised or sent
            cannot be recalled.
            Operational payment and booking records remain available. Data
            already sent cannot be recalled by clearing cookies; contact
            bookings@myairporttaxini.co.uk for data-rights requests.
          </p>
        </article>
      </main>
      <Footer />
    </>
  );
}
