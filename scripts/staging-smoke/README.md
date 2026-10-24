# Staging smoke: role click-through

Run after each staging deploy:

```bash
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/staging-smoke/role-clickthrough.mjs
```

What it does, against `e2e-school.circles.saythanks.org` on the shared staging Supabase (`lms` schema):

1. Creates temporary student, teacher and admin users plus one course, lesson, AI task, essay exercise and a student entitlement.
2. Crawls up to 45 `/dashboard/<role>` links per role and fails on any HTTP status ≥ 400, 5xx sub-request, page error or error text.
3. As the teacher, opens the lesson AI task step and the exercise AI Evaluation step and checks the AI-evals test panels render. It does not run AI grading (that needs the school's own AI key).
4. Deletes the seeded rows and the users (through `/api/account/delete`), even when a check fails.

It reads the staging anon and service-role keys from `.env.local` (or `ENV_FILE`). Screenshots of failures and `results.json` go to `test-results/staging-smoke/` (or `SMOKE_OUT`). Set `ONLY_AI=1` to run just the AI-evals checks. Exit code is 1 when any check fails.
