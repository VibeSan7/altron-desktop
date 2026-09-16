# Interview-led autonomous projects

## Authorization and objective

The owner approved **detailed interview → one final confirmation → autonomous work → a usable, verified deliverable**, and delegated ordinary implementation decisions to the lead. The interview must discover the project rather than require the user to arrive with a specification. The lead implements and checks this change without a separate reviewing model. Approval does not authorize publication, new spending, credentials, changes to the owner's working profile, or a new always-on service.

This is an additive mode of Altron in official Hermes Desktop on Windows 11. Existing manual projects and team runs remain usable. Repository documentation is English; only README has a separate Russian translation. UI copy remains Russian.

## Product experience

1. The first screen asks what the person wants to accomplish. It explains the interview, work, and result stages; maintenance moves into a secondary section. Example prompts help describe a need but do not silently create projects.
2. The user selects their existing Hermes connection and starts an interview. An Altron interview is saved before model work begins. No project name, personal path, credentials, or acceptance criteria are prefilled as user decisions.
3. The selected model asks adaptive follow-up questions and records the answers. It must discover audience, current problem, desired outcome, constraints, deliverables, and observable acceptance criteria. Unresolved material questions prevent a proposal. The user can correct a proposal before launch; this invalidates the old proposal version.
4. A final summary shows the proposed name, goal, requirements, exclusions, deliverables, checks, exact model/provider, chosen project folder, and execution limits. The folder must be explicitly chosen and pass the existing project-boundary checks. One **Approve and start** action atomically freezes this version, creates its project, and records the execution intent. Retrying the same already-approved version returns that same approval, not a second project or execution.
5. Ordinary implementation decisions, progress checkpoints, and corrections do not ask for another approval. Work uses the selected connection only. A separate model/reviewer is not launched. Missing permissions, unavailable dependencies or credentials, exhausted limits, an ambiguous execution outcome, and unsupported runtime capabilities stop visibly instead of being hidden.
6. The result view presents deliverables, usage instructions, recorded checks, remaining limitations, and access to the Hermes execution history. `ready` means the agreed automatic checks passed for the recorded files. It is not the existing manual `done` state or a fabricated user acceptance. Users may request a revision or stop work.

## Execution lifetime and alternatives

The existing renderer-owned coordinator cannot be the durable owner of this new workflow. A separate daemon/cron installation would add infrastructure and a second lifecycle; it is excluded. Use a backend-owned coordinator in the existing Altron plugin, with SQLite as the source of truth and Hermes as the actual agent executor.

Work may continue across many model turns while the owning Hermes backend is running. Closing the Altron pane is not cancellation. A full Hermes exit, computer shutdown/sleep, or loss of runtime ownership is not claimed to leave an executor running. After restart, saved interview and project state remain visible. An unconfirmed turn becomes `unknown`; reopening never blindly resubmits its prompt. Recovery checks actual runtime/lease ownership and requires explicit confirmation before a new turn after an ambiguous interruption. A known completed checkpoint may be continued within the already approved contract after the runtime connection is re-established.

Hermes `session.resume` is not used for observation or recovery: it may perform crash auto-continuation. The new controller never competes with that continuation mechanism. Fresh work turns use fresh, explicitly pinned Hermes sessions and the saved contract/checkpoint. Prompt caching within each session is unchanged.

## Data ownership and compatibility

Use the existing profile-scoped `altron.db`; no second state database, personal-data import, or synchronization service. Add mission documents and unique session bindings. Raise the database schema version to 2 because old maintenance tools cannot safely account for autonomous work. The current Store and maintenance code must read schemas 1 and 2, migrate schema 1 transactionally, and preserve all old projects/tasks/runs. Older code must fail closed on schema 2, not treat it as idle. Maintenance keeps its existing no-data-rewind contract: code rollback never silently restores an old database over newer user work. Rollback across an incompatible database version must stop before changing code and preserve both the current database and backup. A matching updated maintenance package is required for this release.

A mission document contains:

- `id`, `revision`, creation/update timestamps, `phase`, and `status`;
- exact `connection: {model, provider, profile}` (no credentials or endpoint metadata);
- saved transcript and a proposal, if one exists;
- an immutable `approval` containing the proposal revision, contract, project directory and limits;
- an optional real `project_id`, a current turn and prior turn receipts;
- checkpoint text, actual artifacts, check receipts/results, usage instructions, and a safe blocker code/message.

The proposal contract contains `name`, `goal`, `requirements`, `out_of_scope`, `deliverables`, `checks`, and `plan`. Lists are bounded and strings are validated at the model/API boundary. A deliverable is a project-relative file path with a purpose. A check is either a bounded file-content check or an exact terminal command with an explanatory label. Every proposal has at least one deliverable and check. A file-presence check is displayed as such, never described as a functional test. The UI exposes the concrete checks before approval.

Phases are `interview`, `work`, and `verification`. States distinguish queued/prepared work, running, waiting for an answer, awaiting approval, ready, blocked, unknown, cancellation requested, and confirmed cancellation. A protocol report is not a terminal receipt. No new work can start while an earlier turn might still be executing.

Default execution limits are 12 work turns and 168 elapsed hours from approval, editable at final confirmation within validated bounds. These are turn/time limits, not a currency cap. Existing Hermes approval policies remain enabled. A user-requested recovery/revision is explicit and recorded; increasing a spent limit is not automatic. Interview turns are initiated by user messages, not an endless automatic interview loop.

