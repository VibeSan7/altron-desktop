# Guided Workflow Implementation Plan

> **For agentic workers:** use superpowers:executing-plans. Execute tested slices; do not stop at this plan.

**Goal:** Bring the agreed Altron user workflow to a verified local result.

**Architecture:** Keep the existing Store/API and Hermes SDK. Extend the lifecycle with attempts and explicit user actions; separate Hermes integration and onboarding support from task presentation. No new services, paid reviewer models, or Hermes core changes.

**Tech Stack:** Python 3.11+, FastAPI/Pydantic/SQLite, React 19 ESM, Hermes plugin SDK, Node test, pytest, Playwright/Electron.

**Spec:** `docs/superpowers/specs/2026-09-16-guided-workflow.md`.

## Actual completion of the local phase

Completed by the lead agent without launching a separate model. Results and exact packages: `docs/DESKTOP_VERIFICATION.md`, `docs/evidence/local-candidate-0.4.0-beta.1.json`. Full run: 114 Python tests passed, 1 skipped because of Windows permissions; 27 JS tests passed. Real Desktop and upgrades/rollbacks from 0.2 and 0.3 passed. There was no publication or new live model execution during this phase.

Implementation details:
- The connection catalog is read directly through the standard SDK; a separate `/setup` is unnecessary. Related small onboarding/overview controls are grouped in `workspace-tools.mjs`.
- The first `gateway.ready` message does not mean the server restarted; generation changes are detected through `replay_epoch`, without resetting an in-progress request on the first connection.
- Recovery rechecks the runtime/stored ID binding inside the transaction; an observation obtained before the binding changed is rejected.
- A separate explicit cancellation of a never-started team plan was added to the maintenance profile for the old 0.3. History is preserved; the update block for actual unconfirmed runs is not weakened.
- The Desktop upgrade test waits for readiness after restarting and handles a possible repeated setup dialog with the normal setup-later button. Initial onboarding is completed explicitly before that wait.

## Global Constraints

Data format 1; old records remain readable. Existing prohibitions on automatic retries, model substitution, executor self-acceptance, and writes outside the selected project remain. Publication is outside this local phase.

## Task 1 — Lifecycle

**Files:** `altron/dashboard/plugin_api.py`, `altron/tests/test_lifecycle.py`, and targeted API tests as needed. Do not change the UI, manifest, or version.

**Interfaces:** cancel_task/revise_task/archive_task methods and HTTP bodies from the spec; attempt/attempts/feedback/archived.

- [x] Write tests: cancel ready with no runs -> cancelled; active -> reject. Revise after result+terminal -> same ID/draft/attempt=2/old files and snapshot. A late event from an old attempt cannot change a new one. Archive only settled tasks, reversibly.
- [x] Run `python -m pytest -c altron/pytest.ini altron/tests/test_lifecycle.py` and retain the actual RED result.
- [x] Implement methods through the existing `changing()` transaction and targeted HTTP routes; do not accept client terminal proof.
- [x] Run new and existing store/team/terminal/API tests and inspect the diff.

## Task 2 — Real Hermes integration (leader)

**Files:** `altron/dashboard/desktop_services.py`, `altron/tests/test_desktop_services.py`, targeted router integration after Task 1; `altron/ui/workspace-tools.mjs`, `altron/tests/workspace-tools.test.mjs`.

**Interfaces:** `/folders`, `/projects/{p}/tasks/{t}/recover`, `/diagnostics`; model catalog through the standard SDK's `config.get {key:'provider'}` and `model.options`.

- [x] Check official RPC contracts, safe verification of actual state, and available folder-selection capabilities.
- [x] Write RED tests: disconnection or active execution is not presented as a stop; server observations are bound to the project/profile; catalog responses exclude secrets; diagnostics use an allowlist only.
- [x] Implement the minimal adapter; exclude resume and prompt from recovery.
- [x] Verify tests with real imports and temporary profiles.

## Task 3 — Onboarding, results, and overview (leader)

**Files:** `altron/ui/view.mjs`, the related `workspace-tools.mjs`, `task-controls.mjs`, `actions.mjs`, `team-view.mjs`, and tests.

**Interfaces:** Task 1 routes; existing project/tasks/runs data; SDK useQuery/host.request/ctx.rest.

- [x] Add behavioral RED tests for the first screen, no automatic example execution, a new attempt, an empty catalog, and profile changes.
- [x] Implement folder/connection selection, a starter example without execution, cancellation/revision/archive/history and search, an overview, and clear acceptance.
- [x] Show duration and only confirmed usage data; apply explicit new-run limits without hidden model substitution.
- [x] Run all of `npm test` and `npm run build`.

## Task 4 — Packaging, guides, and real Desktop (leader)

**Files:** `packaging/*.json`, versions, `.github/ISSUE_TEMPLATE/bug_report.yml`, `docs/ALTRON_DESKTOP.md`, `docs/UPDATING.md`, `docs/DESKTOP_VERIFICATION.md`, README, and native/live/upgrade tests.

- [x] Include new modules in the main manifest; bootstrap receives only the maintenance files it actually needs.
- [x] Extend the native scenario with implemented UI actions, including canceling ready work before maintenance, archive/recovery, and revision. RED before the corresponding implementation is recorded by tests in the previous tasks.
- [x] Build packages and run the full Python/JS suites plus isolated Desktop/upgrade scenarios. Live testing stays within previously authorized boundaries, without a separate reviewer model.
- [x] Update guides and feedback forms; use a reproducible example, not a fabricated demonstration.
- [x] Inspect the diff and source/archive scans; confirm the absence of personal data and preservation of the original profile.
- [x] The report distinguishes implemented behavior, actual tests, and areas needing independent human acceptance. Do not publish anything as verified without an actual result.
