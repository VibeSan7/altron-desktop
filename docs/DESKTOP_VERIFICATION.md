# Altron Desktop 0.4.0-beta.1 verification

English | [Russian](DESKTOP_VERIFICATION.ru.md)

The archives for **public beta 0.4.0-beta.1** have been verified. Checksums and anonymized results: [public-release-0.4.0-beta.1.json](evidence/public-release-0.4.0-beta.1.json). Verification was completed on September 16, 2026.

The [initial local candidate](evidence/local-candidate-0.4.0-beta.1.json) is retained as a separate historical record: its checksums do not describe the release files. Only the README instructions and corresponding `release.json` checksums changed in the distributed packages; the code is byte-for-byte identical. The new archives themselves passed the Desktop scenarios below again.

## Environment and ordinary tests

- Windows 11, Node.js 22.23.2, Python 3.11.15, Playwright 1.62.1. Hermes Desktop 0.21.3, source commit `d84ece48b8552501660be229797e2d2aa4cee8db`.
- **114 Python tests passed, 1 skipped:** the process lacked Windows permission to create a symbolic link. The platform was not mocked; this is not a failure of checks against existing ordinary directories.
- **27 JavaScript tests passed:** model/connection selection, lost acknowledgment, source changes, no hidden retries, team sequencing, new UI controls, and the connection catalog.
- Tests covered attempt history after reopening SQLite, rejection of late updates to an earlier attempt, required completion before acceptance/revision/archiving, the run limit, and allowed diagnostic contents.
- A separate test reproduces a session binding changing during recovery: the changed binding is rejected, and a real run is not declared stopped based on a stale observation.
- Early-failure timing was fixed: duration no longer keeps growing after an error before session binding. An error after binding is not treated as proof that execution stopped.
- Ordinary tests do not submit the test task to an external model. Without `ALTRON_LIVE=1`, the AI test is skipped; this was also verified.

Packages were built by the step in the [workflow](../.github/workflows/altron-desktop.yml). [GitHub Actions 35061350136](https://github.com/VibeSan7/altron-desktop/actions/runs/35061350136) successfully checked commit `d1a192cf02da17781d32bb6083fd0f07783926e6`: **112 portable Python tests with no skips and 27 JavaScript tests**. GitHub archives matched those tested on Windows byte for byte. Publication also requires a successful run for the exact final main commit and matching archive checksums; that run is linked in the [release description](https://github.com/VibeSan7/altron-desktop/releases/tag/v0.4.0-beta.1).

## Real Desktop, without submitting a task to a model

In a separate temporary environment with a real Hermes instance, without mocked API responses:

- The archive was imported through the native dialog; a project directory was created through Altron's UI.
- The learning example filled the form but did not automatically create or run a task.
- Two synthetic projects, data separation, and persistence after restarting were verified.
- Plan cancellation, reversible archiving, search, revision of the same task, and renewed approval of a team plan were exercised.
- An invalid connection produced an error state without silently substituting another model. The first `gateway.ready` no longer remounts the panel during launch or leaves a task stuck preparing its run.
- A real idle Hermes session was created **without `prompt.submit`**. Explicit reconciliation closed it normally and stored exactly one interrupted run; no new task was sent to the model. The task was then archived.
- Installing the same package and rolling back through the UI were tested, with real restarts and preservation of the database/settings.
- The final UI-error list was empty. Installed release metadata and the Python API were checked against the current archive.

Complete successful run: `an-51ULcj`. Earlier failed runs are retained separately and are not used as readiness evidence.

## Upgrades from older versions and rollback

Both scenarios passed separately:

- **0.2 → 0.4 → rollback to 0.2**, result `upgrade-DDXkMb`.
- **0.3 → 0.4 → rollback to 0.3**, result `upgrade-1vaVOZ`. An approved, unstarted team plan was created through the old 0.3 UI. The new maintenance panel canceled it only after explicit confirmation and a reason; plan text and steps were preserved, and no runs were created.

Each scenario verified old tasks, a new decision saved after upgrading, their preservation after rollback, and byte-for-byte restoration of the previous code. Settings and synthetic control `.env`/`auth.json` files were preserved. Real credentials were not copied into these profiles. The `active_operations` check was not disabled: a plan with a created run cannot be canceled through the unstarted-plan operation.

Automation handles Hermes's normal setup-later dialog when restarting. It clicks the provided button rather than deleting the dialog or clicking through it. Initial onboarding is completed explicitly before that wait. No account is connected for the upgrade check.

## Contents and safety

The main and maintenance packages were built from explicit file lists. They contain no user databases, conversations, `.env`, `auth.json`, or author projects. Packages and source were scanned with Gitleaks 8.30.1. There were no source findings; package scans reported two matches on checksums in generated `release.json` files. **Every** checksum in those manifests was independently recalculated from the included files. These are not keys; scanner rules were not disabled.

## Evidence boundaries

- For **this 0.4 build**, no new task executed by a real model was tested. The successful live team belongs to the earlier 0.3: [its separate results](evidence/public-release-0.3.0-beta.1.json). An old success is not presented as new evidence.
- Installing Hermes on a clean computer, a new account's first login, and an independent beginner's walkthrough have not been tested.
- Support for every provider, model, and operating system, a distributed team, or unattended operation has not been confirmed.
- Programmatic checks of synthetic files and checksums do not replace human judgment about a result's usefulness.

This is a verified **beta**, not a promise of a stable production release. See [using the new version](ALTRON_DESKTOP.md), [upgrading and rolling back](UPDATING.md), and [developer test instructions](LIVE_TESTING.md).
