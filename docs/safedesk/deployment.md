# SafeDesk deployment status

Independent Alexa+ web experience simulation with demo calendar storage. No AWS deployment, Alexa SDK, real calendar account, voice/device access or certification is implemented.

Historical verified live planning uses local official Codex with eligible ChatGPT login. Keep `MODEL_PROVIDER=codex` and `PUBLIC_HOSTING=false`; authentication stays local.

Optional hosted target: Cloudflare Workers AI Free / `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, one Render Free service and Turso Free storage. Groq Free / `openai/gpt-oss-20b` remains an alternative. [Shared deployment notes](../tastebridge/deployment.md) cover server-only keys and verification. The hosted adapter uses official Turso `/v2/pipeline` requests with HTTPX deadlines and storage calls in a thread pool. Live hosting/remote durability is unverified; no paid upgrade/fallback is authorized. Cloudflare's 10,000-Neuron daily quota can stop model calls before the application's 100-request cap.

[Repository](https://github.com/HootRock/safedesk-tastebridge): application source, MIT license, lockfiles and local instructions are included in this repository. [Public English video](https://youtu.be/CZ6P5YcP2Cg): 1080p, 150.67 seconds, TTS and AI assistance disclosure.

The [Amazon FAQ](https://amazonappdev2026.devpost.com/details/faqs) permits local source/video for this simulation; public hosting is optional for that route. [SafeDesk's Devpost entry](https://devpost.com/software/safedesk) is submitted: the page displayed “Project submitted!” and its Amazon competition association after the entrant completed the submission. No AWS or additional open-source mini-challenge entry is claimed. If hosting is added, insert its URL only after external source-linked drafting, changed-preview review, explicit approval and one idempotent calendar commit pass.
