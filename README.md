# 🐴 Stallschemat

A shared shift schedule for the stable. Everyone picks their own shifts with two taps, no login needed. The admin sets the base schedule and can change single days. The app is in Swedish. It's a PWA hosted on GitHub Pages, with data in Firebase Firestore.

**Try it without Firebase:** `npm install && npm run dev:demo` opens a demo with sample data. The admin code is `1234`.

## Features

- **Pick who you are.** Choose your name and colour once. It's saved on the device. Tap your name in the header to switch person if you picked the wrong one.
- **Week view.** Your shifts show in your colour. Free shifts have a dashed orange border. Other people's shifts are greyed out. The "Mina & lediga" filter hides everyone else's shifts. "Dela" copies the week as text for the group chat.
- **Taking and releasing shifts.** Tap a free shift, then "Jag tar det". Tap your own shift, then "Släpp passet". If the shift starts within 24 h, the app asks you to also tell the group chat. Two people can never book the same shift (handled by a Firestore transaction).
- **Your shifts.** A card at the top of the schedule shows your next shift. Tap it to see all your booked shifts and release or add any of them to your calendar. Tapping the "N lediga" pill scrolls to the first free shift.
- **Navigation.** Regular users only see the schedule. ⚙️ in the header opens settings: calendar, install guide and admin. Admins also get a bottom menu with Schema | Admin.
- **Pop-ups (sheets)** close with the ✕, by tapping outside, with Escape, by swiping down, or with the phone's back button/gesture (it closes the sheet rather than leaving the app).
- **Calendar subscription.** Each person gets a personal `webcal://` feed with step-by-step instructions for iPhone, Google/Android and Outlook. There's also a one-off "Lägg till i kalendern" for single shifts.
- **Install as an app.** Android and desktop Chrome get a one-tap "Installera" button. iPhone gets a 3-step picture guide. iOS doesn't allow a web page to start the install itself, so the manual step can't be avoided there.
- **Admin (behind a code):**
  - **Översikt:** shifts per person and per shift type (last 4 weeks / this month / coming weeks), plus a list of free shifts.
  - **Grundschema:** weekday and weekend templates, applied from a chosen date. Past weeks stay as they were. If the change would remove shifts people already booked, it warns first.
  - **Enstaka dag:** add or remove shifts on one day and add a note (e.g. "Hovslagaren kommer"). Also reachable via "ändra dag" in the schedule.
  - **Personer:** add people, rename, change colour, deactivate.
  - **Logg:** every change, with who made it and when.
  - **Mer:** how many weeks ahead people can book (default 6), change the admin code, lock admin.
  - Admins can also put anyone on any shift, or remove them.

## Keeping data fresh without many reads

| Situation | What happens | Cost |
|---|---|---|
| App on screen | Live listeners on `config/main` + the bookable weeks (one document per week) | 1 read per *changed* document |
| App in background > 60 s | Listeners are dropped | **0** |
| App opened again | Listeners re-attach and everything refreshes immediately | ~8 reads (less if the cache is fresh) |
| A short app switch (< 60 s) | Stays connected | 0 |
| Day/week rolls over | The synced week range moves along | only the new week |
| Hourly calendar job | Reads config + ~10 weeks | ~11 reads/run |

