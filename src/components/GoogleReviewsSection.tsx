import SectionHeading from "@/components/SectionHeading";
import {
  GOOGLE_REVIEWS,
  GOOGLE_REVIEWS_HEADING,
  googleReviewsCanRender,
} from "@/lib/google-reviews";

/**
 * Genuine Google Reviews — rendered only when config is complete and enabled.
 * No carousel, no invented reviews, no browser Google API fetch.
 */
export default function GoogleReviewsSection() {
  if (!googleReviewsCanRender(GOOGLE_REVIEWS)) {
    return null;
  }

  const { profileUrl, rating, reviewCount, reviews } = GOOGLE_REVIEWS;

  return (
    <section
      id="google-reviews"
      className="relative scroll-mt-36 md:scroll-mt-28 py-20 sm:py-28 lg:py-32"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-light/30 to-navy" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:max-w-[1400px] lg:px-10 xl:px-12">
        <SectionHeading
          eyebrow="Google Reviews"
          title={GOOGLE_REVIEWS_HEADING}
          navId="google-reviews"
          description={`${rating} out of 5 from ${reviewCount} Google reviews.`}
        />

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-center">
          <p className="text-lg font-semibold text-white">
            <span className="text-emerald">{rating}</span>
            <span className="text-white/70"> / 5 on Google</span>
          </p>
          <p className="text-sm text-white/60">{reviewCount} reviews</p>
        </div>

        <ul className="mt-10 grid gap-6 md:grid-cols-3 lg:mt-12 lg:gap-7">
          {reviews.slice(0, 3).map((review) => (
            <li
              key={`${review.author}-${review.date ?? review.text.slice(0, 24)}`}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
            >
              <p className="text-sm font-semibold text-white">{review.author}</p>
              {review.date ? (
                <p className="mt-1 text-xs text-white/45">{review.date}</p>
              ) : null}
              <p className="mt-3 text-sm leading-relaxed text-white/75">“{review.text}”</p>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-center">
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-emerald/40 bg-emerald/10 px-5 text-sm font-semibold text-emerald transition-colors hover:bg-emerald/20 hover:text-emerald-light"
          >
            Read all Google reviews
          </a>
        </p>
      </div>
    </section>
  );
}
