// SafeDesk's plain-language vocabulary for server codes. Codes stay visible for support.
type Described={title:string;detail:string;code?:string};
const errors:Record<string,[string,string]>={
 model_timeout:['The planner took too long','Your notes are unchanged. Try again, or shorten the document.'],
 model_unavailable:['The planner is not responding','Please try again shortly. Nothing was written.'],
 model_usage_limit:['The planner reached its usage limit','Wait a while before drafting again. Nothing was written.'],
 model_unconfigured:['The planner is unavailable','The operator needs to restore planning. Please try again later.'],
 codex_not_installed:['The planner is unavailable','The operator needs to restore planning. Please try again later.'],
 local_model_only:['Drafting is local only','This public host cannot run the planner.'],
 invalid_model_output:['The planner returned an unreadable draft','Nothing was written. Try creating the draft again.'],
 model_attempt_limit:['This draft hit its step limit','Your notes are kept. Simplify the request and try again.'],
 tool_call_limit:['This draft hit its tool limit','Your notes are kept. Simplify the request and try again.'],
 run_in_progress:['A draft is already in progress','Wait for it to finish, or use Check current run.'],
 version_conflict:['This draft changed elsewhere','Create a new draft to continue from the latest version.'],
 preview_changed:['The calendar preview changed','Review the new preview, then approve it again.'],
 run_cancelled:['This draft was cancelled','Nothing was written. Create a new draft when ready.'],
 internal_error:['Something went wrong on the server','Nothing was written. Try again in a moment.'],
 session_required:['Your session expired','Reload the page to start a new session.'],
 action_token_required:['This tab lost its secure session','Reload the page, then try again.'],
 wrong_origin:['Request blocked','Open SafeDesk from its own address and try again.'],
};
export function describeError(message:string):Described{
 if(message.startsWith('Still processing'))return {title:'Still drafting',detail:message};
 const known=errors[message];if(known)return {title:known[0],detail:known[1],code:message};
 if(/failed to fetch|networkerror|load failed|unexpected token|session unavailable/i.test(message))return {title:'Cannot reach the service',detail:'Check your connection and try again shortly. Nothing was written.',code:message};
 if(/^[a-z]+(_[a-z]+)+$/.test(message))return {title:'This step could not finish',detail:'Nothing was written to your calendar.',code:message};
 return {title:'This step could not finish',detail:message};
}
const operations:Record<string,string>={send_email:'Send an email',commit_calendar:'Write to the calendar',propose_tasks:'Propose tasks',preview_calendar:'Prepare a calendar preview',read_document:'Read the document'};
export function operationName(tool:string|null){if(!tool)return 'An operation';return operations[tool]||tool.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase())}
const reasons:Record<string,string>={
 unknown_tool:'SafeDesk has no permission for this.',human_approval_required:'Only you can approve calendar writes.',wrong_session:'It referred to another session.',wrong_document:'It referred to another document.',draft_required:'There was no verified draft yet.',
 ambiguous_timezone:'The time is ambiguous in this timezone.',timezone_mismatch:'The time zone differs from your setting.',missing_start_or_end:'A start or end time was missing.',invalid_time_range:'The end was not after the start.',
 time_not_in_source:'That time is not in the document.',date_needs_clarification:'The document does not give a date.',date_not_in_source:'That date is not in the document.',relative_date_mismatch:'A relative date did not match the reference date.',
};
export function deniedReason(code:unknown){const value=String(code||'');return reasons[value]||'The server could not verify it against your document.'}
const steps:Record<string,string>={model:'Planned the next step',risk_hint:'Instruction-like text flagged',read_document:'Read the document',propose_tasks:'Checked the proposed tasks',preview_calendar:'Prepared the calendar preview',recovery:'Returned to your request',clarification:'Asked for a detail',error:'Stopped before finishing'};
export function stepTitle(kind:string,tool:string|null){return steps[tool||kind]||steps[kind]||'Step recorded'}
