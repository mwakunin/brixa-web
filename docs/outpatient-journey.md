# The outpatient journey, sketched

A clickable mockup of one patient's visit, from the front desk to the cashier. It was made on 2026-11-17, walked through with the pilot's staff on 2026-11-20 (`CLAUDE.md` §1, step F2), and given a design review on 2026-11-21. What staff said, desk by desk, is in `docs/staff-walkthrough.md`. This page holds what the walkthrough and the review decided.

**The mockup:** https://claude.ai/artifact/DK7SUAtHVCMssmwXDLSwxg (private to its owner until shared from its Share menu). It was redrawn on 2026-11-20 to show what the walkthrough decided, and again on 2026-11-21 after the design review. Its board **0, The rules every desk follows**, gives the colours, sizes and wording every desk is built from. Where the mockup and this page differ, this page decides.

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
- **Money owed at the front desk:** decided by the owner on 2026-11-23, and built in web #18. When a returning patient owes money on bills already out, the front desk shows how much. For someone who is also the cashier, a link opens the cashier's desk with that patient's bills.
  - It reads `GET /patients/{id}/account`, which the API keeps to those who handle money. A records clerk without the cashier's role sees nothing there yet (gap 17).

## What the design review decided (2026-11-21)

The mockup was redrawn after a design review. Its Rules board holds the details; this is what the build follows.

- **The layout of every desk:**
  - a white header (the facility, the desk, who you are);
  - who is waiting, on the left;
  - the patient on the right: their name and number stay put, the work scrolls, and **one dark main button is pinned at the bottom**, always on screen.
  - Each column scrolls on its own.
- **Screen sizes:**
  - The desks are drawn at 1366 × 768, the smallest desk screen, and 1024 × 768.
  - On an upright tablet (768 × 1024), the queue moves behind a Waiting button (board 4b).
  - The pilot's desk screens are **1920 × 1080** (the owner, 2026-11-21): the same layout, with more room. Windows display scaling can make the page smaller (at 150%, 1280 × 720 less the browser's own bar), and what the pilot's computers use is not known yet.
  - Screenshots therefore add 1920 × 1080 to the sizes in `CLAUDE.md` §7, starting with the first desk.
- **Buttons:**
  - one dark main button a screen, saying what it does and where the patient goes next;
  - a second choice is outlined;
  - Emergency is outlined in dark red.
  - Under the button, one line at most.
- **Status comes in four kinds**, told apart by word, icon and lightness, never by colour alone:
  - **Act now** (dark red): a critical result, an emergency.
  - **Soon** (orange): how soon a patient must be seen, set at triage.
  - **Outside the usual range** (pale amber): a result outside its range, as the API marks it.
  - **For your desk's work** (white, grey outline): money, stock and records. It never stops you, but tell the patient what it means for them. Stock flags carry a box icon and read "1 out of stock" and "1 running low", since "Low" is a lab result's word.
- **Messages:**
  - **Done** stays in the panel until the next patient is called. A message that vanishes after a few seconds gets missed, so no pop-up toasts for results.
  - **Not done** sits beside the main button, shows the API's message as it is, and keeps what was typed.
  - **Check this** asks for a decision first, such as a patient who may be registered already.
- **Type:** five sizes (28, 22, 18, 16 and 14), in the device's own typefaces.
- **Words:**
  - Name the patient, or say "the patient", never "her" or "him": the patient may be intersex, of unknown sex, or not yet identified.
  - Say what happens next in the button.
  - An explanation staff read once goes under **How this works**, closed by default.
- **When things go wrong**, triage is drawn after sending (4c), refused (4d), on a dropped connection (4e) and with nobody waiting (4f). The other desks follow the same patterns.
- **Built with shadcn/ui.** Each component's variants (the main button, the outlined and Emergency buttons, the four badges, the three messages) are set once from the Rules board, at 44 px touch targets and the five type sizes, and every desk uses them.

## Screens and the API behind them

