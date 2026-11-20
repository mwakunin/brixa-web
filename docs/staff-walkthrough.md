# Staff walkthrough of the outpatient mockup

Step F2 (`CLAUDE.md` §1). The mockup was walked through desk by desk with the pilot's staff, following the walkthrough guide. What follows is what they said, in their words, and what was decided for each screen.

- **Date:** 2026-11-20
- **Who took part:** the front desk (who is also the cashier), triage, a clinician, the lab and the pharmacy

Staff are named by their role only. No staff member, patient or hospital is named here (`CLAUDE.md` §4.12).

## What this session had to settle

| Question | Asked at | Answer |
|---|---|---|
| Do patients pay at each point, or once at the end? | Front desk, cashier | Both. A patient may pay first, or the lab and the pharmacy go ahead with a warning that the patient has not paid yet, as on the screens |
| Are consumables (gloves, syringes, dressings, cannulas) billed item by item? | Triage, consultation, lab, cashier | "Leave an option for both" (the triage nurse). Left for later by the owner (2026-11-20) |
| Does an administrator need a way to help staff who cannot open their email at work? | Sign in | No. Everyone can open their email at work, and resets are sent by email today |
| Gap 3: does the doctor need everything about the patient at once? | Consultation, back with results | At once: name, age, sex, vital signs, allergies and today's complaint, then the results when they are back. Earlier visits and old results can wait one more press, but a short "last visit" summary helps with chronic patients |
| Gap 4: does the pharmacy need product, stock and price on the waiting list? | Pharmacy | No, only when a prescription is opened. A small "low or out of stock" flag on the list is enough |
| Gap 5: does the nurse tell the patient the clinic's fee? | Triage | No: "the consultation at the doctor will determine cost" |
| Gap 6: does the doctor need the quantity while writing the dose? | Back with results | No. The clinician writes the drug, dose, frequency and days, and the pharmacy works out the quantity |

## Desk by desk

### 1 Sign in, and 2 Where are you working

- **Said:**
  - Everyone has an email address they can open at work.
  - Everyone has a smartphone that can hold an authenticator app.
  - Each person signs in as themselves, with no shared logins. A computer is shared with whoever takes over at the change of shift.
  - A forgotten password is reset today by a link sent to their email.
  - Nobody works at another facility, so nobody switches facilities.
- **Decision:** keep both screens as built.
  - Sign-in and the two-step code stay as they are. SMS codes are not needed.
  - Reset by email is enough. No administrator help is needed for staff who cannot open their email.
  - Nobody at the pilot will see the facility picker, because everyone works at one facility. It stays for staff who work at more than one.
  - A computer is shared at the change of shift, and staff said the person leaving signs out. No sign-out after the computer is left idle is needed for now.

### 3 Front desk, and 3b A new patient

- **Said:**
  - They search by name, ID number or phone number. They are sure it is the right person when two or three names match, and the phone number or the ID number.
  - "The cashier doesn't bill, the bill comes from the clinician."
  - "Front desk acts as cashier most times."
  - Emergencies: there is an emergency area, where a clinician attends to the patient and takes the first records. The front desk collects the patient's details after a while.
  - Almost every patient walks in, but appointments still need to be in the system.
  - Some patients do not carry an ID and cannot remember its number.
  - For a child, the ID is left blank, and sometimes the guardian's ID is recorded.
  - When they are not sure someone has been here before, they search the records, and register the patient afresh if nothing is found.
  - Returning patients have numbers on paper records only. The hospital will start afresh, with no old records brought in.
  - When patients pay: "both work". A patient can pay first, but the lab can also go ahead, with a warning that the patient has not paid yet, as on the screen. The same applies to the pharmacy.
  - Registering an emergency patient: the administrator decides who is given front desk rights to register, but ideally it is done on the front desk screen.
- **Decision:** keep both screens, with these changes:
  - The front desk and the cashier are usually the same person. That person holds both roles and must move between the two desks without signing out. The line "Nothing is paid here: the cashier bills what is done" is wrong for them.
  - Search already matches names, phone and ID number. Each result should show the ID number beside the phone, since that is what clerks check.
  - Emergencies are registered on the front desk screen, by whoever the administrator gives front desk rights, which may be someone in the emergency area. Keep the Emergency button. Someone who cannot say who they are is registered as an unidentified patient, and their details are filled in later.
  - Keep "Booked for today", even though appointments are few.
  - "Not carrying it today" fits patients without their ID. A child's record needs a place for the guardian's ID.
  - The warning that a patient may be registered already fits what clerks do today.
  - The pilot starts afresh, so bringing in patients from the old records is left for later (the owner, 2026-11-20).

### 4 Triage

- **Said:**
  - They take the usual vital signs, the same as on the screen.
  - Emergencies come first; otherwise the nurse judges from the patient's state and condition.
  - Allergies are recorded both at triage and by the doctor.
  - The nurse does not tell the patient the clinic's fee: "the consultation at the doctor will determine cost". The doctor can waive the fee, or make it a free visit.
  - Consumables used on a patient: "leave an option for both", charged item by item or not.
