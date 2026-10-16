import { APPROVED_POSTCODE_RULES, postcodeRuleKey, type PostcodePricingRule } from "../../shared/postcode-pricing";

/** Read-only transcription of Draft fares in My_Airport_Taxi_NI_BT_Postcode_Fare_Draft.xlsx.
 * Columns: district number, BHD/BFS/DUB draft Saloon GBP. No mileage is treated as verified.
 * Workbook's proposed symmetric direction is NOT approval for airport arrivals.
 * BT58 is non-geographic and has no workbook fare; it remains available for manual configuration.
 */
const workbook: number[][] = [
  [1,35,55,245],[2,35,55,245],[3,20,50,250],[4,20,55,255],[5,20,55,250],[6,20,50,245],
  [7,20,50,240],[8,30,55,230],[9,20,45,240],[10,25,40,230],[11,30,40,235],[12,20,45,240],
  [13,25,40,250],[14,25,45,250],[15,25,40,250],[16,25,65,260],[17,35,45,225],[18,20,60,265],
  [19,40,80,280],[20,35,80,280],[21,50,95,295],[22,80,115,310],[23,35,80,270],[24,60,75,230],
  [25,70,75,205],[26,50,55,215],[27,45,50,220],[28,45,45,225],[29,55,20,260],[30,75,95,265],
  [31,95,115,235],[32,100,105,180],[33,110,130,240],[34,125,125,150],[35,140,140,150],
  [36,35,40,265],[37,35,50,270],[38,50,60,285],[39,50,40,280],[40,70,75,310],[41,60,25,280],
  [42,80,50,310],[43,95,70,325],[44,125,100,355],[45,125,90,330],[46,140,105,350],
  [47,185,160,390],[48,200,170,405],[49,175,145,385],[51,170,135,375],[52,160,125,370],
  [53,135,100,355],[54,180,145,400],[55,170,135,375],[56,170,140,380],[57,170,140,380],
  [60,150,135,210],[61,135,115,240],[62,105,85,235],[63,110,90,225],[64,100,80,235],
  [65,100,80,235],[66,90,70,240],[67,70,50,240],[68,175,150,275],[69,180,150,290],
  [70,160,125,295],[71,145,110,290],[74,245,215,355],[75,205,170,320],[76,190,155,310],
  [77,190,150,315],[78,205,170,345],[79,215,180,360],[80,155,120,330],[81,255,220,405],
  [82,225,195,415],[92,270,235,340],[93,295,260,395],[94,250,220,360],
];

export function workbookDraftRules(): PostcodePricingRule[] {
  return workbook.flatMap(([n, bhd, bfs, dub]) => (["BHD", "BFS", "DUB"] as const).flatMap((airportCode, i) =>
    (["to-airport", "from-airport"] as const).map(direction => ({
      district: `BT${n}`, airportCode, direction, saloonFareGbp: [bhd, bfs, dub][i],
      approvalStatus: direction === "to-airport" && n <= 2 ? "approved" as const : "needs-verification" as const,
      enabled: false,
    }))));
}

/** Only missing records are staged: never replace an existing saved or draft price. */
export function mergeMissingPostcodeRules(existing: PostcodePricingRule[], incoming: PostcodePricingRule[]) {
  const keys = new Set(existing.map(postcodeRuleKey));
  return [...existing, ...incoming.filter(r => !keys.has(postcodeRuleKey(r)))];
}

export function approvedStartingRules(): PostcodePricingRule[] {
  return APPROVED_POSTCODE_RULES.flatMap(r => [
    { ...r, direction: "to-airport" as const, approvalStatus: "approved" as const, enabled: false },
    { ...r, direction: "from-airport" as const, approvalStatus: "needs-verification" as const, enabled: false },
  ]);
}
