# Job Application Assistant

Local, human-in-the-loop workspace for worldwide English-language remote job opportunities.

## Run

```powershell
npm start
```

Open `http://localhost:3000`.

## What this MVP does

- Extracts text from an uploaded PDF CV and stores your profile locally in `data/store.json`.
- Fetches live remote jobs from Remotive, Arbeitnow, RemoteOK, Himalayas and Jobicy on startup, on demand, and every 24 hours while running.
- Deduplicates listings, removes confirmed 404/410 links, scores roles against the CV stack, and maintains a review-first application queue.
- Creates application email drafts only when the job listing explicitly publishes an application email address.
- Requires explicit approval before an application can be marked submitted.

## Next integration work

Gmail connection is still required before approved email drafts can be sent from the user's account. Portal submissions remain review-first because job boards use different forms and eligibility questions.
