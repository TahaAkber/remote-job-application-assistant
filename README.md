# Job Application Assistant

Local, human-in-the-loop workspace for worldwide English-language remote job opportunities.

## Run

```powershell
npm start
```

Open `http://localhost:3000`.

## Autofill an application

1. Upload the CV and save the reusable profile fields once.
2. Add a job to the application queue.
3. Click **Autofill form** next to one queued job, or **Autofill all queued forms** to open the full daily queue in separate tabs.

The local Playwright browser keeps its own login session, fills common contact/profile fields, selects Pakistan when a country field is available, and uploads the newest saved PDF CV. If a CAPTCHA or “verify you are human” challenge appears, it shows a browser notification and sound, leaves that tab waiting, and continues processing the rest of the batch. Autofill resumes automatically after you complete the verification. It leaves the browser open for unknown required questions and final submission. It never guesses custom eligibility answers, bypasses CAPTCHAs, or presses Submit.

For a direct employer application URL:

```powershell
npm run autofill -- --url "https://employer.example/apply"
```

## What this MVP does

- Extracts text from an uploaded PDF CV and stores your profile locally in `data/store.json`.
- Fetches live remote jobs from the official/public feeds of We Work Remotely, Jobspresso, Remotive, Arbeitnow, RemoteOK and Himalayas on startup, on demand, and every 24 hours while running.
- Deduplicates listings, removes confirmed 404/410 links, scores roles against skills actually found in the uploaded CV, and maintains a review-first application queue.
- Stores common application answers (phone, location, work eligibility, notice period and salary expectation) once and copies them as a reusable application kit.
- Opens queued employer forms in a persistent local browser, fills known fields, uploads the saved CV and reports any unanswered required fields.
- Creates application email drafts only when the job listing explicitly publishes an application email address.
- Requires explicit approval before an application can be marked submitted.

## Source and submission boundaries

Virtual Vocations and FlexJobs are provided as direct search shortcuts only because their current terms prohibit automated access/scraping; FlexJobs also prohibits third-party bot prefill/auto-apply. The app does not bypass logins, paywalls, CAPTCHAs, or employer eligibility questions.

Gmail connection is still required before approved email drafts can be sent from the user's account. Portal submissions remain review-first because job boards and employer ATSs use different forms and role-specific eligibility questions.
