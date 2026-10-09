# TasteBridge deployment

**Public application:** [TasteBridge](https://tastebridge-hackathon.wtr1274970944.workers.dev/tastebridge).

The selected runtime is **Cloudflare Workers Free with Static Assets, native Workers AI / `@cf/meta/llama-3.3-70b-instruct-fp8-fast` and D1**. Follow the [Worker deployment guide](../deploy-cloudflare-workers.md). The Worker serves TasteBridge only; SafeDesk and the original TasteBridge Python application remain available locally.

## Selected runtime

The repository's `worker/` directory implements the same-origin TasteBridge API. `ASSETS` serves the built sibling `web/` directory, `AI` calls the fixed model and `DB` stores durable application state. The application needs only `QLOO_API_KEY` as a private runtime secret; it does not need a Cloudflare management token, Turso token or local Codex credentials. Secrets belong in Production runtime configuration, never source or build variables.

Cloudflare imports the full Git repository with project root `worker`, Node.js 22 and pnpm 11.25.0. Build with `pnpm install --frozen-lockfile && pnpm run build:cloud` and deploy with `pnpm run deploy`. The latter applies pending D1 migrations before publishing. For a new account, create the empty named D1 database before the first migration; the existing deployment's database and migration are initialized and must not be recreated.

On **2026-10-09**, deployment, migration `0001`, the `AI`/`DB`/`ASSETS` bindings and encrypted Production Qloo secret were verified. The public root redirects to `/tastebridge`. Actual two-member search, an initial twenty-films-per-member recommendation with three displayed poster cards and all three permitted successful exact seen updates completed. Earlier model validation failures preserved the prior shortlist and the current release successfully retried. Final entrant submission remains pending; broader live capacity and uptime limits are documented below.

## Free-account operation

No payment card, additional spending, paid fallback or automatic upgrade is authorized. Render was not selected after requiring card verification. Native Workers AI uses the existing account's Free allocation; keep Workers Free and do not add prepaid AI Gateway credits.

D1 enforces 100 model / 500 physical Qloo calls per UTC day, including failures and retries. Shared leases allow two active recommendation workflows and two Qloo calls. Each workflow permits four model attempts and eight tools, with 20-second model and 10-second Qloo deadlines. Complete planner input is capped at 6,000 UTF-8 bytes and output at 1,024 completion tokens. A 210-second Agent operation budget stops further tool work; final awaited persistence/cleanup can extend the HTTP response. Groups support three successful seen updates; sessions/results expire after 24 hours.

The [Workers AI pricing documentation](https://developers.cloudflare.com/workers-ai/platform/pricing/) describes the shared 10,000-Neuron free daily allocation. It is independent of the application's request cap; 100 successful calls are not promised. Workers CPU, D1 quotas and service availability can interrupt access. The current active-version metric sample showed six invocations and zero errors, a 5 ms CPU summary and a recent CPU p99/p999 bucket of 142 ms, with no recorded CPU-limit rejection. This does not establish that each complete request stays within the Workers Free CPU allowance or guarantee judging uptime. Build startup timing and local synthetic benchmarks are not live CPU evidence.

## Preserved Python alternatives

The source retains Python hosting support for Cloudflare Workers AI REST, Groq and Turso, with a Render service definition. These are **not the selected deployment**. Their tokens, environment variables, storage transport and health response describe the Python alternative, not the native Worker.

For that alternative, `PUBLIC_HOSTING=true`, `APP_MODE=live`, `CODEX_ENABLED=false` and an explicitly selected hosted provider are required. Cloudflare REST uses `MODEL_PROVIDER=cloudflare`, a scoped Workers AI token, an account ID and the fixed model; Groq instead uses `MODEL_PROVIDER=groq`, `GROQ_MODEL_NAME=openai/gpt-oss-20b` and its own private key. Neither provider is an automatic fallback. Hosted Python storage requires `REMOTE_DB_URL` and `REMOTE_DB_AUTH_TOKEN`, while `ALLOWED_HOSTS` identifies the actual hostname without a wildcard. Private values are not included in this repository.

Python remote storage uses Turso's official `/v2/pipeline` protocol through HTTPX, with connection/pool and read/write phase deadlines, disabled automatic redirects/retries and synchronous work in a thread pool. Missing settings fail closed without ephemeral SQLite fallback. Its actual cloud deployment and durability are not established by native Worker checks. Render's card request caused that route to be rejected for this release. Local Codex remains local with `PUBLIC_HOSTING=false` and `MODEL_PROVIDER=codex`.

## Publication gate

Source, MIT license, lockfiles and instructions are public in the [repository](https://github.com/HootRock/safedesk-tastebridge). Captured Qloo responses, databases, authentication, local history and unreviewed media are excluded. The [public video](https://youtu.be/Qdl879gW4MU) demonstrates the earlier local prototype with Codex planning and supplements, rather than proves, the native Worker app.

The [live two-member acceptance workflow](testing-instructions.md#public-acceptance-gate) passed an initial recommendation and all three successful exact seen exclusions, including recovery after rejected updates. Real four-member, independent-session, concurrency/capacity and long-lived availability checks remain broader operational limits. [Qloo rules](https://qloo.devpost.com/rules) require free judge access through November 16, 2026 at 23:45 Eastern Time. Final submission and entrant eligibility/rights/agreement confirmations remain pending.
