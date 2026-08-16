/**
 * Smoke-test Ideal Postcodes NI premises lookup (uses public ak_test key).
 * Run: npx tsx scripts/check-ideal-postcodes.ts
 */
import {
  resolveIdealPostcodesDetails,
  searchIdealPostcodes,
} from "../shared/ideal-postcodes";

const API_KEY = process.env.IDEAL_POSTCODES_API_KEY?.trim() || "ak_test";

async function assertPostcode(postcode: string, airport = "BFS", minCount = 2) {
  const suggestions = await searchIdealPostcodes(API_KEY, postcode, airport);
  if (suggestions.length < minCount) {
    throw new Error(`${postcode}: expected at least ${minCount} premises, got ${suggestions.length}`);
  }

  const numbered = suggestions.filter((item) => /^\d|[A-Za-z]/.test(item.mainText));
  if (numbered.length === 0) {
    throw new Error(`${postcode}: expected premise labels in mainText`);
  }

  const resolved = await resolveIdealPostcodesDetails(suggestions[0]!.id, airport);
  if (!resolved?.formattedAddress || resolved.lat == null || resolved.lng == null) {
    throw new Error(`${postcode}: resolve missing address/coords`);
  }

  console.log(
    `OK ${postcode}: ${suggestions.length} premises (e.g. ${suggestions[0]!.mainText} → ${resolved.formattedAddress})`,
  );
}

async function main() {
  await assertPostcode("BT36 7FU");
  await assertPostcode("BT20 3BB");
  await assertPostcode("BT1 5GS", "BFS", 1);

  const withFlats = await searchIdealPostcodes(API_KEY, "BT20 3BB", "BFS");
  const named = withFlats.filter((item) => /flat|apartment|basement|solicitor|ltd|limited/i.test(
    `${item.mainText} ${item.secondaryText} ${item.label}`,
  ));
  console.log(`OK BT20 3BB named/business premises: ${named.length}`);

  const street = await searchIdealPostcodes(API_KEY, "7 Glen Manor Road", "BFS");
  if (street.length !== 0) {
    throw new Error("Street query should not trigger Ideal postcode lookup");
  }
  console.log("OK street query skipped Ideal postcode path");

  console.log("Ideal Postcodes NI premises lookup checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