- **Decision:** keep, with these changes:
  - The fee comes off the clinic buttons, which settles gap 5 with no change to the API.
  - The vital signs and the three levels of how soon (emergency, urgent, routine) stay as they are, with no scoring.
  - The consultation screen must let the doctor record an allergy too, not only show one.
  - The doctor looks first at the complaint from triage, so triage records today's complaint in a few words.
  - The doctor waives the fee or makes a visit free. How that is recorded was settled at desk 5 and after the session.

### 5 Consultation

- **Said:**
  - They search for diagnoses by name.
  - The fee is waived there and then when a patient cannot pay. The doctor tells the front desk or the cashier, who waives it with approval.
  - That approval is given by word of mouth today.
  - Yes, they want to see each test's price as they order it.
  - Questions 1 to 3 were answered at desk 7, below.
- **Decision:** keep, with these changes:
  - Diagnoses are found by name, as drawn. Doctors are not shown the codes.
  - Each test shows its price, as drawn. The price comes from the price list (`GET /billable-items`, through the test's `billableItemId`), so no change to the API is needed.
  - Remove the total ("KES 1,100"), because the screens never add up money. Show a total only if the API returns one.
  - Waivers already fit the API, with no change. The doctor tells the cashier. The cashier asks for the waiver on the finished bill, with a reason, and the finance manager or the administrator approves it in the app. What changes for staff is that the approval is recorded instead of given by word of mouth.

### 6 Lab

- **Said:**
  - The lab technologist or technician checks a result, and the lab in-charge reviews it. "But here it is often the same single person who ran the test."
  - "That person runs, verifies and releases the result, so keep an audit trail rather than requiring a second approver."
  - Specimens are labelled mostly by hand, with the patient's name and the lab number.
  - For a critical result, the lab person phones or walks to the clinician or the nurse in charge straight away, and records who was told and when. "A critical flag plus a call log covers this."
  - Results go back mostly on paper, as a result slip or on the request form, carried back by the patient. "The system should be able to let the doctor see."
  - Yes, they get patients sent by an outside doctor, with that doctor's request.
- **Decision:** keep, with these changes, none of which needs the API to change:
  - **One person finishes a result.** Releasing a result alone, with a reason, is allowed at any time, not only at night. The person, the time and the reason are recorded and printed on the report as "released unverified". The result reaches the clinician, and the patient rejoins the clinic's queue, as soon as it is released. The screen makes releasing an ordinary button, not a night-duty exception. The reason is filled in for the person as "Alone on duty", and they can change it.
  - **The lab in-charge reviews later.** A second lab member verifies a released result when one is there, which is the in-charge's review. Nothing waits on it. Verifying your own result stays refused, so "verified" always means a second person checked.
  - **Labels:** the lab number is shown large when the specimen is taken, for writing on the tube. No label printing.
  - **Critical results:** as the API already works, a critical result is not released until who was told, how and when is recorded. The mockup does not draw this step yet.
  - **Results on paper and on screen:** once released, the lab prints the numbered lab report as the result slip, and the doctor sees the results on screen.
  - **Patients sent by an outside doctor:** the API already serves them, on a visit that joins no queue, with the outside requester's name and facility. The mockup has no screen for this yet. It belongs on the front desk, where they register and pay, and the lab can do it too.

### 7 Back with results

- **Said:**
  - They look first at the complaint and the vital signs from triage (temperature, blood pressure, weight), then at the lab results if they are back.
  - On the screen at once: name, age, sex, vital signs, allergies and today's complaint. "Earlier visits and old results can wait one more press, but a quick 'last visit' summary helps with chronic patients."
  - Notes: "light headings with a free-text box under each".
  - The patient usually comes back to the same clinician on the same day. "The patient goes back to the queue, or the clinician is called when results are ready."
  - "The clinician writes the drug, dose, frequency and days. The total quantity is worked out by the pharmacy."
  - "The pharmacy dispenses it, based on the clinician's dose and duration and on stock. The pharmacy adjusts it if stock is short."
  - Results released by one person without a second check: "Yes, mostly. In a small lab the person who ran the test is the only one who can check it, so clinicians act on it."
- **Decision:** keep both doctor's screens, with these changes:
  - **Gap 6 is settled with no change to the API.** Remove "To give 24 tablets" from the doctor's screen. The API works out the quantity after the prescription is written, as now, and the pharmacy sees it. The pharmacy may give less when stock is short, and the API already marks the rest not supplied.
  - **Gap 3:** the first view holds name, age, sex, vital signs, allergies and today's complaint, and the results when they are back, beside the doctor's own note, diagnoses and orders. Earlier visits and old results come on one more press. A short "last visit" summary is new.
  - **Today's complaint comes from triage.** The triage screen has no place for it yet (see the triage decision).
  - **Notes** keep the four light headings, each with a free-text box. These are the API's sections (presenting complaint, history, examination, plan).
  - **Results that one person released** are acted on, which confirms the lab's decision.
  - **Back to the same clinician:** the patient rejoins the clinic's queue, as now. Each clinician's list of results to review tells them whose results are back.

### 8 Pharmacy

- **Said:**
  - The pharmacist picks from what is in stock, usually the cheapest or the brand the facility normally buys. They follow any brand the prescriber specified, and for cash payers the patient's preference matters.
  - Stock and price are needed "only when opening a prescription. Showing stock and price beside every medicine on the list is clutter, so a small 'low or out of stock' flag on the list is enough."
  - When stock is short: "we give what is available, record the partial dispense, and tell the patient to buy the balance elsewhere. The system should support a partial dispense with the balance noted."
  - Patients often ask the price first, then decide whether to buy everything or part of it. "So the API should return a total cost estimate before dispensing and not leave the screen to work it out."
  - "For cash patients, they pay first, then receive the drugs. The usual flow is the pharmacy quoting a price, the cashier updating payment, and then dispensing."
- **Decision:** keep, with these changes:
  - **Choosing the product:** opening a prescription lists the products that can fill each medicine, with what is on the shelf and the price of one unit. The pharmacist chooses. A brand the prescriber wants goes in the prescription's instructions, which the API already has and the pharmacy screen shows.
  - **Gap 4 is settled smaller than asked:** the waiting list carries no product choices, only a "low or out of stock" flag. Stock levels are the API's to work out, so the flag needs a small addition to the worklist (brixa-api).
  - **Giving part:** already in the API. The pharmacy gives what there is, and the medicine stays on the list showing what has been given. The rest is then marked not supplied, "buying elsewhere" or "out of stock".
  - **A quote before preparing is new in the API:** the price of each line and the total, for the products and quantities chosen, before any stock is taken or anything is charged. The screen never works it out. Remove "On her bill KES 600" from the mockup until the quote gives it.
  - **Pay first:**
    1. The pharmacy quotes the price.
    2. The patient decides how much to take.
    3. The pharmacy prepares that much, which sets the stock aside and puts it on the bill.
    4. The patient pays at the cashier.
    5. The pharmacy hands over.
    - A patient who does not come back has the preparation cancelled, which puts the stock back and cancels the charge. The API already does this.
    - Handing over unpaid stays a warning, not a block, as at the lab.
  - Whether the patient needs a printed note of the balance to buy elsewhere is still open.

### 9 Cashier

- **Said:**
  - Patients pay by M-Pesa, and by SHA once it is active.
  - M-Pesa: "for now paybill, but yes, both will be very helpful" (the paybill and a prompt to the patient's phone).
  - A receipt shows the facility's name and address, a receipt number, the date and time, the patient's name and number, the services or items with their amounts, the total, the payment method and the cashier's name. One receipt per payment, even when a patient pays several times in one visit. "Keep a running balance if they pay in parts."
  - Closing the till: the cashier counts the cash and reconciles it against the system's total for the shift. M-Pesa is matched to the transaction list. A second person (the in-charge or the accountant) often counts or signs off, "but he or she may close alone too".
  - Waivers: "the in-charge or administrator approves, not the finance manager on their own screen". Approval happens in person or by a quick phone call.
  - No KRA eTIMS for now.
- **Decision:** keep, with these changes:
  - **How to pay:** M-Pesa comes first among the choices, paybill before prompt. Both are in the API already, and cash and card stay. SHA waits for the API's SHA work, after go-live.
  - **One receipt per payment, with what is still owed:** already in the API. A payment on a bill prints what was applied and what the bill still owes.
  - **The receipt needs three things it lacks (brixa-api):** the facility's address (it prints the name, KMHFR code and county), the services or items paid for with their amounts (it prints the bill's number), and the cashier's name.
  - **Closing alone:** already in the API. The cashier closes their own shift with the cash counted, and the system works out what should be there and the difference. M-Pesa is not in the drawer, and is matched on the M-Pesa list. A second person's sign-off is not needed for go-live.
  - **Who approves a waiver:** the in-charge, given the role that approves, which is the finance manager or the administrator. How they approve is a decision for the owner: on their own screen, as the API requires now, or recorded by the cashier after a phone call.
  - eTIMS is not needed for now.

### Questions for everyone

- **Said:**
  - Each desk has a desktop. It is shared only with the reliever, one person at a time, never two at once.
  - The network drops during blackouts. Staff asked whether the app will work offline (a PWA).
  - The triage nurse may also see patients in a clinic. The administrator gives the rights.
  - English on the screen is fine.
  - Staff are happy with the screens. Anything else needed will be worked on later.

## What they do today that no screen shows

Nothing was named. Staff were content with the screens and will raise anything missing later.

## Decided after the session (the owner, 2026-11-20)

- **Waivers are approved in the app, without holding the patient.** The cashier asks for the waiver with the reason, and the patient goes on. The in-charge, given the role that approves, approves from a list of waivers waiting, the same day. A phone call may still prompt them. The visit stays open until the waiver is decided.
- **Gap 3: add one read for the consultation**, in brixa-api.
- **Today's complaint is recorded at triage.** The nurse writes it today.
