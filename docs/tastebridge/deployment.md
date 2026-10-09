# Hosted deployment release target

Selected route: **Cloudflare Workers AI Free / `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, one Render Free service and Turso Free storage**. The public application is not yet deployed and verified. Live model quality, remote transactions and public workflows remain unverified. Groq Free / `openai/gpt-oss-20b` remains an explicitly configured alternative. No paid fallback, upgrade, autoscaling, disk/database or billable overage is authorized.

[Render Free](https://render.com/docs/free) can sleep after 15 minutes idle, take about a minute to wake and lose local files across restarts. Included-hour/build/bandwidth limits can interrupt access. Use no payment method; do not accept an upgrade to resolve limits. [Turso pricing](https://turso.tech/pricing) lists a $0 Free plan. Capacity/availability is not assumed.

[Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) provides a recurring 10,000-Neuron free allocation per UTC day. Workers Free rejects further operations when the allocation is exhausted; paid overage requires an upgrade. This compute quota is shared with other Workers AI usage in the account and may run out before the application's request cap. Do not add prepaid AI Gateway credits, select a paid model or configure a paid fallback. A free Cloudflare account is sufficient for the [REST API setup](https://developers.cloudflare.com/workers-ai/get-started/rest-api/); the application runs on Render and does not require a separately deployed Cloudflare Worker or custom domain.

## Server environment

Keys/tokens belong only in server secret configuration. Never copy private local files or Codex authentication into the image, source or browser.

| Setting | Hosted release value |
|---|---|
| `PUBLIC_HOSTING` | `true` |
| `APP_MODE` | `live` |
| `MODEL_PROVIDER` | `cloudflare` |
| `CODEX_ENABLED` | `false` |
| `CLOUDFLARE_ACCOUNT_ID` | Actual Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Private token with Workers AI Read/Edit for that account |
| `CLOUDFLARE_MODEL_NAME` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| `QLOO_API_KEY` | Private hackathon key |
| `QLOO_BASE_URL` | `https://hackathon.api.qloo.com` |
| `REMOTE_DB_URL` | Official Turso `libsql://` or HTTPS database URL |
| `REMOTE_DB_AUTH_TOKEN` | Private database token |
| `ALLOWED_HOSTS` | Actual assigned hostname; no wildcard. Render's assigned external hostname is used when this is empty. |
| `DAILY_MODEL_LIMIT` | Default `100` physical requests, subject to Cloudflare's separate compute quota |
| `DAILY_QLOO_LIMIT` | Default `500` |

In Cloudflare, select Workers AI → Use REST API → Create a Workers AI API Token. Review the token's scope and choose the account used by the application. Use only the scoped token and account ID in Render's private environment form; do not use a Global API Key. The [OpenAI-compatible endpoint](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/) is `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1/chat/completions`. The application uses that fixed official destination and a fixed model allowlist, without AI Gateway or automatic provider switching.

The selected Llama model is explicitly listed in [Cloudflare's JSON Mode guide](https://developers.cloudflare.com/workers-ai/features/json-mode/). Planning requests use a non-streaming JSON Schema response and bounded output, without a reasoning model. The application still validates the returned plan, available tool names and arguments before execution. Structured-output failure produces an error; it never authorizes an invalid tool call or fabricates Qloo results.

Hosted sessions, approvals, calendar commits and UTC daily claims use remote storage through the official Turso `/v2/pipeline` protocol. The application-owned HTTPX transport converts `libsql://` to HTTPS, applies 3-second connect/pool and 10-second read/write phase inactivity deadlines, and disables automatic retries and redirects. These phase deadlines do not establish a total workflow deadline. Synchronous storage operations run in a thread pool so remote waits do not block the async health route. The optional native libSQL package is for API characterization tests; it is not the production remote transport.

Missing/invalid remote settings fail closed without ephemeral SQLite fallback. Every physical provider request claims quota first; failed requests and Qloo retries count. Default daily caps are 100 model / 500 Qloo requests and persist remotely across reconstruction. These application caps do not promise 100 successful model calls per day: Cloudflare's 10,000-Neuron compute quota or other Free-account rate/capacity limits may stop requests sooner. Use one process/instance. Storage network-deadline and async availability checks passed in the full offline suite; actual live remote durability remains unverified.

Local Codex allows 90 seconds per planner request. Hosted Cloudflare/Groq allows 20 seconds per request with no automatic model retry, a 6,000-byte cap on the complete JSON payload (including schemas/tool history), and 1,024 completion tokens. Oversized requests fail visibly without truncating evidence. No provider failure enables a paid fallback.

## Alternative hosted provider

For Groq, explicitly set `MODEL_PROVIDER=groq`, `GROQ_MODEL_NAME=openai/gpt-oss-20b` and the private `GROQ_API_KEY`; keep `PUBLIC_HOSTING=true`, `CODEX_ENABLED=false` and remote storage configured. [Groq's model documentation](https://console.groq.com/docs/models) describes that model. Free-account access, rate limits and the actual workflow require separate verification. Cloudflare credentials do not work on Groq, and a Cloudflare error never triggers an automatic Groq request. Keep local Codex authentication out of both hosted configurations.

## Local/container paths

Local Codex keeps `MODEL_PROVIDER=codex`, `PUBLIC_HOSTING=false` and localhost binding via `scripts/start-local.ps1`. Its public guard rejects inference with `local_model_only`; subscription authentication stays local.

Container/deployment preparation is not proof of remote durability or HTTPS planner access. The [published Ubuntu CI](https://github.com/HootRock/safedesk-tastebridge/actions/runs/37887086486) passed its locked-install backend/frontend jobs, but Docker's engine is not running, so container runtime is unverified. Final integration verification must use the installed release and real Free accounts.

## Publication and public gate

Application source, lockfiles, MIT license and instructions are included in this [repository](https://github.com/HootRock/safedesk-tastebridge). Qloo responses, databases, private configuration/authentication, local history and unreviewed media are excluded from the release.

Verify health returns `public_hosting=true`, `model=cloudflare` and provider readiness without revealing credentials. Externally test two confirmed taste profiles → real recommendations → exact watched exclusion rerun, plus rate/error states and session behavior. If explicitly using the Groq alternative, health must instead report `model=groq`. Only then insert a public demo URL.

[Qloo rules](https://qloo.devpost.com/rules) require free judge access through November 16, 2026 at 23:45 Eastern Time. The [public video](https://youtu.be/Qdl879gW4MU) supplements the required functional app and shows an earlier local prototype with Codex planning; it does not verify the hosted Cloudflare release. The current source starts with empty film frames rather than the earlier sample presentation and retrieves actual Qloo data at runtime. The required public demo and final submit receipt remain pending; final Qloo submission cannot proceed until the external workflow passes.
