# Patient notice (template)

BedBoard keeps a few details about each patient so it can run the beds. The Digital Personal Data Protection Act 2023 expects the hospital to tell patients what it keeps and why, and to let them correct or erase it. This is the notice for that.

**The notice is built into BedBoard** so it stays in step with how the software really behaves (the retention period, who can see what). Open it here:

> **Admin → Patient privacy → Printable patient notice**

- It prints on one page and uses the language chosen in the header. Print it **once in English and once in Hindi** and keep both at the admission desk.
- It fills in your hospital's name and your `RETENTION_DAYS` setting by itself.
- At the bottom, write the **contact person's name and phone** by hand (or add them to the text).

## What the notice says

1. **Why we keep it:** to give the patient a bed and run the ward safely.
2. **What we keep:** name, hospital number (UHID), age, sex, ward and bed, dates and times of the stay. No medical history.
3. **Who can see it:** the ward's staff, the admission desk, doctors and administrators. Counts-only screens and any public page never show names.
4. **How long:** the name and contact details are erased `RETENTION_DAYS` days after the patient leaves. The hospital's main medical record is kept separately for the legally required period.
5. **Their rights:** to ask for a correction or erasure, at the admission desk or from the named contact.

## When a patient asks

Admin → **Patient privacy**: search by UHID or name, then **correct** the details or **erase** them. Erasing removes the name, UHID, phone and ABHA number for good; age and sex stay so reports keep working. A patient who is still admitted cannot be erased until they leave. Every use is written to the audit log.

## Changing the wording

The text is in `messages/en.json` and `messages/hi.json`, under `"notice"`. After editing, run `docker compose up -d --build`.

**This is a template, not legal advice.** Please have the hospital's legal adviser read it before use, and keep your own record of how you handle requests.