Paths are `brixa-api`'s. Each read that names a patient is audited by the API, so a screen fetches only what it shows. A gap number marks where the walkthrough or the review changed the API. **Every write a screen may repeat carries an `Idempotency-Key`**, one for each action, kept until its answer arrives (gap 15).

| # | Screen | Who | Reads | Writes |
|---|---|---|---|---|
| 1 | Sign in | Everyone | | Better Auth `sign-in/email`, then the code: `two-factor/verify-totp`, or `two-factor/verify-backup-code` |
| 1b | Set up two-step sign-in | Everyone, once, before any desk | | `two-factor/enable` (the password again; the app's QR code and the backup codes), then `two-factor/verify-totp` (the app's first code) |
| 2 | Where are you working | Staff at more than one facility | `GET /me/facilities` | Keeps the facility id for `X-Facility-Id` |
| 3 | Front desk | Records clerk | `GET /patients?q=` (with the ID number, gap 8), `GET /appointments?date=`, `GET /service-points`, `GET /encounters?patientId=`, and for staff who handle money `GET /patients/{id}/account` (what the patient owes) | `POST /encounters` (`opd` joins triage; `emergency` joins the emergency area, gap 13), `POST /appointments/{id}/check-in`, `POST /encounters/{id}/walk-in-orders` (an outside doctor's request) |
| 3b | A new patient | Records clerk | | `POST /patients` (409 with `candidates` for a likely duplicate; again with `confirmNotDuplicate`; a child's guardian, gap 9), then `POST /encounters` |
| 4 | Triage | Nurse | `GET /service-points/{id}/queue`, `GET /service-points`, `GET /patients/{id}/allergies` | `POST /queue-entries/{id}/serve`, then `POST /queue-entries/{id}/triage`: today's complaint (gap 10), the vital signs, the allergies, how soon and the next clinic, in one call (gap 14) |
| 5 | Consultation | Doctor, clinical officer | The clinic's queue, then the consultation read for the patient (gap 3); `GET /icd-codes?q=`, `GET /lab-tests` with `GET /billable-items` (each test's price) | `POST /encounters/{id}/notes`, `PUT /notes/{id}`, `POST /encounters/{id}/diagnoses`, `POST /encounters/{id}/orders`, `POST /patients/{id}/allergies` |
| 6 | Lab | Lab technician, supervisor | `GET /lab/worklist`, `GET /lab-tests` (analytes and ranges) | `POST /orders/{id}/specimens`, `POST /specimens/{id}/results`, `POST /lab-results/{id}/release` (alone, with a reason) or `/verify` (a second lab member), each with `told` for a critical result; `GET /documents/{id}/pdf` for the lab report |
| 7 | Back with results | Doctor, clinical officer | The consultation read (gap 3), `GET /drugs?q=`, `GET /results-to-review` | `POST /diagnoses/{id}/confirm`, `POST /encounters/{id}/prescriptions`, `POST /notes/{id}/sign`, `POST /lab-results/{id}/reviewed`, `POST /queue-entries/{id}/finish` |
| 8 | Pharmacy | Pharmacist, pharmacy technician | `GET /pharmacy/worklist` (with a stock flag, gap 4); on opening a prescription, `GET /stock-items?drugCode=`, `GET /stores/{id}/stock`, `GET /billable-items`, and the quote (gap 11) | `POST /dispenses`, `POST /dispenses/{id}/hand-over`, `POST /dispenses/{id}/cancel`, `POST /order-items/{id}/not-supplied` |
| 9 | Cashier | Cashier | `GET /cashier/due`, `GET /encounters/{id}/charges`, `GET /cashier-shifts/current`, `GET /patients/{id}/account` (bills out, for `?patient=` and a waiver), `GET /mpesa/transactions?status=unmatched`, `GET /mpesa/stk/{id}` (a prompt, until paid or failed), `GET /payments/{id}` (a receipt not given with its payment) | `POST /encounters/{id}/bill-now`, `POST /payments` or `POST /mpesa/stk`, `POST /mpesa/transactions/{id}/assign`, `POST /invoices/{id}/adjustments` (a waiver), `POST /cashier-shifts`, `POST /cashier-shifts/{id}/close`, `GET /documents/{id}/pdf` for the receipt (gap 12) |
| 9b | Waivers waiting | The in-charge, as finance manager or facility admin | `GET /adjustments?status=pending` | `POST /adjustments/{id}/approve`, `POST /adjustments/{id}/reject` |

## What the sketch asks of the API

Found while drawing each screen against the API, settled by the walkthrough and the design review. Each change is made in `brixa-api` before the screen that needs it is built.

1. ~~**Nobody sends a patient back to the doctor after the lab.**~~ Fixed in brixa-api #24 (decided 2026-11-17). The patient rejoins the clinic's queue once their last result is released or verified, unless the doctor said there was no need (`comeBackWithResults: false` when finishing). Each clinician also has `GET /results-to-review`, with `POST /lab-results/{id}/reviewed`.
2. ~~**A queue row cannot say why the patient is there.**~~ Fixed in brixa-api #24: queue rows carry `returnedWithResults`, and `appointment: { time }` for a checked-in appointment.
3. ~~**The consultation screen needs seven reads for one patient.**~~ Fixed in brixa-api #36: `GET /encounters/{id}/consultation`, settled on 2026-11-20.
   - **What it returns:**
     - name, age and sex;
     - today's vital signs, allergies and complaint;
     - this visit's notes, diagnoses, orders and results;
     - a short summary of the last visit: its date, clinic, diagnoses and medicines.
   - It is audited once.
   - Doctors said earlier visits and old results can wait one more press. They stay behind the reads that exist.
4. ~~**The pharmacy has to look up what can fill each medicine.**~~ Fixed in brixa-api #36, smaller than asked (settled on 2026-11-20). The worklist carries no choices, only a flag for a medicine that is low or out of stock, from the API. Products, stock and price are read once a prescription is opened.
5. ~~**A clinic's fee is not on the service point.**~~ Settled on 2026-11-20, with no change to the API. The nurse never tells the patient the fee, so it comes off the triage screen.
6. ~~**The quantity a prescription will give is worked out by the API, after it is written.**~~ Settled on 2026-11-20, with no change to the API. The doctor writes the drug, dose, frequency and days, and the pharmacy works out the quantity, giving less when stock is short. The doctor's screen no longer shows it.
7. ~~**Nobody can reset a forgotten password.**~~ Fixed in brixa-api #27 (decided 2026-11-17).
   - Better Auth's reset by email is on. The link goes to the staff app's `/reset-password` page and works once, for an hour.
   - A reset ends every session the person had. A sign-in with the old password that is already under way at that instant can still finish: a narrow race inside Better Auth. brixa-api #27 narrows it but cannot close it, and closing it needs a change in Better Auth, to be reported to them privately. The confirmation screen says devices "that were signed in" have been signed out, which is exact.
   - The sign-in screen has its "Forgot your password?" link again, leading to `/forgot-password`.
   - An administrator's way to help staff who cannot open their email at work is not needed (2026-11-20): everyone at the pilot can.

**New from the walkthrough:**

8. ~~**A patient search does not return the ID number.**~~ Fixed in brixa-api #35. Clerks confirm a patient by names and the phone or ID number. Without the number in the results, they would open each record to check, and each opening is audited.
9. ~~**A child's record has no guardian.**~~ Fixed in brixa-api #35. Clerks sometimes record the guardian's ID. A guardian has a name, relationship, phone and ID number. Settled on 2026-11-20: brixa-api #35 adds a patient's contacts, and only the name is required. The relationship, phone and ID are recorded when known, so a child is registered whether or not the guardian's ID is at hand.
10. ~~**Triage has nowhere to record today's complaint.**~~ Fixed in brixa-api #36. The nurse writes it today, and the doctor looks at it first. It is recorded as triage finishes, and the consultation read returns it.
11. ~~**The pharmacy cannot quote a price before preparing.**~~ Fixed in brixa-api #36: `POST /dispenses/quote`. Patients ask the price first, then decide how much to buy. The quote gives each line's price and the total, for the products and quantities chosen, with nothing taken or charged.
12. ~~**The receipt lacks three things staff expect:**~~ Fixed in brixa-api #36. the facility's address (it prints the name, KMHFR code and county), the services or items paid for with their amounts (it prints the bill's number), and the cashier's name.

**New from building and the design review:**

13. ~~**Nothing marks the emergency area.**~~ Fixed in brixa-api #38. The Emergency button sends the patient straight to the emergency area, but service points were only triage or a clinic. The facility admin now marks one clinic as the emergency area, and an emergency visit joins it unless told otherwise; without one, it joins triage.
14. **Triage took three or four calls.** A refusal part-way left part of it saved, so the screen's "Not saved" was not true. brixa-api #39 adds `POST /queue-entries/{id}/triage`, which records all of it or, on any refusal, none of it.
15. **A write sent again after a dropped connection was done twice:** a second registration, a second set of vital signs, a second payment. brixa-api #39 adds the `Idempotency-Key`, and the API answers a repeated key with its first answer. How a screen keeps its key:
    - one key belongs to one action: made at the first press of the button, and sent with every resend of that action, automatic or a second press, until an answer arrives;
    - while no answer has come, what was sent stays as sent: the form's fields are held, and Try again resends it with the same key (board 4e). An edited form under the same key is refused as another request, and a new key could repeat a write that did go through;
    - once an answer arrives, done or refused, the action is over, and the next press makes a new key.
16. **A refusal on a closed visit did not say why.** brixa-api #39 gives every one the same sentence: what happened, when, by whom and what to do. For example: "This visit was cancelled at 09:40 by Joyce Mwangi. Ask the front desk whether to start a new one."
   - The refused-triage board (4d) first showed a visit cancelled at the front desk. That cannot happen while the patient is with the nurse, as the API refuses to cancel a visit whose patient is being seen. Since 2026-11-22 it shows a refusal that can: the chosen clinic's consultation fee has no price yet, in the API's own words, with what was typed kept.

17. **A records clerk alone cannot see what a patient owes.** `GET /patients/{id}/account` is for those who handle money, and the front desk shows money owed only to them. At the pilot the front desk is usually also the cashier, so it shows there. Open: does a clerk without the cashier's role need the figure, and from which read?
18. ~~**A visit paid as it goes could not be paid in one payment.**~~ Fixed in brixa-api #42 (decided by the owner on 2026-11-23). `bill-now` makes a bill at each point. A payment towards the visit settled only its final bill, so money paid towards a visit with an earlier bill part-paid and new charges since waited as a deposit. A payment towards a visit now settles each of its bills that still owes, oldest first, and its receipt lists them all.
19. **A paybill payment that names a patient number lands as credit on the patient's account,** not on the bills of their visit. Open: should it be paid towards their open visit, when they have exactly one?

**Still open:**
- whether a patient who buys the rest of a medicine elsewhere needs a printed note of what is left;
- what the pharmacy does with a preparation that is already on a bill when the patient never collects it. The API refuses to cancel it, and a return applies only to medicine handed over.

## Left out of the sketch, on purpose

- Stores and administration: goods received, transfers, stock takes, adjustments, the controlled-drug register, prices, staff and invitations. Their screens come last (`../api/ROADMAP.md` §1), and they are not part of one patient's visit.
- Appointments beyond checking one in; refunds, credit notes and reversals; returns to the pharmacy; rejected specimens; break-glass on sensitive records. Each is a rarer path off one of these screens.
- M-Pesa in detail: the prompt to the patient's phone and the paybill match are shown as choices only.
- Left for later by the owner (2026-11-20): consumables billed item by item, and the patient import.
- Not needed for go-live: SHA, eTIMS, and a second person's sign-off when a shift closes.
