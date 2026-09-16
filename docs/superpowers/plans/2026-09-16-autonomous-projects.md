# Interview-led Autonomous Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved interview-to-result workflow in the existing Windows Hermes Desktop plugin, with real saved state, one contract approval, autonomous continuation and evidence-based results.

**Architecture:** Mission documents share Altron's SQLite database and transaction guards. A backend controller advances explicitly pinned Hermes sessions; the UI only starts the first binding, records user intent, and displays state. Existing manual workflows retain their semantics.

**Tech Stack:** Python 3.11+, SQLite, existing FastAPI/Pydantic, React/official Hermes SDK, pytest, node:test, existing Playwright/Electron harness. No new production dependency or service.

**Spec:** `docs/superpowers/specs/2026-09-16-autonomous-projects.md`

## Global Constraints

- Use only this worktree and isolated QA homes; do not edit installed Hermes or the default profile.
- English repository documentation; Russian translation only for README.
- No unapproved publication, spending, new credentials, or separate reviewing model.
- Preserve unknown-execution safety, maintenance blocking, exact model/provider identifiers, and manual user-acceptance semantics.
- New database schema 2; transactional migration from 1; rollback restores its matching database snapshot.
- Default approved work limits: 12 work turns and 168 elapsed hours, not a dollar limit.
- Write and observe failing behavior tests before each implementation. Re-run the full relevant regression suite after each component.
- Implement inline; the owner delegated ordinary technical decisions and already approved the product flow. Do not stop at this plan or ask them to manage individual steps.

## Source baseline and verified references

Baseline: published `8b3e525371fee0784cd9915c52989e2bc07491b4`, branch `feat/autonomous-projects`. Baseline portable checks: 109 Python passed, 1 skipped; 27 JavaScript passed. These exclude native loader/import/bundle tests, which run in final validation.

Read primary references: official Desktop SDK and observer-hook documentation; installed Hermes session contracts, session creation, RPC dispatcher and profile-runtime scoping; Altron Store, runtime adapter, action/coordinator code and maintenance guards. Context7 consulted for Python SQLite transaction semantics, FastAPI lifecycle and React form/subscription state. Reuse the independently tested local connection-catalog commit after inspecting its diff; do not recreate or publish it separately as part of this step.

## Task 1: Persistent mission and immutable approval

**Files:** Create `altron/dashboard/missions.py`, `altron/tests/test_missions.py`; modify `altron/dashboard/plugin_api.py` only for schema setup/shared project insertion and mission integration.

**Interfaces:** `MissionStore(store).create(message, model, provider, profile)`, `.get(id)`, `.list()`, `.answer(id, revision, message)`, `.approve(id, revision, directory, max_turns, max_hours)`, `.context(runtime_id)`. Documents follow the spec; project creation and approval use the same SQLite transaction.

- [ ] Write/run the creation/reopen and isolation regression first:

```python
def test_interview_is_saved_without_inventing_a_project(tmp_path):
    store = Store(tmp_path / 'data')
    missions = MissionStore(store)
    mission = missions.create('Help me reduce repeated paperwork', 'chosen-model', 'chosen-provider', 'altron')
    assert store.projects() == []
    assert MissionStore(Store(tmp_path / 'data')).get(mission['id'])['transcript'][0]['text'] == 'Help me reduce repeated paperwork'
```

- [ ] Implement saved documents, schema-1 migration and a prepared interview turn. Validate unknown IDs, bounds, profile/model/provider strings and phase transitions at the boundary.
- [ ] Add failing tests for persisted replies, proposal corrections, stale approval, concurrent duplicate approval, and overlap/invalid-directory rollback. Seed proposals through the actual bound mission protocol, not by rewriting internal state.
- [ ] Implement the immutable approved snapshot and atomic real project insertion. For a duplicate approved version assert both approvals have the same `project_id` and only one project exists.
- [ ] Run `python -m pytest -c altron/pytest.ini altron/tests/test_missions.py altron/tests/test_store.py altron/tests/test_workspace.py` and commit this tested component locally.

## Task 2: Bound protocol and recorded verification

**Files:** Extend `missions.py`; modify `altron/__init__.py`; create `altron/tests/test_mission_protocol.py`.

**Interfaces:** `.bind(id, turn_id, runtime_id, stored_id)`, `.update(runtime_id, payload)`, `.terminal(runtime_id, status)`, `.record_check(runtime_id, tool_name, args, result)`, `.verify(id)`. Mission tools derive identity from `HERMES_UI_SESSION_ID` and cannot approve themselves.

- [ ] Write/run failing tests for foreign/unbound sessions, interview execution denial, and model output unable to change the approved contract.
- [ ] Implement interview/checkpoint/result/blocked actions while preserving existing manual actions and tool names.
- [ ] Write/run this no-false-success behavior:

```python
def test_model_completion_without_report_is_not_ready(bound_mission):
    missions, mission, turn = bound_mission
    missions.terminal(turn['runtime_id'], 'complete')
    assert missions.get(mission['id'])['status'] != 'ready'
```

