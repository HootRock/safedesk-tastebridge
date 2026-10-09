# SafeDesk limitations

- Independent Alexa+ web simulation with demo calendar. No AWS runtime, Alexa SDK, real calendar account, voice input, sending/device control or certification.
- Injection is not universally detected. Risk hints support review; exact source/time validation and server tool permissions are the enforced boundary. A hint is not proof of denial.
- Date parsing supports ISO and limited English/Chinese relative dates. Missing times and unsupported timezone/DST ambiguity need clarification.
- Anonymous sessions are not production identity. Default retention is 24 hours; expiry is not forensic erasure.
- Four model requests/eight executed tools per run; failures count. Local Codex has a 90-second timeout per request; hosted Groq has a 20-second timeout, a 6,000-byte complete JSON request cap and 1,024 completion-token cap. No automatic model retry or paid fallback.
- Local Codex consumes existing eligible subscription allowance and stays local. Groq Free quality, account access and remote Turso behavior remain unverified.
- Hosted mode persists UTC daily caps remotely (100 model / 500 Qloo physical requests by default) and uses one Render Free instance. Actual Free-account quotas may throttle sooner; remote service behavior and judging availability remain unverified.
- Source, MIT license and local instructions are included in this repository; the [video](https://youtu.be/CZ6P5YcP2Cg) is public. The local Alexa+ simulation route permits source/video without hosting. Final receipt and entrant confirmations are pending; no AWS or additional open-source mini-challenge entry is claimed. See [deployment notes](deployment.md).
