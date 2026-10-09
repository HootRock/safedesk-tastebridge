# SafeDesk & TasteBridge

Two hackathon applications, first coded on **2026-10-03**.

- **SafeDesk** turns paragraphs into tasks with exact source quotes and requires human approval before writing to a demo calendar. It is an independent Alexa+ web experience simulation.
- **TasteBridge** combines confirmed film/music preferences of 2–4 friends into a live Qloo movie shortlist, with per-person rank evidence and exact seen-film exclusions.

Local planning uses official Codex CLI, an eligible existing ChatGPT login and `gpt-6-luna`; it consumes that account's allowance. The selected hosted release target is **Cloudflare Workers AI Free / `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, one Render Free service and Turso Free storage**. Groq Free / `openai/gpt-oss-20b` remains an alternative. Live integration and public judge workflows are unverified. No paid fallback or upgrade is authorized.

## Access and submission status

| Deliverable | Status |
|---|---|
| [Source repository](https://github.com/HootRock/safedesk-tastebridge) | Application source, MIT license, dependency lockfiles and local instructions included in this repository |
| [SafeDesk video](https://youtu.be/CZ6P5YcP2Cg) | Public, English, 1080p, 150.67 seconds |
| [TasteBridge video](https://youtu.be/Qdl879gW4MU) | Public, English, 1080p, 119.47 seconds |
| Public application | Pending deployment and external verification |
| [SafeDesk entry](https://devpost.com/software/safedesk) | Submitted; Devpost displayed “Project submitted!” and the Amazon competition association |
| TasteBridge entry | Draft; required public application URL and final submission remain pending |

Both videos use TTS narration and disclose AI assistance. Codex and Claude assisted implementation, interface work and video preparation. SafeDesk has no Alexa SDK, AWS runtime, real calendar account or platform certification. No AWS or open-source mini-challenge participation is claimed.

The recordings show the earlier local prototype, with local Codex planning. They do not demonstrate the Cloudflare-hosted release. TasteBridge's current source starts with empty film frames and retrieves real Qloo data at runtime; the earlier video's sample presentation is not a bundled recommendation dataset.

The [Amazon FAQ](https://amazonappdev2026.devpost.com/details/faqs) permits local source plus video for the simulation route; SafeDesk was submitted using that route. [Qloo rules](https://qloo.devpost.com/rules) require a functional externally published application and public source. TasteBridge's free infrastructure is prepared, but deployment and live judge workflows remain unverified, so its final submission cannot proceed. Any remaining TasteBridge entrant/team, eligibility, rights or agreement fields must be confirmed by the entrant.

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

Localhost addresses are not remote judge links. Public HTTPS access will be added only after deployment passes the real workflow.

React/TypeScript → same-origin FastAPI → bounded application planner → local Codex or hosted Cloudflare/Groq structured planning and server-side Qloo. Local mode uses SQLite. Hosted mode stores sessions, approvals, idempotent commits and daily claims remotely through the official Turso `/v2/pipeline` HTTP protocol. HTTPX applies network deadlines and synchronous storage operations run in a thread pool. Actual remote service durability and public workflows remain unverified.

SafeDesk has no sending tool; only application code issues approval receipts. TasteBridge offers staged retrieval/ranking/refinement tools. Its score equally combines average and minimum candidate-rank utility, not a Qloo probability or dislike prediction. Failed updates preserve only a still-valid same-version shortlist.

| Protection | Bound |
|---|---|
| Planner requests / executed tools per run | 4 / 8 |
| Planner timeout per request | Local Codex: 90 seconds; hosted Cloudflare/Groq: 20 seconds; no automatic model retry |
| Hosted planner request / output | Complete JSON payload ≤6,000 UTF-8 bytes / ≤1,024 completion tokens |
| Qloo timeout / retry / concurrency | 10 seconds / at most one retry / 2 |
| Recommendation cache | 15 minutes; 256 successful keys per process |
| Recommendation attempts | 4 per session within 10 minutes |
| Successful seen updates | 3 per group |
| Hosted daily model / Qloo caps | Default 100 / 500 physical requests per UTC day |
| Session/result retention | 24 hours |

Hosted daily claims persist in remote storage; failed physical requests and Qloo retries count. The 6,000-byte limit includes messages, schemas and tool history; oversized requests fail visibly without truncating evidence. These application caps differ from actual Free-account quotas, which can throttle sooner. There is no paid fallback. Use one instance/process. [SafeDesk limits](docs/safedesk/limitations.md) and [TasteBridge limits](docs/tastebridge/limitations.md) list unsupported behavior.

[Cloudflare Workers AI Free](https://developers.cloudflare.com/workers-ai/platform/pricing/) supplies 10,000 Neurons per UTC day. That shared compute quota can stop requests before the application's 100-request cap; 100 successful requests per day are not promised. Stay on Workers Free, without prepaid AI Gateway credits or paid fallback. The selected model is listed in the [official JSON Mode guide](https://developers.cloudflare.com/workers-ai/features/json-mode/); the application independently validates every returned plan before executing tools.

## Verification

These commands use fixtures and contact no live providers:

```powershell
New-Item -ItemType Directory -Path work -Force | Out-Null
./.venv/Scripts/python.exe -m pytest server/tests -m 'not live' -q --basetemp=./work/test-run
pnpm --dir web test --run
pnpm --dir web build
```

The earlier 2026-10-09 release baseline passed **178 offline backend tests / 1 live test deselected** and **78 frontend tests in 13 files**, plus TypeScript `--noEmit` and Vite build. The [published source CI](https://github.com/HootRock/safedesk-tastebridge/actions/runs/37887086486) also passed its backend and frontend jobs on Ubuntu with locked installs for that earlier release. That CI run does not verify the newer Cloudflare migration. Existing Starlette deprecation and AuditTrail React list-key warnings remain. Docker's engine is not running, so container runtime is unverified. The optional live Qloo probe needs explicit `RUN_LIVE=1` and consumes real requests. See [dated evidence](docs/validation.md).

After adding Cloudflare provider support on the same date, the full offline backend passed **216 tests / 1 live test deselected**, and the full frontend passed **84 tests in 13 files**. TypeScript `--noEmit` and Vite build passed. A focused **85-test** run included the actual hosted gateway and MovieAgent with Qloo/model HTTP mocks, covering an initial recommendation and all three permitted watched-film updates within the complete 6,000-byte request cap. These checks establish no live Cloudflare response, remote Turso result, public deployment or judge workflow. New public-source CI for this migration remains pending.

## License and publication

Application code is [MIT licensed](LICENSE). Qloo responses/media retain their respective terms. The [developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide) prohibits publishing returned Qloo data in source. Exclude captured responses, databases, private work and unreviewed screenshots/recordings.

SafeDesk bundles **Instrument Sans and Newsreader**; TasteBridge bundles **Manrope and DM Serif Display**. SIL Open Font License notices ship under `web/public/assets/licenses`. Design guidance is not a runtime/Amazon integration.

Review the [SafeDesk submission](docs/safedesk/submission.md), [five-question tool feedback](docs/safedesk/tool-feedback.md) and [TasteBridge submission](docs/tastebridge/submission.md) before final acceptance.