## Interfaces and file boundaries

- `dashboard/missions.py`: `MissionStore(store)` owns mission documents, transactionally frozen approvals, idempotency, protocol updates, session bindings, checkpoints, and file/check validation. It reuses Store connection/guard and artifact/path protections.
- `dashboard/autonomous_runtime.py`: `Controller` owns background advancement and the narrow installed-Hermes adapter. The adapter uses validated `session.create → bind → prompt.submit`, exact model/provider/profile/cwd checks, and the actual session transport. Its state never depends on the selected React project. No secrets are copied into Altron records.
- `dashboard/mission_api.py`: a router factory receives the existing Store dependency and error translation, avoiding a circular API import. The mission router is mounted on the existing Altron API.
- `__init__.py`: extend the two existing Altron tools and register small, profile-scoped observer hooks. Do not add a new core tool or modify Hermes source.
- `ui/mission-view.mjs`: interview/proposal/progress/result presentation with SDK controls and a small initial session-binding adapter. The renderer is not the execution scheduler.
- `ui/view.mjs`: compose the primary workflow and retain manual mode and existing task/team controls. Fix drafts, error focus, long-text wrapping, and accessible confirmations where the flow uses them.

HTTP surface:

- `GET /missions`, `POST /missions` with `{message, model, provider, profile}`;
- `GET /missions/{id}`;
- `POST /missions/{id}/answer` with `{revision, message}`;
- `POST /missions/{id}/bind` with `{turn_id, runtime_id, stored_id}`;
- `POST /missions/{id}/approve` with `{revision, directory, max_turns, max_hours, confirm:true}`;
- `POST /missions/{id}/cancel` with `{confirm:true}`;
- `POST /missions/{id}/recover` with `{confirm:true}`;
- `POST /missions/{id}/revise` with `{feedback, confirm:true}`.

A creation/answer response includes the prepared turn and its directory so the UI can establish the first live session on its authenticated connection. Binding validates the real runtime record before attaching the backend controller; the controller owns submission and all subsequent work turns. The UI never retries a prompt after an uncertain response. Duplicate binds cannot dispatch twice. HTTP reads never spend model tokens.

The agent obtains assignment only from the actual session binding, never from a project/mission ID provided by model output. `altron_update` gains mission-only interview, checkpoint, result and blocked payloads. Interview reports contain follow-up text or a complete proposed contract. Result reports contain real file paths and usage instructions. Only UI confirmation can freeze a proposal or increase authority; model tools cannot do so.

## Runtime and safety invariants

- Serialize claims in SQLite before external dispatch; no automatic retry of an uncertain create/bind/submit transition. Concurrent windows/controllers have one winner.
- Save a terminal receipt through Hermes' observer hook, then separately confirm that the runtime has settled. Do not treat `message.complete`, `on_session_end`, a disconnected socket, or a model's `result` report alone as proof that execution stopped.
- Reuse the native idle-session/lease fence before advancing. Do not call the existing destructive `observe_run` helper as a passive status poll. Track compression lineage only while the same owned runtime record and profile/cwd remain verified.
- Match exact connection identifiers and refuse a mismatched model/provider/profile, unknown runtime, unsupported adapter, or configured automatic model fallback. Never silently substitute a model.
- During interview, block project-execution tools through the plugin's pre-tool hook; only the assigned interview protocol is allowed. During work, keep native approvals enabled. Do not pretend the plugin is an OS sandbox: configured Hermes tools retain their normal host access. Money, publication, new access and destructive external actions are outside the contract and require separate permission.
- Record approved command checks from authentic synchronous `terminal` tool receipts with the exact command and project working directory. The controller does not run agent-written shell commands around Hermes' approval system. Nonzero, interrupted, background-only, mismatched, or absent receipts do not pass. Subsequent potentially modifying work invalidates earlier command receipts. Final artifact snapshots must still match.
- Verify deliverable paths, file contents where specified, sizes and SHA-256 locally. Never attach `.env` or other already-forbidden sensitive artifacts. A hash proves identity, not usefulness.
- Cancellation first stops new dispatch, then requests interruption of the owned runtime. It becomes cancelled only after actual stop verification. Unknown work remains maintenance-blocking.
- Maintenance rejects queued/running/checking/unknown/cancellation-requested autonomous work. Waiting-for-input and unapproved proposals can be backed up safely because they cannot dispatch by themselves.
- All tests and Desktop exercises use isolated homes/app data. No real credentials, owner sessions, default-profile edits, or paid inference are used without separate authorization.

## Acceptance and evidence

The implementation must exercise: adaptive model-protocol interview; saved replies and draft corrections; stale and duplicate approval; atomic project creation; selected-model pinning; one-winner dispatch; multiple checkpoints without more approvals; authentic failed checks followed by repair; real ready artifacts and instructions; no false success from a plain model completion; budget/time stops; terminal/settling distinction; cancellation and unknown-state recovery; active-operation maintenance refusal; schema-1 upgrade and rollback; manual-mode regressions; native UI focus/drafts/wrapping; and package import in an isolated real Desktop.

Unit and integration tests may use explicit test doubles. A deterministic local provider, if used, is test infrastructure, not evidence of a real model's reasoning quality. Results must distinguish source/unit/native/runtime-fixture checks from paid live-model work, week-long endurance, and clean-PC installation. Do not advertise unperformed checks as passed.
