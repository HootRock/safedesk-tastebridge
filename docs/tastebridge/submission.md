# TasteBridge — submission draft

**Tagline:** Different tastes. One movie night. A shortlist with visible trade-offs.

**Inspiration:** Groups compromise without knowing how a proposed film relates to each person's tastes. TasteBridge combines movie/artist seeds into a transparent shortlist.

**What it does:** Two to four friends explicitly select Qloo entities. A bounded planner uses staged `recommend_for_group`, `rank_for_group` and `refine_preferences` tools. The server retrieves candidates per member, reuses duplicate retrievals and equally combines average/minimum rank utilities. It displays up to three films and supports three successful seen-film exclusions. Version checks prevent stale publication; failed updates preserve only a valid same-version shortlist.

**Qloo use:** Official hackathon `/search` disambiguates movie/artist seeds; `/v2/insights` returns film candidates. Only returned metadata/rank evidence is displayed, with retrieval timing. Missing rank is missing evidence, not dislike. Qloo supplies taste data; the model supplies bounded planning. Captured returned data is not bundled or published in source under the [developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide).

**Built with:** React/React DOM, TypeScript, Vite, Python, FastAPI, HTTPX, Pydantic, Qloo Taste AI and SQLite. Historical live planning used official local Codex CLI, `gpt-6-luna` and eligible ChatGPT login. Selected hosted target: Groq Free / `openai/gpt-oss-20b`, Render Free and Turso Free through official `/v2/pipeline` HTTP requests with network deadlines and storage calls in a thread pool. Account access, real remote behavior and live public quality are unverified. No paid fallback is authorized.

**Bounds:** Four model requests/eight tools per run. Local Codex allows 90 seconds per request; hosted Groq allows 20 seconds, a 6,000-byte complete JSON request and 1,024 completion tokens. Remotely persisted daily caps default to 100 model / 500 physical Qloo requests per UTC day, including failed requests/retries. Actual Free quotas may throttle sooner.

**Evidence:** Historical local runs exercised mixed movie/music seeds and exact seen-film feedback. The 2026-10-09 full offline backend passed 178 tests / 1 live test deselected, including storage network-deadline, async availability and lost-commit-response checks. Frontend passed 78 tests in 13 files plus typecheck/build. [Validation](../validation.md) distinguishes fixtures from live observations. The landing page shows guidance until an actual request; offline tests do not prove public availability.

**AI disclosure:** Codex and Claude assisted implementation, interface work and video preparation. The published video uses TTS and discloses AI assistance.

**Testing:** [Walkthrough/public gate](testing-instructions.md). [Tool observations](tool-feedback.md) identify used integrations and planned hosting.

**Access:** Source, MIT license, lockfiles and instructions are included in this [repository](https://github.com/HootRock/safedesk-tastebridge). **Public demo:** pending deployment/external verification; hosting accounts have not yet been set up/live tested. [Public English video](https://youtu.be/Qdl879gW4MU), 1080p, 119.47 seconds; it supplements the required functional hosted app.

**Actual first coding date:** 2026-10-03. [Official rules](https://qloo.devpost.com/rules) require public source and a functional public application. Final Qloo submission cannot proceed until the required external application workflow passes. Final submit receipt and entrant/team/eligibility/rights/agreement confirmations remain pending.
