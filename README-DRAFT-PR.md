# Draft PR: Homepage Selections & Booking Date/Time Fix

## Status: ⚠️ DRAFT - Awaiting Review

**Branch:** `fix/homepage-booking-selections-dates`  
**Base:** `main`  
**Do Not Auto-Merge**

---

## Changes Summary

### 1. Homepage Passengers Dropdown
- Starts blank with "Select" placeholder
- Options: 1, 2, 3, 4, 5, 6, 7 (when 7-Seater enabled)
- No automatic selection
- Prevents quote until explicitly selected

### 2. Homepage Suitcases Dropdown
- Starts blank with "Select" placeholder
- Options: None (0), 1, 2, 3, 4, 5+
- "None" stored as numeric 0
- "5+" remains sentinel for "five or more", not exact count
- Preserves existing luggage capacity validation

### 3. Quote Requirements
- "Get My Fixed Price" button disabled until:
  - ✅ Valid pickup address (confirmed)
  - ✅ Valid dropoff address (confirmed)
  - ✅ Passengers explicitly selected (not blank)
  - ✅ Suitcases explicitly selected (not blank)
  - ❌ Pickup date/time NOT required for initial quote
- Clear error messages for missing selections
- Compact mobile layout maintained (dropdowns side-by-side)

### 4. Booking Date/Time Visibility Fix
- Date/time section moved to **top of booking details**
- Appears **before name, phone, email fields**
- For return journeys, return date/time also shown
- Mobile scroll lands at beginning with date/time visible
- Existing date/time validation preserved
- Payment blocked until date/time filled (if required)

### 5. Selection Persistence
- Addresses, passenger count, suitcases, and vehicle choice preserved
- Quote → Booking → Quote roundtrip maintains state
- No horizontal mobile overflow

---

## Testing Checklist

### Homepage
- [ ] Fresh load: both dropdowns show "Select"
- [ ] Passengers: all options 1–7 available (if minibus enabled)
- [ ] Suitcases: None, 1–4, 5+ all available and correct
- [ ] None stored as 0, 5+ as sentinel 5
- [ ] Missing either selection blocks quote
- [ ] Valid addresses + selections allow quote without date/time
- [ ] No horizontal mobile scroll

### Vehicle Restrictions
- [ ] Saloon available for 1–4 passengers
- [ ] Estate available for 1–4 passengers
- [ ] Business Class restricted to 3 pax / 2 bags
- [ ] 7-Seater available when enabled, 1–7 passengers
- [ ] 7-Seater unavailable shows proper message

### Booking Flow
- [ ] "Book This Transfer" shows date/time section first (mobile/desktop)
- [ ] Return journey shows return date/time
- [ ] Date/time validation prevents payment if empty (return journeys)
- [ ] One-way bookings proceed without return date/time
- [ ] Selections survive quote → booking navigation

### Production Build
- [ ] `npm run build` succeeds
- [ ] No TypeScript errors
- [ ] No console errors in production build

---

## Preview URL

**Vercel Preview:** *(Will be available once PR is created and Vercel builds)*

To access:
1. Open the PR on GitHub
2. Look for Vercel Bot comment with preview link
3. Alternative: `https://reimagined-octo-meme-fix-homepage-booking-selections-dates.vercel.app/`

---

## Scope Restrictions

❌ **DO NOT CHANGE:**
- Fares or pricing calculations
- Profitability settings
- Vehicle capacity rules
- SumUp payment integration
- Booking payment processing
- Worker/backend quote validation

✅ **ONLY CHANGED:**
- Homepage input requirements and validation
- Booking date/time visibility and ordering
- Form state management and persistence

---

## Notes

- This is a **draft PR** and must remain unapproved/unmerged until explicit review
- Mobile screenshots and test results included below
- All existing tests should pass with no regressions
- No new dependencies added
