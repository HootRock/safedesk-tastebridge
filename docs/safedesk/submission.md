# SafeDesk — submission draft

**Tagline:** Turn outside documents into traceable tasks, then approve exactly what reaches your calendar.

**Problem and solution:** Document-reading agents can encounter instructions that conflict with the user's request. SafeDesk treats paragraphs as data, validates exact source quotes and supported dates, exposes a reviewable task draft and requires a session-bound receipt before writing to a demo calendar. Application code enforces permissions and confirmation.

**Experience:** Paste a document, inspect tasks/source paragraphs, save edits and explicitly approve the current preview. The execution record distinguishes risk hints, allowed operations, denials and recovery. No external sending tool exists. Repeated matching confirmations return one saved commit instead of duplicate events.

**Track and implementation:** Independent Alexa+ simulated web experience. React/React DOM, TypeScript, Vite, Python, FastAPI, Pydantic and SQLite underpin the verified local prototype. Official Codex CLI with `gpt-6-luna` and eligible ChatGPT login supplied local planning. No Alexa SDK, AWS runtime, real calendar integration or Amazon certification was implemented. No AWS or open-source mini-challenge participation is claimed.

**Optional hosted target:** Groq Free / `openai/gpt-oss-20b`, one Render Free service and Turso Free durable storage through official `/v2/pipeline` HTTP requests. Accounts and live public workflows are unverified. Local Codex has a 90-second request timeout; hosted Groq has 20 seconds, a 6,000-byte complete JSON request cap and 1,024 completion-token cap. Remote daily claims enforce default 100 model / 500 Qloo physical requests per UTC day, but actual Free quotas may throttle sooner. No paid fallback is authorized; Codex stays local only.

**Evidence:** Historical local planning and approved demo-calendar writes were observed. Automated checks cover source/time validation, forbidden tools, approval expiry/ownership, changed previews, concurrency and restart replay. The 2026-10-09 full offline backend passed 178 tests / 1 live test deselected, including storage network-deadline, async availability and lost-commit-response checks. Frontend verification passed 78 tests in 13 files plus typecheck/build. [Validation](../validation.md) distinguishes dated evidence from pending live checks.

**AI disclosure:** Codex and Claude assisted implementation, interface work and video preparation. The published video uses TTS narration and discloses AI assistance.

**Testing:** [Walkthrough](testing-instructions.md). **Feedback:** [five questions for used tools](tool-feedback.md), prepared for entrant review.

**Access:** Source, MIT license, lockfiles and local instructions are included in this [repository](https://github.com/HootRock/safedesk-tastebridge). [Public English video](https://youtu.be/CZ6P5YcP2Cg), 1080p, 150.67 seconds. **Optional public demo:** pending deployment/external verification.

**Actual first coding date:** 2026-10-03. The [FAQ](https://amazonappdev2026.devpost.com/details/faqs) permits locally runnable source plus video for the simulation route, so public hosting is not required for this entry. No AWS or additional open-source mini-challenge entry is claimed. Final submit receipt is pending. Entrant/team details, eligibility, rights and agreement acceptance must be confirmed by the entrant.
