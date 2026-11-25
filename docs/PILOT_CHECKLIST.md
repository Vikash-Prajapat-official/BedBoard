# Hands-on checklist before showing BedBoard to a hospital

The automated tests prove the software does what the spec says. They cannot prove it works **in your building**, on **your phones**, with **your people**. Do these by hand, on the real hardware, with a test ward, before any real patient is entered.

Tick each box. Write what you saw next to anything that surprised you.

## A. The computer and the network

- [ ] Install from scratch on the real computer (`ADMIN_GUIDE.md` section 2). It works the first time.
- [ ] From a phone on the ward's Wi-Fi, open `http://<address>:3001`. Try **every ward** and the **casualty area**: note any Wi-Fi dead spots.
- [ ] Pull the power plug on the computer, then plug it back in. Everything comes back by itself (with no one typing a command). Time it: ____ minutes.
- [ ] Switch the Wi-Fi router off for 2 minutes, then on. Phones recover without anyone logging in again.
- [ ] Leave it running for a full day and a night. The next morning: the dashboard is right, and `backups` has a new file.

## B. Real phones, real people

- [ ] Test on the **cheapest, oldest Android phone** a nurse might own. Is every tap quick enough? Is the text readable at arm's length?
- [ ] A nurse who has never seen it admits a patient to a test bed. **Count the taps.** Was she able to do it without help? ____
- [ ] Same for: transfer, mark discharge steps, patient left, mark cleaned, block a bed.
- [ ] Housekeeping staff clean a bed from the list on their own phone.
- [ ] Switch a phone to **Hindi**. A Hindi speaker reads every screen they will use and writes down any wording that is unclear or wrong (the file is `messages/hi.json`).
- [ ] Look at the screens in **bright light** and from the side. Can the six colours still be told apart? (Each also has an icon and a word.)

## C. When things go wrong

- [ ] On a ward phone, turn on **aeroplane mode**, mark a bed cleaned, then turn it off. The action goes through. **Count how long.**
- [ ] Do that on two phones for the **same bed**, with one offline. The second one is told "Bed changed, please refresh" and nothing is doubled.
- [ ] Two people try to admit to the **same free bed at the same moment**. Exactly one succeeds.
- [ ] Leave a phone alone until it locks. Unlock with the PIN. Try a wrong PIN five times: the person is logged out.
- [ ] Reserve a bed and do nothing. It frees itself after `RESERVATION_MINUTES`.
- [ ] Deactivate a user while they are logged in. Their next tap is refused.

## D. Data and safety

- [ ] **Restore a backup** onto a different computer, using only the files and the written-down passphrase. Open the restored copy and check the beds are the same.
- [ ] Copy the `backups` folder off the computer. Confirm someone knows where the copy is and who looks after it.
- [ ] Log in as a nurse of one ward and look at another ward: **no patient names**.
- [ ] Open the dashboard, the TV screen and (if enabled) the public page: **no patient names anywhere**.
- [ ] Download the admissions CSV and open it in Excel. Check there are no names or phone numbers, and that numbers like stay length look right.
- [ ] Use **Patient privacy** to correct a test patient and erase another. Look in the **Audit log** for both.
- [ ] Print the **patient notice** in English and Hindi. Your legal adviser has read it and a contact person is written on it.

## E. Does it save time? (the actual point)

- [ ] **Before** BedBoard, for a week, write down: (a) how long from "admit this patient" to the patient being in a bed; (b) how long from the discharge order to the bed being ready. Use a simple paper log at the casualty desk and one ward.
- [ ] After two to four weeks on BedBoard, read the same two numbers from **Reports** (order to patient left, cleaning time) and from the audit log.
- [ ] Ask the people who use it, in plain words: what is slower than the whiteboard? What is faster? What did they stop doing?

## F. Before the first real patient

- [ ] A short training session for each role, using the test ward.
- [ ] Everyone has their own login. No shared accounts.
- [ ] The paper whiteboard stays for the first weeks, in parallel. Compare the two each shift and note every difference.
- [ ] Decide who the administrator is, who covers when they are away, and who answers when a phone stops working at 3 a.m.
- [ ] Agree the point at which the hospital would stop using BedBoard, and what they would do instead. Knowing the way back makes it safe to begin.
