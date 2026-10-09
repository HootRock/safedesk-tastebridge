# Verification evidence — 2026-10-09 release preparation

Observed checks, implemented release bounds and pending live hosting are distinguished below. Captured Qloo response data and unpublished screenshot links are omitted.

## Offline backend — 2026-10-09

- `python -m pytest server/tests -m 'not live' -q` — **178 passed / 1 live test deselected**, in 8.83 seconds with Python 3.12.
- The full suite covered hosted planning, remote-store fixtures, approvals, sessions and daily quota reconstruction as well as the local prototype boundaries.
- The remote transport uses application-owned HTTPX over official Turso `/v2/pipeline` with 3-second connect/pool and 10-second read/write phase inactivity deadlines, no automatic retries/redirects and storage operations in a thread pool. These are not total workflow deadlines.
- Network-deadline, async availability and lost-commit-response checks passed after the transport change, including a loopback read timeout, health-route availability during slow storage operations and idempotent replay after an uncertain commit response. The optional official SDK fixture module was installed for this run; it is not the production transport.
- One existing Starlette deprecation warning remains.
- Fixtures establish no live Groq/Turso account, capacity, remote durability or public application result.

## Public frontend — 2026-10-09

The selected SafeDesk workspace and cinematic TasteBridge design remain. Captured Qloo sample file/import/cards were removed. TasteBridge uses its existing empty-frame guidance before a real request; no replacement film dataset was created.

Health preserves `model` (`codex`/`groq`), `public_hosting` and `model_enabled`. Headers distinguish local/hosted planning. Public readiness/network/provider errors offer visitor recovery without Codex installation or private configuration instructions. SafeDesk styling/layout was unchanged.

- RED: **13 intended failures / 18 passes** in the focused tests before implementation.
- GREEN: **31 tests passed in 3 files** after implementation.
- Full frontend: `pnpm --dir web test --run` — **78 passed in 13 files**.
- `pnpm --dir web build` — TypeScript `--noEmit` and Vite build passed.
- Existing React list-key warning in the SafeDesk clarification test's `AuditTrail` remains; it is not a failed assertion.
- These frontend checks establish no container, live hosted-provider, remote-database or visual-browser result.

## Historical local observations

Earlier evidence covered source/time validation, denied tools, approval ownership/expiry, changed-preview revocation, concurrent/idempotent confirmation and restart replay. The 2026-10-06 backend run was **73 passed / 1 live test deselected**; the newer full suite above supersedes that count but does not verify live hosting.

Local Codex/Qloo flows exercised mixed movie/music seeds, multi-person retrieval and exact seen-film reruns. Live decisions were nondeterministic and establish no universal success rate or hosted quality. Captured response titles/payloads/screenshots are excluded from this public document.

Earlier desktop/narrow browser checks examined the selected workspaces, source reveal, docking/resizing, calendar views and approval. Latest public-frontend changes have automated checks only; hosted browser verification is pending.

## Media and publication

- [SafeDesk](https://youtu.be/CZ6P5YcP2Cg): Public, English, 1080p, 150.67 seconds.
- [TasteBridge](https://youtu.be/Qdl879gW4MU): Public, English, 1080p, 119.47 seconds.
- Both use TTS narration and disclose AI assistance. Codex and Claude assisted implementation, interface work and video preparation.
- Application source, MIT license, dependency lockfiles and local instructions are included in this [repository](https://github.com/HootRock/safedesk-tastebridge).
- No public app URL or final submission receipt is established here.

## Hosted release gate

Selected target: Groq Free / `openai/gpt-oss-20b`, one Render Free service and Turso Free. Hosting accounts have not yet been set up/live tested. Actual live integration, remote transactions/durability and Free-account capacity are unverified. No paid upgrade, overage or fallback is authorized.

Local Codex has a 90-second planner request timeout; hosted Groq has 20 seconds, a 6,000-byte complete JSON request cap (including schemas/tool history) and 1,024 completion-token cap. Oversized requests fail visibly without truncating evidence. Default daily caps of 100 model / 500 Qloo physical requests persist in remote storage; failed physical requests and Qloo retries count. Actual Free-account quotas may throttle sooner.

The [published source workflow](https://github.com/HootRock/safedesk-tastebridge/actions/runs/37887086486), for commit `92e5769d0ed9cb44af7f729ea652040bf4b01c11`, completed successfully on 2026-10-09. Its Ubuntu backend and frontend jobs install the locked dependencies, run the offline suites and build/typecheck the frontend. All 127 published files were downloaded and matched against the sanitized release manifest using SHA-256. Docker's engine is not running, so container runtime is still unverified.

Before claiming public readiness, complete locked install/container checks where available and verify real remote session/approval/quota durability across reconstruction. Externally test two TasteBridge profiles → genuine recommendation → exact watched exclusion rerun, without fabricated data; test rate/errors. Optional SafeDesk hosting must review sources/changed drafts, require current approval and commit once.

[Qloo rules](https://qloo.devpost.com/rules) require a functional public app and free judge access; final TasteBridge submission cannot proceed before the external workflow passes. The [Amazon FAQ](https://amazonappdev2026.devpost.com/details/faqs) permits local source/video for the SafeDesk simulation route without public hosting. No AWS or additional open-source mini-challenge entry is claimed. Entrant/team/eligibility/rights/agreement confirmations and final receipts remain pending. A saved draft is not a submitted entry.
