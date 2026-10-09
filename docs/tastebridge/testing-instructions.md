# TasteBridge — testing instructions

**Open the [public TasteBridge app](https://tastebridge-hackathon.wtr1274970944.workers.dev/tastebridge).** It runs on Cloudflare Workers Free with native Workers AI / `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, D1 and Static Assets. No judge API key or local Codex login is required. [MIT source and lockfiles](https://github.com/HootRock/safedesk-tastebridge) are public.

The [English video](https://youtu.be/Qdl879gW4MU) is 1080p, 119.47 seconds, with TTS and AI disclosure. It demonstrates the earlier local prototype with local Codex planning; the current hosted runtime uses native Workers AI.

## Walkthrough

1. The initial **Find your middle ground** screen provides guidance with empty film frames, without prerecorded recommendations.
2. **Try example searches** fills queries. Explicitly select **Interstellar (2014)** for Alex and the exact **Taylor Swift** artist for Sam from live results. Typing alone does not confirm a favorite; each friend needs 1–5 confirmed favorites.
3. Optionally add third/fourth friends and confirm their movie/artist favorites. Nicknames are display names, not identities. Real four-member acceptance remains unverified; the complete two-member walkthrough below was exercised.
4. Click **Find our movie**. Successful results show **Live Qloo data**, up to three films and returned metadata. Posters and candidates can change or be unavailable.
5. Use **View details** and expand **Taste details** for ranks and score. **Not in this candidate list** means missing evidence, not dislike. Group score is rank utility, not probability.
6. Click **I've seen this** on a selected film. During processing, the valid prior same-version shortlist stays visible with write actions disabled. After success, that exact entity must be absent and original favorites stay confirmed. Three successful exclusions are supported per group; further requests are rejected by the server.
7. Expand **Behind the shortlist** for refinement, per-member retrieval and ranking records.

## Verified acceptance as of 2026-10-09

The public deployment, remote migration `0001`, `DB`/`AI`/`ASSETS` bindings, encrypted Production Qloo secret and root redirect were verified. Actual Qloo searches resolved film/artist entities, and an initial live recommendation returned twenty films per member with three poster cards. The current source's two-member workflow completed all three permitted successful seen updates; each excluded exact film ID remained absent from the final shortlist.

Two earlier feedback attempts failed strict model validation while preserving the previous shortlist. After the corrected parameterless stage constraint was deployed, retrying the same shown film succeeded. No failure generated substitute recommendations or published a partial update.

The Worker source revision `48890c2` passed 146 offline tests in eight files, TypeScript checking and the Wrangler dry run. [Public CI](https://github.com/HootRock/safedesk-tastebridge/actions/runs/37921112133) passed backend, frontend and Worker jobs. A fresh independent public-source copy matched all 152 expected files by SHA-256, with no missing or extra files. The Python baseline passed 216 offline tests / one live test deselected; frontend checks passed 84 tests in thirteen files, typecheck and Vite build. Fixture checks do not establish every live capacity or reliability condition.

## Failure and recovery

Vague genre/tone feedback needs clarification rather than silently changed preferences. Exact seen buttons preserve identity when titles collide.

Failed/cancelled/rate-limited updates preserve only a valid same-version shortlist and do not claim Qloo returned no films. Genuine successful empty results are shown as empty. Editing favorites clears stale cards. No failure fabricates films or switches to a paid planner.

Four runs are allowed per session in ten minutes. Failed attempts count, so wait after a session limit rather than rapidly retrying. **Check current run** reads an unfinished job without creating another recommendation. Native Workers AI permits 20 seconds per planner request, a 6,000-byte complete JSON input and 1,024 output tokens, without automatic model retry. The local Codex alternative permits 90 seconds.

D1 persists caps of 100 model / 500 Qloo physical calls per UTC day, including failures and retries. Shared leases allow two active recommendation workflows and two active Qloo calls. Sessions/results expire after 24 hours. Free quotas can stop access sooner; no paid fallback is configured. A 210-second Agent operation budget stops further tool work, while final awaited persistence/cleanup may extend the HTTP response beyond it.

## Public acceptance gate

The required externally accessible two-member recommendation and all three successful exact seen updates are verified. Final Devpost submission and entrant team/eligibility/rights/agreement confirmations remain pending. The entrant must keep access free throughout judging under [Qloo rules](https://qloo.devpost.com/rules), through November 16, 2026 at 23:45 Eastern Time.

Broader checks remain operational limits: real four-member recommendations, independent-session isolation, concurrency/capacity, long-lived availability and complete request CPU/D1 behavior have not all been measured live. A synthetic fully wired four-member workflow, with each physical Qloo request retried once, exercised 41 D1 statements including run/group reads; that is offline evidence, not a live maximum measurement.

After the current compact-metadata release, the active-version metric sample showed six invocations and zero errors, a 5 ms CPU summary and a recent CPU p99/p999 bucket of 142 ms. No CPU-limit rejection was recorded in that observation. These aggregates do not prove each complete request stays within the Workers Free CPU allowance or guarantee judging uptime. Build startup timing and local synthetic benchmarks are not live CPU evidence. Keep Workers Free; no card, additional spending or paid upgrade is authorized.

## Run locally or reproduce offline checks

Follow the [README](../../README.md). Local inference requires your own eligible ChatGPT/Codex login; local TasteBridge also requires your own server-side Qloo key. Visit `http://127.0.0.1:8000/tastebridge` on that computer. Localhost is not a remote judge link, and private credentials must not be given to judges.

For locked Worker installs, typecheck, fixture tests and dry packaging, follow the [deployment guide](../deploy-cloudflare-workers.md#build-and-verify-offline). The dry run does not publish an app. Never save captured Qloo responses, private sessions or credentials in public source.
