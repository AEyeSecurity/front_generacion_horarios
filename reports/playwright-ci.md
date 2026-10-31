# Isolated Playwright E2E

## Why CI failed

The old workflow ran Playwright without building/starting Next.js. `webServer` was commented out and no Django/database/users were provisioned. `ECONNREFUSED ::1:3000` happened before authentication. Previous manual server startup did not validate the CI lifecycle.

## Run locally

Keep Shift-Frontend and Shift-Backend as sibling directories. Install Python 3.10 dependencies in the backend virtualenv with `python -m pip install -r requirements-e2e.txt`, and run `npm ci` in the frontend. Install Chromium with `npx playwright install chromium` (Linux CI also uses `--with-deps`). Then, from Shift-Frontend:

```sh
npm run e2e
```

This builds Next.js with the isolated environment, then runs the complete Chromium suite. No manual servers or saved login file are needed. Ports 3000 and 18000 must be free; an existing process is never reused. For a separate build/test sequence use `npm run e2e:build` then `npm run e2e:test`.

## Lifecycle and isolation

1. GitHub checks out both repositories side by side and installs locked Python dependencies and npm dependencies (`npm ci`).
2. `e2e:build` overrides the frontend API/cookie environment and builds Next.js. A stamp tied to `.next/BUILD_ID` prevents starting a stale production/developer build for isolated tests.
3. Playwright `webServer` starts `scripts/e2e-server.mjs backend`, which launches the backend's `scripts/run_e2e.py`. It creates a fresh `TemporaryDirectory`, selects `config.e2e_settings`, migrates SQLite and creates two verified, non-superuser accounts.
4. Backend HTTP readiness checks the database and seeded users at `/__e2e__/ready/`. This endpoint exists only in the E2E URL configuration.
5. Playwright starts `next start --port 3000` through the same Node launcher and waits for `http://localhost:3000/login`. Next binds its default interfaces, covering localhost's IPv4/IPv6 resolution.
6. The setup project logs in through Next/BFF/Django, verifies dashboard access, refresh cookies and user identity, and writes a fresh ignored `playwright/.auth/user.json`. A failed login removes any previous state file first.
7. Tests run with one worker and zero retries. Playwright owns shutdown. Python closes connections and cleans its temporary directory on graceful shutdown; the GitHub runner discards its filesystem even if forcibly terminated. Windows process-tree termination may leave a temporary directory until OS cleanup, but it is never reused.

Build occurs before backend startup because Next does not require an authenticated API during this build. Migrations and seeding finish before either auth setup or any test runs. Readiness uses Playwright HTTP checks, not arbitrary sleeps.

SQLite is a file in the newly allocated OS temporary directory, never `Shift-Backend/db.sqlite3`. The launcher ignores supplied database directories and settings modules; E2E settings disable dotenv, discard `DATABASE_URL`, and define only this SQLite database. Email uses locmem, OAuth client configuration is empty, cache/media/static storage are local. No Supabase/production database credentials are required or used. This suite verifies HTTP/application flows; it does not validate PostgreSQL-specific concurrency semantics.

## Environment

The workflow declares these values explicitly; the local launcher supplies the same values and overrides developer `.env.local` values for them:

| Variable | Isolated value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:18000` |
| `AUTH_ACCESS_COOKIE` / `AUTH_REFRESH_COOKIE` | `access` / `refresh` |
| `AUTH_COOKIE_DOMAIN` / `AUTH_COOKIE_SECURE` | empty (host-only) / `false` for loopback HTTP |
| `E2E_EMAIL` / `E2E_PASSWORD` | `e2e-owner@example.invalid` / dedicated non-secret fixture password in `scripts/e2e-env.mjs` |
| `E2E_SOLVER_REVIEWER_PASSWORD` | dedicated fixture password; account `solver-reviewer@example.invalid` |
| `E2E_BACKEND_DIR` | defaults to `../Shift-Backend` |
| `E2E_PYTHON` | optional interpreter path; otherwise backend `.venv`, then `python` |
| `E2E_BASE_URL` | empty for isolated CI |

The Python launcher sets `DJANGO_SETTINGS_MODULE`, `SHIFT_E2E_DB_DIR` and `PYTHON_DOTENV_DISABLED` itself. Personal credential fallbacks were removed from the tests.

## Repository checkout in GitHub

The existing `.github/workflows/playwright.yml` remains the sole E2E workflow. Deploy the backend E2E files before running the frontend workflow against that backend revision. It checks out `ShiftScheduler/Shift-Backend` at `inputs.backend_ref`, repository variable `E2E_BACKEND_REF`, or `main`, in that order. Set the variable/input to a commit SHA to reproduce an exact frontend/backend pair. Both SHAs are printed in the job log.

If Shift-Backend is private, configure `E2E_REPO_READ_TOKEN` with read-only Contents access to that repository (a GitHub App token or fine-grained PAT). The frontend's default `GITHUB_TOKEN` cannot read another private repository. Fork PRs do not receive this secret; they cannot run the cross-private-repository job without an authorized workflow run. Do not change this workflow to `pull_request_target` to bypass that restriction. No deployment, SMTP, Supabase or production credentials belong in this job.

## External environment support

Setting `E2E_BASE_URL` disables both local webServers and environment overrides. Run `npx playwright test --project=chromium` with `E2E_EMAIL` and `E2E_PASSWORD` for that environment; multi-user tests also need the reviewer fixture/password. Do not use `npm run e2e` for external mode (it intentionally refuses a local build). External environments are user-managed and **are not covered by the temporary database guarantee**. The GitHub job explicitly uses isolated mode.

## Verification

Verified on 2026-10-29, Windows, Node 22.20.0 and Python 3.10.11:

- `npm run e2e:build`: production build and TypeScript passed with isolated environment overrides.
- `CI=true npm run e2e:test`: **15 passed in 1.4 minutes**, zero retries, no skipped Chromium cases, both services automatically managed by Playwright. No manually started server was used.
- `python scripts/test_e2e_settings.py`: **2 passed**. External database/SMTP environment values cannot override isolation; an unmarked database directory is refused.
- `pip check`: dependency set consistent. Workflow YAML and isolation variables validated.
- First full run exposed four test assumptions, corrected without changing application code: removed onboarding selector, Next 308 redirects incorrectly counted as final resource responses, developer-specific access-cookie suffix, and obsolete Spanish Reject all text. The second run above uses a fresh database and passes the complete suite.

The hosted Ubuntu job itself was not executed from this session. It still needs the two repositories' changes published and, if private, cross-repository checkout access configured. CI pins Node 22.20.0, Python 3.10, Ubuntu 24.04, npm's lockfile and a separate fully pinned Python E2E dependency list. Production requirements/settings remain unchanged.

## Files changed

Frontend: existing `.github/workflows/playwright.yml`, `playwright.config.ts`, `package.json`; new `scripts/e2e-env.mjs`, `scripts/e2e-server.mjs`; auth/helpers plus contract/sharing/solver test corrections; this report. The existing ignored auth-state directory remains untracked.

Backend: new `config/e2e_settings.py`, `config/e2e_urls.py`, `scripts/run_e2e.py`, `scripts/test_e2e_settings.py`, `requirements-e2e.txt`. No domain, API, production setting, cache architecture or solver implementation was modified.

References: [Playwright webServer](https://playwright.dev/docs/test-webserver), [checkout across repositories](https://github.com/actions/checkout).
