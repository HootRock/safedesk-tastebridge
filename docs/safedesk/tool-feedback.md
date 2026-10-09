# SafeDesk — five-question tool feedback

Prepared from actual development evidence for entrant review under the [official submission rules](https://amazonappdev2026.devpost.com/rules). These observations distinguish used local tools from unverified hosted targets and do not supply personal learning/eligibility/rights statements.

## 1. How each tool/API was used

Use of each tool/API, prepared from development evidence for entrant review.

Official Codex CLI / gpt-6-luna: local structured task planning via eligible ChatGPT authentication and bounded application tools. It is an independent Alexa+ simulation, not an Alexa SDK integration.
Claude: AI assistance with implementation, interface work and video preparation. Codex also assisted those development activities. The published videos disclose AI assistance and use TTS narration.
Python / FastAPI: same-origin HTTP service, background planning, session ownership and application permission enforcement.
Pydantic: strict tool arguments, source/task records, provider envelopes and versioned runs.
HTTPX: controlled HTTP boundary testing and transport for server-side Qloo, hosted Groq and official Turso `/v2/pipeline` requests. Remote storage has explicit phase deadlines and synchronous operations run in a thread pool. It is not an Amazon API.
SQLite / sqlite3: local sessions, run records, preview-bound approvals and idempotent demo-calendar commits.
React / React DOM: editable drafts, source reveal, polling, calendar review and explicit confirmation.
TypeScript: frontend response types and component contracts.
Vite / pnpm: frontend bundling and locked dependency installation.
pytest / pytest-asyncio: backend permission, source/time, ownership, concurrency, replay and workflow checks.
Vitest / Testing Library / jsdom: UI behavior tests with controlled HTTP responses.
Fontsource: local font assets/licenses; SafeDesk uses Instrument Sans and Newsreader, TasteBridge uses Manrope and DM Serif Display.
Development design guidance: Impeccable, historical OpenAI frontend-skill, Anthropic frontend-design and UI UX Pro Max informed interface critique. These are development resources, not runtime integrations.
Qloo Taste AI is used only by TasteBridge for movie/artist entity search and per-member movie insights. It is not a SafeDesk/Amazon API.
Groq Free / Render Free / Turso Free are selected hosted release targets; no verified deployment or hands-on success is claimed. No Alexa SDK, AWS, Kiro, voice/device or real-calendar service was used.

## 2. What worked well

Observed strengths, rather than a promised success rate.

Codex: historical local live planning returned source-linked tasks and reviewable previews within application constraints. No separately billed local model API was needed.
Claude/Codex development assistance: helped prepare implementation, interface refinements and the English demonstration materials; results still required code/tests and human review.
Python/FastAPI and HTTPX: dependency injection and controlled HTTP fixtures exercised real routes and explicit error/version/approval boundaries.
Pydantic: unknown fields and malformed provider records were rejected; separate semantic checks verified actual source quotes and time support.
SQLite: transactional checks covered concurrent matching approvals, idempotent commits and replay after reopening storage.
React/React DOM: source and task can remain visible together; editing clears approval and completed drafts stay immutable.
TypeScript/Vite/pnpm: the 2026-10-09 frontend build passed type checking and bundling. Local font assets and license notices ship without a runtime font CDN.
pytest/pytest-asyncio: deterministic unsafe-request fixtures verified denial without external effects. The 2026-10-09 full offline backend passed 178 tests / 1 live test deselected, including storage network-deadline, async availability and lost-commit-response checks. Fixtures do not establish live hosted integration.
Vitest/Testing Library/jsdom: the current full frontend run passed 78 tests in 13 files, including empty initial recommendations, local/hosted status and visitor-facing failure recovery.
Fontsource/fonts: the two applications keep distinct typography with locally bundled assets.
Design guidance: supported iteration toward source/draft/calendar review and confirmed-taste comparison, subject to actual implementation review.
TasteBridge Qloo: real local search disambiguated movie/music favorites and insights supplied rank evidence; generated recommendations were not fabricated.
Groq/Render/Turso: not yet verified, so no favorable use result is asserted.

## 3. Limitations and improvements

Limitations and improvements needed.

Codex: process latency, nondeterministic planning and subscription allowance remain limits. Local requests allow 90 seconds; local authentication stays local. Hosted Groq allows 20 seconds per request, with a 6,000-byte complete JSON request cap and 1,024 completion-token cap. Neither route retries model requests automatically.
Claude/Codex assistance: generated suggestions require source review, meaningful tests and factual disclosure; AI output is not evidence of correctness or rights.
Python/FastAPI: one-process background jobs lack distributed scheduling and durable job recovery. Exceptions must become sanitized terminal states.
Pydantic: schema-valid output can invent unsupported facts; exact quote/date/time checks remain necessary.
HTTPX: provider/network failures need bounded timeouts and explicit error mapping. An existing Starlette TestClient/HTTPX warning was previously documented.
SQLite: local storage is not a distributed identity or real calendar service. Hosted durable storage and transaction behavior need actual remote verification; retention is not forensic erasure.
React/TypeScript: async state needs stale-response protection; compile-time types do not authorize writes or validate all remote JSON.
Vite/pnpm: a passing Windows build is not a container/Linux runtime check.
pytest and frontend test tools: fixtures establish boundaries, not universal live-model quality, visual correctness or public connectivity.
Vitest/jsdom: the full run retains an existing AuditTrail list-key warning in a clarification test; browser verification is still needed.
Fonts: typography alone cannot resolve hierarchy/readability; preserve licenses and sensible subsets.
Design guidance: interpretation and browser review remain necessary; these resources are not Amazon integrations.
TasteBridge Qloo: metadata/explanations/posters can be absent, returned rank is not probability or dislike, and requests must respect limits. Captured response data is excluded from public source.
Groq Free / Render Free / Turso Free: accounts have not yet been set up/live tested. Live quality, remote durability/capacity and external workflows are pending. Hosted daily claims persist remotely with default 100 model / 500 Qloo physical requests per UTC day; actual Free quotas may throttle sooner. Free limits and Render idle suspension can disrupt access. No paid fallback/upgrade/overage is authorized.

## 4. Onboarding and integration

Onboarding and integration observations.

Codex: the historical local integration used an existing eligible ChatGPT login and official structured-output CLI. Account/model access is required for reproduction; no authentication is exported.
Claude/Codex development assistance: used during implementation/interface/video preparation. Their contribution is disclosed; no unsupported personal learning narrative is supplied.
Python/FastAPI/Pydantic/HTTPX/SQLite: the documented local locked installation and fixture-backed HTTP tests established the prototype boundaries. Real hosted/remote installation still needs verification. The remote HTTPX transport uses 3-second connect/pool and 10-second read/write deadlines without retries or redirects; async storage callers use a thread pool.
React/React DOM/TypeScript: components follow the API contract and real behavior is tested while external HTTP is controlled. Current type checking passed.
Vite/pnpm: use the lockfile and frozen installation. The current Windows frontend tests, type checking and build passed; container runtime remains unverified because Docker's engine is not running. The included offline GitHub Actions workflow has not yet run.
pytest/pytest-asyncio: offline commands need no live provider credentials. Create the temporary work parent before the README test command.
Vitest/Testing Library/jsdom: current tests exercise real React interactions with controlled service responses; current full suite and build passed.
Fontsource: installed pinned font packages are imported locally. All four SIL OFL notices ship under web/public/assets/licenses.
Design guidance: local guidance was applied during interface iteration and checked separately from runtime correctness; local skill bundles are excluded from public runtime source.
TasteBridge Qloo: use only a private server-side hackathon key and explicitly select searched entities. Captured responses/screenshots are not shipped as source data.
Hosted target: configure MODEL_PROVIDER=groq, PUBLIC_HOSTING=true, server-only Groq/Qloo/Turso secrets, actual allowed hostname and durable daily caps. The Free-plan account setup and public workflow are not completed.
Application source, MIT license, lockfiles and local instructions are included in this [repository](https://github.com/HootRock/safedesk-tastebridge). [Public SafeDesk video](https://youtu.be/CZ6P5YcP2Cg).

## 5. Use-again recommendations for entrant review

Prepared tool recommendations for entrant review; these do not invent the entrant's personal willingness or learning answers.

Official local Codex: suitable for bounded local prototyping with existing eligible access; keep authentication local.
Claude/Codex development assistance: useful for implementation/design/video drafts when accompanied by review, tests and AI disclosure.
Python/FastAPI/Pydantic/HTTPX: suitable for the small typed and testable service boundary, with semantic permission checks and bounded failures.
SQLite: suitable for the local demo; use and verify durable remote storage deliberately for public hosting.
React/React DOM/TypeScript/Vite/pnpm: suitable for focused review workflows with locked dependencies and type/runtime validation.
pytest/pytest-asyncio and Vitest/Testing Library/jsdom: useful for deterministic boundary/regression checks, supplemented by browser/live-service evidence.
Fontsource / Instrument Sans / Newsreader / Manrope / DM Serif Display: suitable with local assets and preserved license notices.
Impeccable / historical OpenAI frontend-skill / Anthropic frontend-design / UI UX Pro Max: useful as critique guidance, not proof of functional correctness or runtime eligibility.
TasteBridge Qloo: appropriate for confirmed cross-domain taste inputs and transparent candidate-rank comparison, with missing evidence disclosed and captured data excluded from public source.
Groq Free / Render Free / Turso Free: evaluate only after accounts, costs, integration, durable storage and external judging flow are verified. Do not claim willingness based on use that has not occurred.

Entrant should review the recommendations and supply any required personal responses before submission. SafeDesk uses the local Alexa+ simulation route with source and video; it does not claim AWS or additional open-source mini-challenge participation or Amazon platform certification. This prepared feedback is included with the repository documentation.
