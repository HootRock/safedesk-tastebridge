# TasteBridge limitations

- Group score uses up to twenty returned candidates per member, equally combining average/minimum rank utility. It is not probability; missing rank is not dislike.
- Movie/artist seeds require explicit confirmation. No private profile ingestion, bookings, payments, automatic preference creation or invented entities.
- Explanations may be absent. Available rank evidence is shown without generated taste claims.
- Natural-language feedback supports shown-film exclusions; vague genre/tone requests need clarification.
- Cache is per process, 15 minutes/256 successful entries. Failed keys retain per-key locks until restart. Use one instance/process.
- Preferences/results expire after 24 hours. Reloaded favorites must be confirmed again; the existing group uses version checks.
- No captured Qloo response dataset ships in public source. Live metadata/posters retain third-party terms and may be unavailable.
- Local Codex uses eligible subscription allowance and stays local. Groq Free / `openai/gpt-oss-20b`, Render Free and Turso Free are the selected hosted target; accounts, live quality and remote behavior remain unverified. No paid fallback is authorized.
- Local Codex has a 90-second planner request timeout. Hosted Groq has 20 seconds, a 6,000-byte cap on the complete JSON request (including schemas/tool history), 1,024 completion tokens and no automatic model retry. Large requests can fail the context cap without truncating evidence.
- Hosted UTC daily caps persist remotely: default 100 model / 500 physical Qloo requests, including failed requests and retries. Actual Free-account quotas may throttle sooner; real remote durability/capacity and judging availability remain unverified.
- Source, MIT license and instructions are included in this repository; the [video](https://youtu.be/Qdl879gW4MU) is public. Hosting accounts are not yet set up/live tested. The required functional public demo and final receipt remain pending, so final Qloo submission cannot proceed. See [deployment notes](deployment.md).
