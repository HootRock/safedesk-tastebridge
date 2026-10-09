# SafeDesk & TasteBridge

Two hackathon applications, first coded on **2026-10-03**.

- **SafeDesk** turns paragraphs into tasks with exact source quotes and requires human approval before writing to a demo calendar. It is an independent Alexa+ web experience simulation.
- **TasteBridge** combines confirmed film/music preferences of 2–4 friends into a live Qloo movie shortlist, with per-person rank evidence and exact seen-film exclusions.

**Public TasteBridge app:** [Open TasteBridge](https://tastebridge-hackathon.wtr1274970944.workers.dev/tastebridge). Its runtime is the additive **Cloudflare Workers Free target in `worker/`, with Static Assets, D1 and native Workers AI / `@cf/meta/llama-3.3-70b-instruct-fp8-fast`**. Deployment, schema initialization and the encrypted Production Qloo secret are configured. Real two-member search, an initial twenty-films-per-member recommendation with three poster cards and all three permitted successful exact seen updates are verified. See the [walkthrough and operational limits](docs/tastebridge/testing-instructions.md).

Local planning uses official Codex CLI, an eligible existing ChatGPT login and `gpt-6-luna`, consuming that account's allowance. Subscription authentication stays local. The Python application remains available for both projects, with earlier hosting alternatives preserved. The hosted app uses the existing Cloudflare Free account without a payment card or additional spending; Render was not selected after requiring card verification. Follow the [Cloudflare deployment guide](docs/deploy-cloudflare-workers.md). No paid fallback or upgrade is authorized.

## Access and submission status

| Deliverable | Status |
|---|---|
| [Source repository](https://github.com/HootRock/safedesk-tastebridge) | Application source, MIT license, dependency lockfiles and local instructions included in this repository |
| [SafeDesk video](https://youtu.be/CZ6P5YcP2Cg) | Public, English, 1080p, 150.67 seconds |
| [TasteBridge video](https://youtu.be/Qdl879gW4MU) | Public, English, 1080p, 119.47 seconds |
| [TasteBridge application](https://tastebridge-hackathon.wtr1274970944.workers.dev/tastebridge) | Deployed; real two-member recommendation and all three successful seen updates verified |
| [SafeDesk entry](https://devpost.com/software/safedesk) | Submitted; Devpost displayed “Project submitted!” and the Amazon competition association |
| [TasteBridge entry](https://devpost.com/software/tastebridge-uvnd7z) | Submitted on 2026-10-09; the official entry page displayed **SUBMITTED**, with **5/5 steps complete**, after the entrant personally completed final acceptance |

Both videos use TTS narration and disclose AI assistance. Codex and Claude assisted implementation, interface work and video preparation. SafeDesk has no Alexa SDK, AWS runtime, real calendar account or platform certification. No AWS or open-source mini-challenge participation is claimed.

The recordings show the earlier local prototype, with local Codex planning. They do not demonstrate the Cloudflare-hosted release. TasteBridge's current source starts with empty film frames and retrieves real Qloo data at runtime; the earlier video's sample presentation is not a bundled recommendation dataset.

The [Amazon FAQ](https://amazonappdev2026.devpost.com/details/faqs) permits local source plus video for the simulation route used by SafeDesk. [Qloo rules](https://qloo.devpost.com/rules) require a functional externally published application, public source and free judge access through November 16, 2026 at 23:45 Eastern Time. TasteBridge's core public workflow is verified, and the entrant personally completed final acceptance and submission on 2026-10-09. Free-account capacity and ongoing judging availability remain operational limitations.

## Run locally on Windows

Prerequisites: Python 3.12+, Node.js 22+, pnpm 11.25.0 and official Codex CLI. Live local planning requires your own eligible ChatGPT login; TasteBridge also needs a server-side Qloo hackathon key from the [developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide).

From the repository root in PowerShell:

```powershell
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r server/requirements.lock
./.venv/Scripts/python.exe -m pip install --no-deps -e ./server
pnpm --dir web install --frozen-lockfile
pnpm --dir web build
if (!(Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
codex login
```

Edit private local configuration:

| Setting | Local value / purpose |
|---|---|
| `MODEL_PROVIDER` | `codex` |
| `CODEX_ENABLED` | `true` |
| `CODEX_EXECUTABLE` | `codex` or the installed official CLI's absolute path |
| `MODEL_NAME` | `gpt-6-luna`; account access required |
| `QLOO_API_KEY` | Private key; TasteBridge only |
| `PUBLIC_HOSTING` | `false` |
| `DATA_DIR` | `./data` for local SQLite |

Keep `QLOO_BASE_URL=https://hackathon.api.qloo.com`. Keys stay server-side. Never commit private environment files, databases, browser sessions or Codex authentication. Use plain `NAME=value` lines without shell quotes.

```powershell
./scripts/start-local.ps1
```

Keep the terminal open and visit [SafeDesk](http://127.0.0.1:8000/safedesk) or [TasteBridge](http://127.0.0.1:8000/tastebridge). Stop with Ctrl+C. The script leaves an occupied port alone; use `-Port 8001` if needed. Restart after backend/config edits and rebuild after frontend edits.

TasteBridge starts with guidance and empty film frames. Confirm favorites and request recommendations before films appear. No captured Qloo response or replacement film dataset is bundled. Failures never fabricate recommendations.

## Walkthroughs and architecture

- [SafeDesk guide](docs/safedesk/testing-instructions.md): source-linked draft → preview → explicit approval.
- [TasteBridge guide](docs/tastebridge/testing-instructions.md): confirmed entities → shortlist → exact seen-film update.
- [Validation](docs/validation.md): dated checks and pending verification.
- [Hosting notes](docs/tastebridge/deployment.md): selected free services and server configuration.

Localhost addresses are not remote judge links. The [public TasteBridge app](https://tastebridge-hackathon.wtr1274970944.workers.dev/tastebridge) uses the native Worker runtime described below.

**Hosted TasteBridge:** React/TypeScript → same-origin Cloudflare Worker → bounded native Workers AI planner and server-side Qloo. D1 stores sessions, confirmed choices, versioned groups, runs, shared leases, private recommendation cache and physical-request quota claims. Static Assets serve the frontend; the root redirects to `/tastebridge`. The Worker does not host SafeDesk's API.

**Local applications:** React/TypeScript → FastAPI → local Codex planner, server-side Qloo for TasteBridge and SQLite. Earlier Python Cloudflare/Groq/Render/Turso alternatives remain in source; their REST tokens and remote storage settings are not used by the selected Worker deployment.

SafeDesk has no sending tool; only application code issues approval receipts. TasteBridge offers staged retrieval/ranking/refinement tools. Its score equally combines average and minimum candidate-rank utility, not a Qloo probability or dislike prediction. Failed updates preserve only a still-valid same-version shortlist.

| Protection | Bound |
|---|---|
| Planner requests / executed tools per run | 4 / 8 |
| Planner timeout per request | Local Codex: 90 seconds; native Workers AI: 20 seconds; no automatic model retry |
| Hosted planner request / output | Complete JSON payload ≤6,000 UTF-8 bytes / ≤1,024 completion tokens |
| Qloo timeout / retry / concurrency | 10 seconds / at most one retry / 2 |
| Qloo response body | ≤1 MiB; oversized responses fail visibly |
| Recommendation cache | Private D1 storage; less than 15 minutes; at most 256 entries |
| Recommendation attempts | 4 per session within 10 minutes |
| Successful seen updates | 3 per group |
| Hosted daily model / Qloo caps | Default 100 / 500 physical requests per UTC day |
| Session/result retention | 24 hours |

Hosted daily claims persist in D1; failed physical requests and Qloo retries count. Shared leases allow two active recommendation workflows and two active Qloo calls. The 6,000-byte planner limit includes messages, schemas and history; oversized inputs fail without truncating evidence. Parameterless retrieval/ranking stages constrain generated arguments to `{}` and one proposed call, followed by strict application validation. A 210-second Agent operation budget stops further tool work; awaited final persistence and lease cleanup can extend the HTTP response beyond it.

Qloo card metadata is projected to seven bounded fields used by the interface. Oversized or mistyped optional values are omitted without inventing replacements; unused rich properties are not cached or persisted. Complete response checks reject literal or decoded key reflections before projection, and a versioned cache key separates compact metadata from the older schema. These application bounds differ from actual Free-account quotas. There is no paid fallback. [SafeDesk limits](docs/safedesk/limitations.md) and [TasteBridge limits](docs/tastebridge/limitations.md) list unsupported behavior.

[Cloudflare Workers AI Free](https://developers.cloudflare.com/workers-ai/platform/pricing/) supplies 10,000 Neurons per UTC day. That shared compute quota can stop requests before the application's 100-request cap; 100 successful requests per day are not promised. Stay on Workers Free, without prepaid AI Gateway credits or paid fallback. The selected model is listed in the [official JSON Mode guide](https://developers.cloudflare.com/workers-ai/features/json-mode/); the application independently validates every returned plan before executing tools.

## Verification

These commands use fixtures and contact no live providers:

```powershell
New-Item -ItemType Directory -Path work -Force | Out-Null
./.venv/Scripts/python.exe -m pytest server/tests -m 'not live' -q --basetemp=./work/test-run
pnpm --dir web test --run
pnpm --dir web build
pnpm --dir worker install --frozen-lockfile
pnpm --dir worker typecheck
pnpm --dir worker test
pnpm --dir worker build
```

On **2026-10-09**, the latest Worker source passed **146 tests in 8 files**, TypeScript checking and a Wrangler dry run (50.69 KiB uploaded code, 13.25 KiB gzip). The Python baseline passed **216 offline tests / 1 live test deselected**; frontend checks passed **84 tests in 13 files**, typecheck and Vite build. The [latest public CI](https://github.com/HootRock/safedesk-tastebridge/actions/runs/37921112133) passed backend, frontend and Worker jobs, and Cloudflare deployed the corresponding release. Fixtures and build output do not replace live acceptance checks.

Live verification established the public frontend, initialized D1 schema, encrypted Production Qloo secret, actual movie/artist search, an initial twenty-films-per-member recommendation with three poster cards, and all three successful exact seen-film updates. Earlier rejected feedback attempts preserved the previous shortlist and a later retry succeeded. A fresh independent public-source copy matched all 152 expected files by SHA-256. A fully wired synthetic four-member/retry workflow exercised 41 D1 statements including run/group reads; real four-member, independent-session and concurrency/capacity behavior remain broader live checks.

The current active-version metric sample showed six invocations and zero errors, a 5 ms CPU summary and a recent CPU p99/p999 bucket of 142 ms, without a recorded CPU-limit rejection. These aggregates do not establish that each complete request stays within the Workers Free CPU allowance or guarantee judging uptime. No real-runtime CPU improvement is claimed from the metadata projection alone.

Existing Starlette deprecation and AuditTrail React list-key warnings remain. Docker's engine is not running, so container runtime is unverified. The optional live Qloo probe needs explicit `RUN_LIVE=1` and consumes real requests. See [dated evidence](docs/validation.md).

## License and publication

Application code is [MIT licensed](LICENSE). Qloo responses/media retain their respective terms. The [developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide) prohibits publishing returned Qloo data in source. Exclude captured responses, databases, private work and unreviewed screenshots/recordings.

SafeDesk bundles **Instrument Sans and Newsreader**; TasteBridge bundles **Manrope and DM Serif Display**. SIL Open Font License notices ship under `web/public/assets/licenses`. Design guidance is not a runtime/Amazon integration.

The [SafeDesk submission](docs/safedesk/submission.md), [five-question tool feedback](docs/safedesk/tool-feedback.md) and [TasteBridge submission](docs/tastebridge/submission.md) document the project descriptions and disclosures. Both competition entries are submitted.
