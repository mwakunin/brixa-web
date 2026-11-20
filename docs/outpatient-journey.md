# The outpatient journey, sketched

A clickable mockup of one patient's visit, from the front desk to the cashier. It was made on 2026-11-17 and walked through with the pilot's staff on 2026-11-20 (`CLAUDE.md` §1, step F2). What staff said, desk by desk, is in `docs/staff-walkthrough.md`. This page holds what the walkthrough decided.

**The mockup:** https://claude.ai/artifact/DK7SUAtHVCMssmwXDLSwxg (private to its owner until shared from its Share menu). It was redrawn on 2026-11-20 to show what the walkthrough decided. Where it and this page differ, this page decides.

Every name, number and price in it is made up.

## The one pattern

Every desk has the same screen:

- **left:** who is waiting, with the patient in front of you marked;
- **right:** that patient, and the work this desk does for them;
- **one dark button** that finishes the work and sends the patient on.

A member of staff who has learnt one desk has learnt them all. Tags say what needs attention in words, not colour alone: "Urgent", "Not paid yet", "Low".

**One person, several desks.** At the pilot:
- the front desk is usually also the cashier;
- a triage nurse may also see patients in a clinic;
- whoever the administrator gives front desk rights registers emergencies.

A person lands on their first desk and switches to their others from the header, without signing in again. Their roles come from their membership, which the administrator sets.

## What the walkthrough decided

### Every screen survives

None of the screens is dropped. A waivers list for the in-charge is added. Gap numbers refer to the list further down.

| # | Screen | What changes |
|---|---|---|
| 1, 1b | Sign in, two-step setup | Nothing. Everyone has email they can open at work and a smartphone for the authenticator, so there are no SMS codes. A desktop is shared only with the reliever, and the person leaving signs out |
| 2 | Where are you working | Nothing. Nobody at the pilot works at two facilities, so nobody there sees it |
| 3 | Front desk | Each search result shows the ID number (gap 8). The line "Nothing is paid here" goes. **Emergency** stays: it opens an emergency visit and sends the patient straight to the emergency area's queue. A patient sent by an outside doctor is registered here, and their tests are entered from the request |
| 3b | A new patient | A child's record takes a guardian, with the guardian's ID (gap 9). "Not carrying it today", the unidentified patient and the likely-duplicate warning stay as drawn |
| 4 | Triage | The nurse records today's complaint (gap 10). The fee comes off the clinic buttons (gap 5). The vital signs and the three levels of how soon stay as drawn, with no scoring |
| 5 | Consultation | One read brings the patient (gap 3). The doctor can record an allergy as well as see one. Diagnoses are found by name, with no codes shown. Each test shows its price, and the total goes |
| 6 | Lab | **Release** is an ordinary button, at any time. The person gives the reason each time, with one press for "Alone on duty" or by typing another; it is never filled in for them. A second lab member verifies later when there is one, and nothing waits on it. The lab number shows large, for writing on the tube. A critical result asks who was told, how and when. The lab report prints as the result slip |
| 7 | Back with results | The quantity comes off the doctor's screen (gap 6). The results and a short last-visit summary come from the consultation read |
| 8 | Pharmacy | The waiting list flags a medicine that is low or out of stock (gap 4). Products, stock and price show once a prescription is opened. The API gives a quote before preparing (gap 11). Giving part, with the rest marked not supplied, works as built |
| 9 | Cashier | M-Pesa comes first among the ways to pay, the paybill before the prompt. The receipt adds the facility's address, the items paid for and the cashier's name (gap 12) |
| 9b | Waivers waiting (new) | The in-charge, holding the role that approves, approves or rejects waivers from a list, the same day |

### The three questions the walkthrough had to answer

- **When patients pay:** both, at each point or once at the end, as the API already allows with no setting.
  - The lab and the pharmacy warn when a patient has not paid, and never block.
  - A cash patient usually pays before the pharmacy hands over. The pharmacy quotes and prepares, the patient pays at the front desk, then the pharmacy hands over.
  - A preparation the patient never comes to pay for is cancelled, which puts the stock back, while it is not on a bill yet.
  - Once it is on a bill, cancelling is refused. Today it would be handed over and taken back as a return, with a credit note. Which path the screens offer is still open.
- **Consumables billed item by item:** staff asked for both, item by item or not. The owner left this for later (2026-11-20). Until then, a consumable is charged by a manual posting with a reason (`../api/ROADMAP.md` P6).
- **Helping staff who cannot open their email at work:** not needed. Everyone can open their email at work, so reset by email stays the only way.

### Also decided

- **Waivers are approved in the app, without holding the patient** (the owner, 2026-11-20).
  1. The doctor tells the cashier.
  2. The cashier asks for the waiver on the finalised bill, with the reason.
  3. The in-charge approves it from `GET /adjustments?status=pending`, the same day. They must be someone other than the cashier (rule 24).

  Today's practice of approving by phone may still prompt the in-charge. The visit stays open until the waiver is decided. The API needs no change.
