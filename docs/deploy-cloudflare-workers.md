# Deploy TasteBridge on Cloudflare Workers Free

The selected deployment adds `worker/` to the existing repository. It serves the approved TasteBridge frontend through Workers Static Assets, uses native Workers AI for the fixed `@cf/meta/llama-3.3-70b-instruct-fp8-fast` planner and stores durable state in D1. The Worker implements the TasteBridge API; SafeDesk continues to use the local Python application. Render required payment-card verification, so the selected path uses the existing Cloudflare Free account with no payment card, additional spending, paid fallback or automatic upgrade.

The [public TasteBridge app](https://tastebridge-hackathon.wtr1274970944.workers.dev/tastebridge) is deployed. Actual two-member search, an initial twenty-films-per-member recommendation with three displayed poster cards and all three permitted successful exact seen-film updates are verified. Earlier rejected model outputs preserved the valid prior shortlist and a later retry succeeded. The published video shows the earlier local prototype with Codex planning; it does not demonstrate the native Worker release.

As of **2026-10-09**, Worker source revision `48890c2` passed 146 tests in eight files, TypeScript checking and dry packaging (50.69 KiB uploaded code, 13.25 KiB gzip). [Public CI](https://github.com/HootRock/safedesk-tastebridge/actions/runs/37921112133) passed backend, frontend and Worker jobs; the corresponding Cloudflare release was deployed. An independent public-source copy matched all 152 expected files by SHA-256. The Python baseline passed 216 offline tests / one live test deselected, and frontend checks passed 84 tests plus typecheck/build. These fixtures do not establish every live reliability or capacity condition.

Migration `0001`, the `DB`/`AI`/`ASSETS` bindings, encrypted Production `QLOO_API_KEY` secret and root redirect are configured and verified. Parameterless retrieval/ranking stages constrain generated arguments to `{}` and one call. Qloo responses retain a finite one-MiB bound and complete literal/decoded secret-reflection checks; only seven bounded card metadata fields are cached or persisted using a versioned cache key. Invalid/oversized optional fields are omitted without replacement data. Fixed diagnostic reasons never log provider contents or credentials.

## Build and verify offline

Use Node.js 22 and pnpm 11.25.0. From the repository root:

```powershell
pnpm --dir web install --frozen-lockfile
pnpm --dir web build
pnpm --dir worker install --frozen-lockfile
pnpm --dir worker typecheck
pnpm --dir worker test
pnpm --dir worker build
```

The last command runs the locked Wrangler version with `deploy --dry-run --outdir dist`. It does not publish the application. The Worker CI job runs the same sequence; the existing Python backend and frontend jobs remain separate.

`worker/wrangler.jsonc` defines the Worker entry point `src/index.ts`, assets directory `../web/dist`, assets binding `ASSETS`, native AI binding `AI`, and D1 binding `DB`. Building the frontend first is required so the assets directory exists. `/` redirects to `/tastebridge`, and API requests are handled by the Worker before static assets.

## Connect the repository and runtime

In Cloudflare Workers & Pages, import the full intended Git repository and select its production branch, then set the project root to `worker`. This monorepo needs the sibling `web/` directory, so use the normal repository import rather than a Deploy button that clones only the Worker subdirectory. Grant repository access directly through your own GitHub account when Cloudflare requests it. Stay on Workers Free. Use these build settings:

| Setting | Value |
|---|---|
| Project root directory | `worker` |
| Node.js / pnpm | `22` / `11.25.0` |
| Build variables | `NODE_VERSION=22`, `PNPM_VERSION=11.25.0` |
| Build command | `pnpm install --frozen-lockfile && pnpm run build:cloud` |
| Worker configuration | `worker/wrangler.jsonc` in the repository; `wrangler.jsonc` relative to the project root |
| Deploy command | `pnpm run deploy` |

The checked-in `build:cloud` script runs `pnpm --dir ../web install --frozen-lockfile && pnpm --dir ../web build`. The `deploy` script runs `pnpm db:migrate && wrangler deploy`, and `db:migrate` applies `DB` migrations remotely. Both installs use lockfiles; the deploy script stops if migration fails.

Cloudflare runs build and deploy commands relative to the configured root and uses the project's installed Wrangler version. Runtime secrets belong in **Settings → Variables & Secrets**, separately from build variables. See [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

The Git import form creates a Cloudflare Builds token when the user clicks **Deploy**; that initial deployment has now succeeded. Review the actual token-permission list when setting up another connection: the current default scopes are broad and include **D1 Edit**. Older documentation may omit that scope; use the current form when assessing the grant. The Builds token authorizes build/deployment operations and remains separate from application runtime secrets. No token value or account identifier belongs in the repository.

Confirm the deployed bindings are `AI` for Workers AI, `DB` for the intended D1 database, and `ASSETS` for the built frontend. The Qloo key is the only application runtime secret: enter `QLOO_API_KEY` directly as a Cloudflare secret. Never place its value in the repository, build command, README, CI output or screenshots. The native AI binding does not require a Cloudflare management token in the application.

For this deployment, the user has completed the Production-only Secret entry and saved `QLOO_API_KEY`; the dashboard reports its value as encrypted. Future operators should select **Secret**, enter the key directly and use **Add 1 variable** to save/deploy it. Storage of the secret and the **Live · hosted** badge establish configuration readiness, not successful Qloo authentication or a complete recommendation run.

## Provision D1 and apply the schema

The checked-in D1 binding intentionally omits an account-specific `database_id`. The locked Wrangler version supports automatic resource provisioning: on a real deployment it can create and link the D1 database described by the binding. A missing ID does not require inventing a placeholder or committing an ID from another account. Wrangler may write the real ID into the local configuration after provisioning. See [automatic D1 resource provisioning](https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/).

For a clean first deployment, create an empty D1 database named **`tastebridge-hackathon`** in the Cloudflare dashboard before running `pnpm run deploy`. This bootstrap step is required because the checked-in deploy script executes `db:migrate` before `wrangler deploy`, which otherwise performs automatic provisioning. This deployment's database was created and migration `0001` applied successfully in build `c07fd13d`; do not recreate it. Confirm the `DB` binding when preparing later migrations. Do not add data, credentials or account-specific identifiers to source.

Apply `worker/migrations/0001_initial.sql` through the deploy script or, from the repository root, the remote migration command using the binding name:

```powershell
pnpm --dir worker exec wrangler d1 migrations apply DB --remote
```

The command must resolve the intended production `DB` binding. Review the selected account/database and migration result. If automatic provisioning has not yet linked a resource for the migration command, finish provisioning or binding that empty database first, then rerun the migration. A deploy success alone does not prove the schema exists. See [D1 migration commands](https://developers.cloudflare.com/d1/wrangler-commands/#d1-migrations-apply).

The checked-in deploy script applies pending remote migrations before publishing the Worker using the confirmed binding. Inspect the initial build's provisioning and migration output before treating it as ready. An initial provision-only deployment can return API failures until migrations and the runtime secret are ready, so verify the full workflow before sharing its URL.

## Verify the public workflow

After deployment, schema initialization and runtime-secret entry, open the actual HTTPS application and verify:

1. `/` reaches `/tastebridge`, assets load, and `/api/...` paths return JSON.
2. Search resolves real Qloo movie/artist choices; confirm favorites for two to four members.
3. A recommendation produces a persisted shortlist with real per-member Qloo evidence and an actual AI-selected retrieval/ranking sequence.
4. Mark a shown film as seen. Verify that exact exclusion and the updated shortlist; repeat through all three permitted successful updates.
5. Verify a second browser session cannot access the first session's group/run and failed updates retain valid prior results without publishing partial candidates.
6. Check actual request logs/metrics for Worker CPU, D1 query use and provider failures without exposing secrets or captured Qloo data. Startup timing in build output is not a request CPU measurement.

The actual two-member initial recommendation and three successful exact seen updates have passed. The public URL can identify that functional application in the TasteBridge entry; final entrant submission/eligibility/rights confirmations remain pending. Real four-member, independent-session isolation, concurrency/capacity and long-lived availability remain broader operational checks. SafeDesk's existing local-source/video submission is unchanged.

## Free-account bounds

Application storage enforces 100 physical AI calls and 500 physical Qloo calls per UTC day, including failures and Qloo retries. Each run allows four model attempts and eight tools. Sessions/results last 24 hours; each group allows three successful seen updates. Shared leases permit two active recommendation workflows and two active Qloo requests. Provider deadlines and a 210-second Agent operation budget stop further tool work; the final awaited D1 persistence and lease cleanup can extend the HTTP response beyond that budget.

These limits do not guarantee 100 successful model calls or continuous availability. Cloudflare Workers, D1 and Workers AI Free quotas may stop the application sooner; the app fails visibly instead of switching to a paid provider. Keep the Free plan and do not enable prepaid AI Gateway credits or a paid fallback. Consult the [Workers AI Free pricing and quota documentation](https://developers.cloudflare.com/workers-ai/platform/pricing/) and verify actual account usage before public submission.

The current active-version metric sample showed six invocations and zero errors, a 5 ms CPU summary and a recent CPU p99/p999 bucket of 142 ms, without a recorded CPU-limit rejection. This does not establish that each complete request stays within the Workers Free CPU allowance or guarantee judging uptime; no real-runtime CPU improvement is claimed from metadata projection alone. Build startup timing and local synthetic benchmarks are not live CPU evidence. A fully wired synthetic four-member/retry workflow exercised 41 D1 statements including run/group reads; it is offline evidence, not a measured live query maximum.
