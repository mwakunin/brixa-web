# The outpatient journey, sketched

A clickable mockup of one patient's visit, from the front desk to the cashier, made on 2026-11-17 to be walked through with the pilot's staff before any role's screen is built (`CLAUDE.md` §1, step F2).

**The mockup:** https://claude.ai/artifact/DK7SUAtHVCMssmwXDLSwxg (private to its owner until shared from its Share menu).

Every name, number and price in it is made up.

## The one pattern

Every desk has the same screen:

- **left:** who is waiting, with the patient in front of you marked;
- **right:** that patient, and the work this desk does for them;
- **one dark button** that finishes the work and sends the patient on.

A member of staff who has learnt one desk has learnt them all. Tags say what needs attention in words, not colour alone: "Urgent", "Not paid yet", "Low".

## Screens and the API behind them

Paths are `brixa-api`'s. Each read that names a patient is audited by the API, so a screen fetches only what it shows.

| # | Screen | Who | Reads | Writes |
|---|---|---|---|---|
| 1 | Sign in | Everyone | | Better Auth `sign-in/email` |
| 2 | Where are you working | Staff at more than one facility | `GET /me/facilities` | Keeps the facility id for `X-Facility-Id` |
| 3 | Front desk | Records clerk | `GET /patients?q=`, `GET /appointments?date=`, `GET /service-points`, `GET /encounters?patientId=` | `POST /encounters` (joins triage), `POST /appointments/{id}/check-in` |
| 3b | A new patient | Records clerk | | `POST /patients` (409 with `candidates` for a likely duplicate; again with `confirmNotDuplicate`), then `POST /encounters` |
| 4 | Triage | Nurse | `GET /service-points/{id}/queue`, `GET /service-points`, `GET /patients/{id}/allergies` | `POST /queue-entries/{id}/serve`, `POST /encounters/{id}/observations`, `POST /patients/{id}/allergies`, `POST /queue-entries/{id}/finish` (priority, next clinic) |
| 5 | Consultation | Doctor, clinical officer | The clinic's queue, then for the patient: observations, allergies, notes, diagnoses, orders; `GET /icd-codes?q=`, `GET /lab-tests`, `GET /billable-items` | `POST /encounters/{id}/notes`, `PUT /notes/{id}`, `POST /encounters/{id}/diagnoses`, `POST /encounters/{id}/orders` |
| 6 | Lab | Lab technician, supervisor | `GET /lab/worklist`, `GET /lab-tests` (analytes and ranges) | `POST /orders/{id}/specimens`, `POST /specimens/{id}/results`, `POST /lab-results/{id}/verify` (or `/release`, alone on night duty) |
| 7 | Back with results | Doctor, clinical officer | `GET /encounters/{id}/lab-results`, `GET /drugs?q=`, `GET /results-to-review` | `POST /diagnoses/{id}/confirm`, `POST /encounters/{id}/prescriptions`, `POST /notes/{id}/sign`, `POST /lab-results/{id}/reviewed`, `POST /queue-entries/{id}/finish` |
| 8 | Pharmacy | Pharmacist, pharmacy technician | `GET /pharmacy/worklist`, `GET /stock-items?drugCode=`, `GET /stores/{id}/stock`, `GET /stock-alerts` | `POST /dispenses`, `POST /dispenses/{id}/hand-over`, `POST /order-items/{id}/not-supplied` |
| 9 | Cashier | Cashier | `GET /cashier/due`, `GET /encounters/{id}/charges`, `GET /cashier-shifts/current` | `POST /encounters/{id}/bill-now`, `POST /payments` or `POST /mpesa/stk`, `GET /documents/{id}/pdf` for the receipt |

## What the sketch asks of the API that it cannot give yet

Found while drawing each screen against the API. None is decided: they are questions for `brixa-api`, to settle after the staff walkthrough shows which screens survive.

1. ~~**Nobody sends a patient back to the doctor after the lab.**~~ Fixed in brixa-api #24 (decided 2026-11-17). The patient rejoins the clinic's queue once their last result is released or verified, unless the doctor said there was no need (`comeBackWithResults: false` when finishing). Each clinician also has `GET /results-to-review`, with `POST /lab-results/{id}/reviewed`.
2. ~~**A queue row cannot say why the patient is there.**~~ Fixed in brixa-api #24: queue rows carry `returnedWithResults`, and `appointment: { time }` for a checked-in appointment.
3. **The consultation screen needs seven reads for one patient:** the queue entry, vital signs, allergies, notes, diagnoses, orders and results. Each is audited on its own. `SPEC.md` §7.9 asks for a screen to be one or two calls. One "this patient at this desk" read may be worth adding.
4. **The pharmacy has to look up what can fill each medicine.** The worklist names the drug prescribed, not the facility's products for it. Showing "Coartem, 216 on the shelf, KES 25 a tablet" takes `GET /stock-items?drugCode=`, the store's stock and the price list, for every medicine. The worklist could carry the choices.
5. **A clinic's fee is not on the service point.** Triage shows "General clinic, fee KES 500" before sending a patient there. `GET /service-points` gives `consultationItemId` only, so the price needs `GET /billable-items` as well.
6. **The quantity a prescription will give is worked out by the API, after it is written.** The sketch shows "24 tablets" as the doctor types the dose, which means repeating the API's rule in the browser, or asking the API for a preview.
7. **Nobody can reset a forgotten password.** The sketch's sign-in screen has a "Forgot your password?" link, but the API has no way to reset one. Better Auth's reset by email is not configured, and no administrator route sets a password. A new invitation does not help either, because accepting one keeps an existing account's password. The sign-in screen leaves the link out until the API can do this. It must be settled before go-live, because staff will forget their passwords.

## Left out of the sketch, on purpose

- Stores and administration: goods received, transfers, stock takes, adjustments, the controlled-drug register, prices, staff and invitations. Their screens come last (`../api/ROADMAP.md` §1), and they are not part of one patient's visit.
- Appointments beyond checking one in; refunds, adjustments and reversals; returns to the pharmacy; rejected specimens and critical values; break-glass on sensitive records. Each is a rarer path off one of these screens.
- M-Pesa in detail: the prompt to the patient's phone and the paybill match are shown as choices only.
