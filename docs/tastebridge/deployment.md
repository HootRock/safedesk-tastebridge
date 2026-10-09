# Hosted deployment release target

Selected route: **Groq Free / `openai/gpt-oss-20b`, one Render Free service and Turso Free storage**. Accounts, live model quality, remote transactions and public workflows are unverified. No paid fallback, upgrade, autoscaling, disk/database or billable overage is authorized.

[Render Free](https://render.com/docs/free) can sleep after 15 minutes idle, take about a minute to wake and lose local files across restarts. Included-hour/build/bandwidth limits can interrupt access. Use no payment method; do not accept an upgrade to resolve limits. [Groq models](https://console.groq.com/docs/models) lists the selected model; verify actual Free-plan access and rate limits during setup. [Turso pricing](https://turso.tech/pricing) lists a $0 Free plan. Capacity/availability is not assumed.

## Server environment

Keys/tokens belong only in server secret configuration. Never copy private local files or Codex authentication into the image, source or browser.

| Setting | Hosted release value |
|---|---|
| `PUBLIC_HOSTING` | `true` |
| `MODEL_PROVIDER` | `groq` |
| `CODEX_ENABLED` | `false` |
| `GROQ_API_KEY` | Private Free-plan key |
| `GROQ_MODEL_NAME` | `openai/gpt-oss-20b` |
| `QLOO_API_KEY` | Private hackathon key |
| `QLOO_BASE_URL` | `https://hackathon.api.qloo.com` |
| `REMOTE_DB_URL` | Official Turso `libsql://` or HTTPS database URL |
| `REMOTE_DB_AUTH_TOKEN` | Private database token |
| `ALLOWED_HOSTS` | Actual assigned hostname; no wildcard |
| `DAILY_MODEL_LIMIT` | Default `100` |
| `DAILY_QLOO_LIMIT` | Default `500` |

Hosted sessions, approvals, calendar commits and UTC daily claims use remote storage through the official Turso `/v2/pipeline` protocol. The application-owned HTTPX transport converts `libsql://` to HTTPS, applies 3-second connect/pool and 10-second read/write phase inactivity deadlines, and disables automatic retries and redirects. These phase deadlines do not establish a total workflow deadline. Synchronous storage operations run in a thread pool so remote waits do not block the async health route. The optional native libSQL package is for API characterization tests; it is not the production remote transport.

Missing/invalid remote settings fail closed without ephemeral SQLite fallback. Every physical provider request claims quota first; failed requests and Qloo retries count. Default daily caps are 100 model / 500 Qloo requests and persist remotely across reconstruction. Actual Free-account quotas may throttle sooner. Use one process/instance. Storage network-deadline and async availability checks passed in the full offline suite; actual live remote durability remains unverified.

Local Codex allows 90 seconds per planner request. Hosted Groq allows 20 seconds per request with no automatic model retry, a 6,000-byte cap on the complete JSON payload (including schemas/tool history), and 1,024 completion tokens. Oversized requests fail visibly without truncating evidence. No provider failure enables a paid fallback.

## Local/container paths

Local Codex keeps `MODEL_PROVIDER=codex`, `PUBLIC_HOSTING=false` and localhost binding via `scripts/start-local.ps1`. Its public guard rejects inference with `local_model_only`; subscription authentication stays local.

Container/deployment preparation is not proof of remote durability or HTTPS planner access. The [published Ubuntu CI](https://github.com/HootRock/safedesk-tastebridge/actions/runs/37887086486) passed its locked-install backend/frontend jobs, but Docker's engine is not running, so container runtime is unverified. Final integration verification must use the installed release and real Free accounts.

## Publication and public gate

Application source, lockfiles, MIT license and instructions are included in this [repository](https://github.com/HootRock/safedesk-tastebridge). Qloo responses, databases, private configuration/authentication, local history and unreviewed media are excluded from the release.

Verify health returns `public_hosting=true`, `model=groq` and provider readiness without credentials. Externally test two confirmed taste profiles → real recommendations → exact watched exclusion rerun, plus rate/error states and session behavior. Only then insert a public demo URL.

[Qloo rules](https://qloo.devpost.com/rules) require free judge access through November 16, 2026 at 23:45 Eastern Time. The [public video](https://youtu.be/Qdl879gW4MU) supplements the required functional app. Hosting accounts have not yet been set up/live tested. The required public demo and final submit receipt remain pending; final Qloo submission cannot proceed until the external workflow passes.