Rough total for 6 people: **~600 reads/day** out of Firestore's free **50 000/day**. Use a separate Firebase project for this app. Free quotas are per project ("No-cost usage quotas apply at the project-level", [firebase.google.com/pricing](https://firebase.google.com/pricing)), so it won't take anything from your other apps. Listener billing follows [the Firestore docs](https://firebase.google.com/docs/firestore/pricing): one read per added/changed document, and a full re-read if a listener has been disconnected for more than 30 minutes. The estimate above assumes that full re-read every time the app is opened. On the free Spark plan you can never be charged: if a quota ran out, requests would just stop until the next day.

App updates are handled the same way. The service worker checks for a new version when the app starts and when it comes back from the background (at most every 30 min), then installs it. The hourly calendar deploy rebuilds the same commit to an identical file, so nobody's app reloads for nothing.

## Setup (about 20 minutes)

1. **Firebase project.** At [console.firebase.google.com](https://console.firebase.google.com), create a new project (Analytics not needed). Then add a **Web app** (`</>`) and note `apiKey`, `authDomain`, `projectId` and `appId`.
2. **Firestore.** Build → Firestore Database → Create database → *production mode*. For the location, pick `eur3` or `europe-north1`.
3. **Anonymous sign-in.** Build → Authentication → Get started → Sign-in method → **Anonymous** → Enable. Under Settings → Authorized domains, add `<your-github-user>.github.io`.
4. **Security rules.** Copy `firestore.rules` into Firestore → Rules → Publish, or run `npx firebase login && npx firebase deploy --only firestore:rules --project <projectId>`.
5. **Service account (for calendars + backup).** Project settings → Service accounts → *Generate new private key*. Keep the JSON file private and don't commit it.
6. **GitHub.** Create a **public** repository (Pages on private repos needs a paid plan) and push this folder to it. Then:
   - Settings → Pages → Source: **GitHub Actions**
   - Settings → Secrets and variables → Actions:
     - **Variables:** `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`
     - **Secret:** `FIREBASE_SERVICE_ACCOUNT`, containing the whole JSON from step 5
7. Push to `main`. The workflow runs all tests and then deploys to `https://<user>.github.io/<repo>/`.
8. **First run.** Your friend opens the link, adds herself, taps ⚙️ (top right) and creates the admin code in the Admin card. Whoever does this first sets the code, so she should do it before the link goes out. Then send the link to the group (a ready-made message is below).

Optional extra: in Google Cloud Console → APIs & Services → Credentials, restrict the browser API key to `https://<user>.github.io/*`.

### Message for the group (Swedish)

> Hej! Nu har vi ett gemensamt stallschema 🐴 Öppna länken, välj ditt namn och tryck på de lediga (streckade) passen du kan ta. Under Inställningar kan du lägga in dina pass i telefonens kalender och lägga appen på hemskärmen. Länk: https://…

## Development

```bash
npm install
npm run dev:demo        # demo data, no Firebase (admin code 1234)
cp .env.example .env.local && npm run dev   # against your Firebase project
```

### Tests

| Command | What it covers |
|---|---|
| `npm test` | Unit tests: dates/ISO weeks/DST, schedule building, claim/release/assign rules, stats, iCal, text export, validation, sync behaviour (including the read budget), memory backend |
| `npm run test:rules` | Security rules plus the Firestore backend and calendar script against the Firestore **emulator** (needs Java) |
| `npm run test:e2e` | Playwright end-to-end on iPhone and Android viewports against the demo build: onboarding, switching person, claim/release, live updates, filter, horizon, every way of closing a sheet (incl. the back button), small-screen overflow, Swedish plurals, admin flows and warnings, calendar links, install guides, PWA manifest |
| `npm run test:all` | Everything (this is what CI runs before deploying) |

## Maintenance notes

- **Backups.** A nightly workflow saves all data as an artifact, kept for 90 days. To restore: `FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" npm run restore -- backup.json` (add `--only=2026-W48` to restore a single week).
- GitHub pauses scheduled workflows after 60 days without commits and emails you first. Click "Enable workflow" or push any commit to resume.
- Google Calendar refreshes subscribed calendars only a few times a day; iPhone can refresh hourly. The app itself is always up to date.
- Security is goodwill-level by design: anyone with the link can book. The rules still block deletes, junk data and unknown collections, and the log plus backups make any mistake recoverable.

## Structure

```
src/domain/   pure logic (dates, schedule, rules, stats, ics, feeds, validation): fully unit-tested
src/data/     Backend interface, FirebaseBackend, MemoryBackend, SyncController (visibility-aware)
src/ui/       Preact components (Swedish UI)
scripts/      build-calendars.ts, backup.ts, restore.ts (run by GitHub Actions)
tests/        unit/, rules/ (emulator), e2e/ (Playwright)
```
