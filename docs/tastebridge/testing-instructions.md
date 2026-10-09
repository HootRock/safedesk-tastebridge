# TasteBridge — testing instructions

[Public English video](https://youtu.be/Qdl879gW4MU): 1080p, 119.47 seconds, TTS and AI disclosure. Source, MIT license and local instructions are included in this [repository](https://github.com/HootRock/safedesk-tastebridge). **Public app URL:** pending deployment/external verification.

## Start locally

Follow the [README](../../README.md). Use your own server-side Qloo hackathon key and eligible local ChatGPT/Codex login. Visit `http://127.0.0.1:8000/tastebridge` on that computer. Anonymous sessions separate groups. Do not give private keys or Codex authentication to judges.

## Walkthrough

1. The initial **Find your middle ground** screen provides guidance with empty film frames, without prerecorded recommendations.
2. **Try example searches** fills queries. Explicitly select **Interstellar (2014)** for Alex and the exact **Taylor Swift** artist for Sam from live results. Typing alone does not confirm a favorite; every friend needs 1–5 confirmed favorites.
3. Optionally add third/fourth friends and confirm their movie/artist favorites. Nicknames are display names, not identities.
4. Click **Find our movie**. Successful live results show **Live Qloo data**, up to three films and returned metadata. Posters/results can change or be unavailable.
5. Use **View details** and expand **Taste details** for ranks and score. **Not in this candidate list** means missing evidence, not dislike. Group score is rank utility, not probability.
6. Click **I've seen this** on a selected film. During processing, the valid previous same-version shortlist stays visible with write actions disabled. After success, that exact entity must be absent and original favorites stay confirmed. Three successful exclusions are supported.
7. Expand **Behind the shortlist** for refinement, retrieval and ranking records.

## Failure and recovery

Vague genre/tone feedback needs clarification rather than silently changed preferences. Exact seen buttons preserve identity when titles collide.

Failed/cancelled/rate-limited updates preserve only a valid same-version shortlist and do not claim Qloo returned no films. Genuine successful empty results are shown as empty. Editing favorites clears stale cards. No failure fabricates films or switches to a paid planner.

Four runs are allowed per session in ten minutes. Wait after a session limit; rapid retries count. **Check current run** reads an unfinished job without creating another recommendation. Local Codex permits 90 seconds per planner request; hosted Groq permits 20 seconds, with a 6,000-byte complete JSON request cap and 1,024 completion-token cap. Daily/provider errors provide recovery guidance; credentials remain an operator responsibility. Hosted daily caps default to 100 model / 500 Qloo physical requests, persist remotely and count failed requests/retries. Actual Free quotas may throttle sooner; there is no paid fallback.

## Public gate

The selected Groq Free / `openai/gpt-oss-20b`, Render Free and Turso Free accounts have not yet been set up/live tested; see [deployment notes](deployment.md). After real HTTPS deployment, expect **Live · hosted** and Qloo readiness. Externally repeat two-profile confirmation → recommendations → exact watched exclusion rerun, plus rate/error states and remote state/quota reconstruction.

Keep access free throughout judging. A video, localhost address or fixture-only display cannot replace the functional externally published application required by [Qloo rules](https://qloo.devpost.com/rules). Insert a demo URL only after verification; final Qloo submission cannot proceed before this gate passes.
