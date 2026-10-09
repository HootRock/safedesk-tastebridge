# SafeDesk — testing instructions

Independent Alexa+ web experience simulation with demo calendar storage; no Alexa account, email sending or real calendar integration.

[Public English video](https://youtu.be/CZ6P5YcP2Cg): 1080p, 150.67 seconds, TTS and AI assistance disclosure. Source, MIT license and local instructions are included in this [repository](https://github.com/HootRock/safedesk-tastebridge). Optional public app access is pending deployment and external verification.

## Start locally

Follow the [README](../../README.md). Local Codex requires your own eligible ChatGPT login and `gpt-6-luna` access. SafeDesk needs no Qloo key. Visit `http://127.0.0.1:8000/safedesk` on the service computer; expect **Live · local**. The planned hosted Groq route should show **Live · hosted** after actual deployment; it has not passed live verification.

## Document to approved calendar

1. Expand **Try a sample document**, choose **Normal**, use today's reference date and `Asia/Shanghai`. The meeting is tomorrow.
2. Click **Create task draft**. Wait for a real result; local Codex allows up to 90 seconds per request and a run permits four requests. The optional hosted Groq adapter allows 20 seconds per request, with a 6,000-byte complete JSON request cap and 1,024 completion-token cap.
3. Inspect **Tasks with a source**. The meeting must quote p1 and use its explicit 10:00–11:00 interval. The p2 README task has no deadline and should stay unscheduled or require clarification.
4. **View source p1** should highlight the original paragraph. Quotes must be exact substrings.
5. Edit a proposed title, then **Save draft changes**. Review the updated preview; approval should clear.
6. Approve the current preview and confirm. Expect **Calendar updated · confirmed by the server**. Completed drafts are immutable. Matching confirmation replay must not duplicate events.

## Outside instructions and recovery

Use a new **External send** or **Unapproved write** sample. Inspect **Permissions & execution record**. A risk hint does not establish a denied tool call: the model may ignore the text itself. Describe only recorded operations. Server permissions exclude sending and require a current session-bound approval receipt for calendar writes.

Offline checks need no provider login and test real validation with fixtures. They do not prove live quality. Provider errors show visitor-facing retry guidance and technical codes. Local operators can check their private setup and restart after configuration edits. There is no paid/fabricated-result fallback.

## Public gate

The [Amazon FAQ](https://amazonappdev2026.devpost.com/details/faqs) permits local source/video for this simulation, without public hosting. No AWS or additional open-source mini-challenge entry is claimed. If a real HTTPS deployment is added, repeat this flow externally, including a changed preview and idempotent confirmation. Approval/calendar storage must survive reconstruction. Hosted accounts, live remote integration and public workflow are pending. Remotely persisted daily caps default to 100 model / 500 Qloo physical requests per UTC day; actual Free quotas may throttle sooner and there is no paid fallback.
