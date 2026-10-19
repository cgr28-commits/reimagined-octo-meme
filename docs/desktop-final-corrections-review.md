# PR #658 final corrections review

Status: PASS — safe to merge after the owner's final approval. PR remains draft; nothing merged or deployed.

## Final corrections

- Real delivery PASSED: the business owner confirmed MATNI-1049 arrived in the business inbox. Earlier unverified-delivery notes are superseded. The existing endpoint, request body and provider integration are unchanged. No additional real emails were sent during this correction pass.
- The desktop enquiry freezes a submission snapshot before sending and takes a synchronous ref lock before awaiting. Name, email, optional message and submit action are disabled while pending. Displayed pending journey details use that snapshot. The lock releases after success or error. Concurrent submissions cannot pass the lock.
- Success uses the exact heading “Enquiry Sent Successfully” and the two requested paragraphs. No customer/business email address or acknowledgement claim appears in success. Form/error contact information remains available as before.
- The obsolete literal Step 3 heading assertion now checks the intended conditional COMPLETE YOUR BOOKING heading, retaining the three-step progress checks.
- Four existing payment labels retained low-opacity mobile styling. A scoped min-width:1024px rule changes only their desktop colour to the existing #c8d3df secondary token. Contrast exceeds 4.5:1 against the navy panel. Payment logic and all mobile classes are unchanged. The contrast test checks these explicit exceptions and the desktop override rather than banning all legacy mobile opacity classes.

## PASS/FAIL

| Requirement | Result | Evidence |
| --- | --- | --- |
| Real email delivery | PASS | Owner confirmed MATNI-1049 received; no new real mail |
| Submitted-value snapshot / editing / duplicate lock | PASS | Frozen snapshot, synchronous lock, all three fields and send action disabled; attempted pending email edit blocked |
| Exact success copy | PASS | Browser success screenshot, no email address or automatic acknowledgement claim |
| Same-page modal, context, validation, focus, error recovery | PASS | Required-name and invalid-email prevented requests; intercepted success and HTTP502; fields re-enabled on error, quote unchanged; focus wraps, Escape returns to trigger |
| Outdated Step 3 and payment contrast checks | PASS | Both previously failing scripts now pass; desktop-only contrast correction |
| Desktop 1024/1280/1440/1920 | PASS | Quote and email modal screenshots, no overflow, three form fields, modal within viewport |
| Mobile 320/375/390/430 | PASS | Full screenshots compared with main 41990f4c; equal image/page dimensions and exact hero/list/result geometry; original image sources and WhatsApp retained |
| Pricing / capacities / return / booking / SumUp | PASS | Regression suites; £7/£10/£7 configurable Estate fixtures, 5% return; browser Saloon235/Estate242, return486−24.30+13=>475; desktop/mobile booking handoff without submission |
| Dynamic backgrounds and imagery | PASS | All four existing categories switch to their matching desktop assets; no assets changed in corrections |
| Production build and targeted regressions | PASS | GitHub Pages export 148 pages; all 19 targeted suites pass |

Mobile screenshots are visually unchanged, not claimed byte-identical: JPEG pixel comparisons have mean absolute differences of 0.20–0.28 on a 0–255 scale, with identical full-page dimensions. At 320/375/390/430 respectively, hero heights are 2351.875/1926.425/1926.425/1857.825, vehicle-list heights 637.75/449.613/449.613/381.013 and result heights 528.625/494.538/494.538/494.538, matching main. Side-by-side 390px evidence included in the gallery.

Browser email tests used tab-local intercepted responses only. Success/error screenshots are labelled MOCKED. Inbox-delivery PASS rests on the owner's real receipt confirmation. Backend and pricing implementations are unchanged against origin/main 41990f4c. No real booking, live pricing write, payment, backend permission change or redirect was performed.

## Remaining existing warnings / limits

The production build retains existing unused-variable, React-hook dependency, AddressInput option aria-selected, and static-export headers/redirects warnings. These are unrelated to the corrected form. GitHub Pages does not apply Next.js runtime headers/redirects; no redirect work is included. Generated sitemap drift was restored in the working tree, so no sitemap changes are committed. The generated export still contains 102 unique sitemap URLs.

Business Class and Minibus retain existing on-request availability states; instant Book This Transfer/email action rows only appear where the existing eligible quote flow offers them. No eligibility changes were made. SumUp was tested through automated regression checks, not a real transaction.

## Evidence

Task visualization folder: `pr658-final-corrections/` (index.html gallery, 8 full-page quote screenshots, 4 desktop result captures, 4 email modal captures, success/error mocks, booking captures, mobile comparison, regression-results.json and layout-metrics.json). Earlier baseline and complete redesign evidence remain in `desktop-homepage-quote/` and `pr658-final-review/`.

## Final mobile approval protection

The owner has approved the live iPhone appearance. No further mobile changes or proposed wrapping fixes are included. QuoteVehicleCategories.tsx has no diff against origin/main: both Business Class and 7 Seater Minibus retain the exact “On request · Request quote” string and existing wrapping. “Your own pre-booked transfer” remains visible on mobile and is hidden only by the existing desktop media rule. WhatsApp, navigation, calculator, pricing display, booking controls, imagery, typography and spacing remain unchanged.

A fresh read-only comparison against https://www.myairporttaxini.co.uk/ at 320/375/390/430px passed. Identical Saloon Belfast City Hall → Dublin Airport quotes were captured; each production/revised full-page screenshot has identical dimensions, and hero, vehicle-list and result heights have zero difference. Mean JPEG pixel differences are 0.856/0.276/0.265/0.248 on a 0–255 scale (not a byte-identical claim). Production-comparison screenshots show no unintended layout changes. Evidence: production-mobile-*.jpg, production-comparison-*.jpg, production-comparison-results.json and production-mobile-metrics.json in the final-corrections gallery. No production booking, email or payment was submitted.