- [ ] Test real file checks and authentic command receipts: nonzero exit, wrong cwd/command, background acknowledgement, changed artifacts and later modifying work must fail verification. Create real temporary deliverables and use actual tool-shaped receipts, clearly labelled as unit fixtures.
- [ ] Implement observer hooks and safe receipt metadata, then repeat old plugin/terminal-outcome tests. Save actual red/green test outputs and commit.

## Task 3: Backend-owned execution and safe recovery

**Files:** Create `altron/dashboard/autonomous_runtime.py`, `altron/tests/test_autonomous_runtime.py`; extend the narrow existing runtime integration only where shared.

**Interfaces:** `Controller(store, adapter)` drives `.tick()`/wake/stop; the production adapter creates and submits through installed Hermes RPC with the bound transport and explicit profile scope. Passively observe running state; use the existing native stop/lease fence only during settlement or recovery.

- [ ] Test claim serialization using two controller instances and a shared real SQLite file. Exactly one dispatch is admitted; a lost submission acknowledgement creates `unknown` and is not retried.
- [ ] Test a multi-checkpoint run through a recording adapter: user approval occurs once, follow-up work uses the frozen model/provider and saved checkpoint, and failed checks enqueue a bounded repair turn. Assert state/events and actual files, not only mock call counts.
- [ ] Implement the worker loop, terminal receipt plus runtime-settled barrier, bounded continuation, deadline/turn stops, error handling and cancellation.
- [ ] Test restart at prepared/running/terminal-but-settling/checkpoint boundaries, compression lineage, foreign home/cwd, no model fallback, and cancellation races. Recovery must never call `session.resume` or claim an active runtime stopped.
- [ ] Exercise real installed-Hermes imports and session creation in isolated integration tests with no paid inference; commit after regressions pass.

## Task 4: API and maintenance compatibility

**Files:** Create `altron/dashboard/mission_api.py`, `altron/tests/test_mission_api.py`; modify `plugin_api.py`, `maintenance.py` and corresponding maintenance tests.

**Interfaces:** The HTTP paths and payload fields are exactly those in the spec. The router receives `get_store` and the existing error translator, and does not import the parent router at module import time.

- [ ] Write failing TestClient tests for create/read/answer/bind/approve/cancel/recover/revise, strict extra-field rejection and stale revisions. Assert reads do not launch models.
- [ ] Implement the router and controller wake-up only after a persisted user action/approved intent.
- [ ] Add maintenance refusal tests for every potentially active autonomous state, including unknown and cancellation requested; safe unapproved interviews remain backup-compatible.
- [ ] Update schema compatibility checks and test schema-1 upgrade, complete backup and matching rollback. Do not weaken existing run/team checks.
- [ ] Run the full portable Python suite and commit.

## Task 5: Primary interview-to-result UI

**Files:** Create `altron/ui/mission-view.mjs`, `altron/tests/mission-view.test.mjs`; modify `ui/view.mjs`, `ui/workspace-tools.mjs` only as needed, and the explicit `package.json` JS test list.

**Interfaces:** Consume mission API records directly. Reuse profile-scoped connection/folder controls. Keep cache keys scoped to connection/profile/mission. Model text is rendered as text, not executable HTML. The initial session-binding action checks source identity before every call; all later dispatch is backend-owned.

- [ ] Write/run static-render tests for new empty state, questions, proposal with exact checks/limits, running/blocked/unknown and verified result. No render may create a session or report a user's acceptance.
- [ ] Implement the stage-based primary UI, saved transcript, editable answer drafts, one versioned approval, cancellation/recovery/revision controls and actual artifact/instruction display.
- [ ] Add behavioral tests for duplicate clicks/source changes and interrupted binding. Integrate the existing tested connection-catalog fix after reviewing its exact diff.
- [ ] Preserve manual mode, improve error focus and wrapping, and replace confirmation sections with accessible SDK dialogs where touched. Persist drafts under scoped keys without credentials.
- [ ] Run all JS and portable Python regressions, rebuild the plugin and commit.

## Task 6: Native verification and local candidate

**Files:** Extend the existing native/upgrade harness and add an autonomous native test if separation makes the scenarios clearer. Update packaging manifests/version references, README/README.ru and English usage/verification/release documents. Save machine-readable evidence in `dist` and documented release evidence only after results exist.

- [ ] Extend real isolated Desktop tests for saved interview across navigation/restart, proposal/approval/result states, focus/Escape, visible errors, long text at a small window and no default-profile writes.
- [ ] Exercise the complete adapter/protocol using explicit deterministic local test infrastructure if needed. Label it as scripted integration evidence, never a real-model or endurance result.
- [ ] Run portable tests, real plugin/native loader/import/bundle tests, JavaScript tests, native UI tests, upgrade/rollback and packaging/security checks. Resolve failures rather than reducing acceptance criteria.
- [ ] Produce a local `0.5.0-beta.1` candidate and matching maintenance package, checksums, clear import/update/recovery instructions and truthful verification evidence. Do not overwrite published 0.4 assets.
- [ ] Self-review every diff, check for personal paths/credentials/unrelated changes and give the owner the working artifacts. Explicitly separate paid live-model, week-long endurance and clean-PC checks if not performed. No GitHub publication without separate approval.