- **No patient import for the pilot.** The old records are on paper, and the pilot starts afresh. The owner left the import for later.
- **English** on every screen, and a **desktop** at every desk.
- **eTIMS** is not needed for now. **SHA** comes after go-live.
- **The network drops in blackouts.** Offline support stays in P6. Until then, the screens never lose what someone typed (`CLAUDE.md` §4.11).

### Proposed, not decided

- **Build order:**
  1. the front desk, with the desk switch and the Nairobi date module;
  2. the cashier, since it is the same person, and payments come at any point;
  3. triage;
  4. consultation;
  5. the lab;
  6. back with results;
  7. the pharmacy.

  Each desk waits for its gaps below.
- **Money owed at the front desk:** when a returning patient owes money, the front desk shows how much. A button opens the cashier desk with that patient.

## Screens and the API behind them

Paths are `brixa-api`'s. Each read that names a patient is audited by the API, so a screen fetches only what it shows. A gap number marks what the API does not give yet.

| # | Screen | Who | Reads | Writes |
|---|---|---|---|---|
| 1 | Sign in | Everyone | | Better Auth `sign-in/email`, then the code: `two-factor/verify-totp`, or `two-factor/verify-backup-code` |
| 1b | Set up two-step sign-in | Everyone, once, before any desk | | `two-factor/enable` (the password again; the app's QR code and the backup codes), then `two-factor/verify-totp` (the app's first code) |
| 2 | Where are you working | Staff at more than one facility | `GET /me/facilities` | Keeps the facility id for `X-Facility-Id` |
| 3 | Front desk | Records clerk | `GET /patients?q=` (with the ID number, gap 8), `GET /appointments?date=`, `GET /service-points`, `GET /encounters?patientId=` | `POST /encounters` (`opd` joins triage; `emergency` with `queueAt` the emergency area), `POST /appointments/{id}/check-in`, `POST /encounters/{id}/walk-in-orders` (an outside doctor's request) |
| 3b | A new patient | Records clerk | | `POST /patients` (409 with `candidates` for a likely duplicate; again with `confirmNotDuplicate`; a child's guardian, gap 9), then `POST /encounters` |
| 4 | Triage | Nurse | `GET /service-points/{id}/queue`, `GET /service-points`, `GET /patients/{id}/allergies` | `POST /queue-entries/{id}/serve`, `POST /encounters/{id}/observations`, today's complaint (gap 10), `POST /patients/{id}/allergies`, `POST /queue-entries/{id}/finish` (priority, next clinic) |
| 5 | Consultation | Doctor, clinical officer | The clinic's queue, then the consultation read for the patient (gap 3); `GET /icd-codes?q=`, `GET /lab-tests` with `GET /billable-items` (each test's price) | `POST /encounters/{id}/notes`, `PUT /notes/{id}`, `POST /encounters/{id}/diagnoses`, `POST /encounters/{id}/orders`, `POST /patients/{id}/allergies` |
| 6 | Lab | Lab technician, supervisor | `GET /lab/worklist`, `GET /lab-tests` (analytes and ranges) | `POST /orders/{id}/specimens`, `POST /specimens/{id}/results`, `POST /lab-results/{id}/release` (alone, with a reason) or `/verify` (a second lab member), each with `told` for a critical result; `GET /documents/{id}/pdf` for the lab report |
| 7 | Back with results | Doctor, clinical officer | The consultation read (gap 3), `GET /drugs?q=`, `GET /results-to-review` | `POST /diagnoses/{id}/confirm`, `POST /encounters/{id}/prescriptions`, `POST /notes/{id}/sign`, `POST /lab-results/{id}/reviewed`, `POST /queue-entries/{id}/finish` |
| 8 | Pharmacy | Pharmacist, pharmacy technician | `GET /pharmacy/worklist` (with a stock flag, gap 4); on opening a prescription, `GET /stock-items?drugCode=`, `GET /stores/{id}/stock`, `GET /billable-items`, and the quote (gap 11) | `POST /dispenses`, `POST /dispenses/{id}/hand-over`, `POST /dispenses/{id}/cancel`, `POST /order-items/{id}/not-supplied` |
| 9 | Cashier | Cashier | `GET /cashier/due`, `GET /encounters/{id}/charges`, `GET /cashier-shifts/current`, `GET /mpesa/transactions` | `POST /encounters/{id}/bill-now`, `POST /payments` or `POST /mpesa/stk`, `POST /mpesa/transactions/{id}/assign`, `POST /invoices/{id}/adjustments` (a waiver), `POST /cashier-shifts/{id}/close`, `GET /documents/{id}/pdf` for the receipt (gap 12) |
| 9b | Waivers waiting | The in-charge, as finance manager or facility admin | `GET /adjustments?status=pending` | `POST /adjustments/{id}/approve`, `POST /adjustments/{id}/reject` |

## What the sketch asks of the API

Found while drawing each screen against the API, and settled by the walkthrough. Each change is made in `brixa-api` before the screen that needs it is built.

1. ~~**Nobody sends a patient back to the doctor after the lab.**~~ Fixed in brixa-api #24 (decided 2026-11-17). The patient rejoins the clinic's queue once their last result is released or verified, unless the doctor said there was no need (`comeBackWithResults: false` when finishing). Each clinician also has `GET /results-to-review`, with `POST /lab-results/{id}/reviewed`.
2. ~~**A queue row cannot say why the patient is there.**~~ Fixed in brixa-api #24: queue rows carry `returnedWithResults`, and `appointment: { time }` for a checked-in appointment.
3. **The consultation screen needs seven reads for one patient.** Settled on 2026-11-20: add one read for the consultation.
   - **What it returns:**
     - name, age and sex;
     - today's vital signs, allergies and complaint;
     - this visit's notes, diagnoses, orders and results;
     - a short summary of the last visit: its date, clinic, diagnoses and medicines.
   - It is audited once.
   - Doctors said earlier visits and old results can wait one more press. They stay behind the reads that exist.
4. **The pharmacy has to look up what can fill each medicine.** Settled on 2026-11-20, smaller than asked. The worklist carries no choices, only a flag for a medicine that is low or out of stock, from the API. Products, stock and price are read once a prescription is opened.
5. ~~**A clinic's fee is not on the service point.**~~ Settled on 2026-11-20, with no change to the API. The nurse never tells the patient the fee, so it comes off the triage screen.
6. ~~**The quantity a prescription will give is worked out by the API, after it is written.**~~ Settled on 2026-11-20, with no change to the API. The doctor writes the drug, dose, frequency and days, and the pharmacy works out the quantity, giving less when stock is short. The doctor's screen no longer shows it.
7. ~~**Nobody can reset a forgotten password.**~~ Fixed in brixa-api #27 (decided 2026-11-17).
   - Better Auth's reset by email is on. The link goes to the staff app's `/reset-password` page and works once, for an hour.
   - A reset ends every session the person had. A sign-in with the old password that is already under way at that instant can still finish: a narrow race inside Better Auth. brixa-api #27 narrows it but cannot close it, and closing it needs a change in Better Auth, to be reported to them privately. The confirmation screen says devices "that were signed in" have been signed out, which is exact.
   - The sign-in screen has its "Forgot your password?" link again, leading to `/forgot-password`.
   - An administrator's way to help staff who cannot open their email at work is not needed (2026-11-20): everyone at the pilot can.

**New from the walkthrough:**

8. **A patient search does not return the ID number.** Clerks confirm a patient by names and the phone or ID number. Without the number in the results, they would open each record to check, and each opening is audited.
9. **A child's record has no guardian.** Clerks sometimes record the guardian's ID. A guardian has a name, relationship, phone and ID number. Settled on 2026-11-20: brixa-api #35 adds a patient's contacts, and only the name is required. The relationship, phone and ID are recorded when known, so a child is registered whether or not the guardian's ID is at hand.
10. **Triage has nowhere to record today's complaint.** The nurse writes it today, and the doctor looks at it first. It is recorded as triage finishes, and the consultation read returns it.
11. **The pharmacy cannot quote a price before preparing.** Patients ask the price first, then decide how much to buy. The quote gives each line's price and the total, for the products and quantities chosen, with nothing taken or charged.
12. **The receipt lacks three things staff expect:** the facility's address (it prints the name, KMHFR code and county), the services or items paid for with their amounts (it prints the bill's number), and the cashier's name.

**Still open:**
- whether a patient who buys the rest of a medicine elsewhere needs a printed note of what is left;
- what the pharmacy does with a preparation that is already on a bill when the patient never collects it. The API refuses to cancel it, and a return applies only to medicine handed over.

## Left out of the sketch, on purpose

- Stores and administration: goods received, transfers, stock takes, adjustments, the controlled-drug register, prices, staff and invitations. Their screens come last (`../api/ROADMAP.md` §1), and they are not part of one patient's visit.
- Appointments beyond checking one in; refunds, credit notes and reversals; returns to the pharmacy; rejected specimens; break-glass on sensitive records. Each is a rarer path off one of these screens.
- M-Pesa in detail: the prompt to the patient's phone and the paybill match are shown as choices only.
- Left for later by the owner (2026-11-20): consumables billed item by item, and the patient import.
- Not needed for go-live: SHA, eTIMS, and a second person's sign-off when a shift closes.
