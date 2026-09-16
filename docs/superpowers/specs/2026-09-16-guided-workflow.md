# Altron: a first useful result without dead ends

## Agreed outcome

The user approved addressing the gaps identified in the audit: cancellation/recovery, revisions within the same task, understandable onboarding and connection selection, transparent acceptance, task overview/search/archive, usage visibility, and safe diagnostics. The owner's working profile is not changed. This phase implements and verifies the product locally; it does not launch a separate reviewer model or present automated runs as an independent beginner's trial.

## Behavior and boundaries

- An approved plan that has not started can be explicitly canceled; history remains. Updating is permitted after cancellation, but unfinished actual runs still block it.
- Revision and a new attempt preserve the task ID and retain previous criteria, files, conclusions, plan, and runs in attempt history. A new attempt always starts as draft and requires renewed approval. A late event from an old attempt cannot change the new one.
- Recovery first reads Hermes's actual state; it does not send a prompt or call session.resume, which can automatically resume work. A lost connection does not prove that execution has stopped. Unverifiable state remains blocked with a clear reason.
- Archiving is reversible and limited to settled tasks; it neither deletes files nor hides active work from maintenance.
- Beginners select connections from Hermes's standard catalog. Secrets are not read into the Altron UI or copied; advanced manual entry remains available for explicitly specified connections. Folders are selected through an allowed platform capability or safe server-side directory browsing, without modifying Hermes core.
- The starter example only fills a form: it does not automatically create a project or a paid run. Checking connection settings without calling a model is not described as verifying a successful AI response.
- The result view shows criteria, the report, actual files, and evidence. Programmatic integrity checks are not presented as semantic correctness; only the user can accept a result or request revision.
- The overview shows counts based on actual tasks, the next required action, current steps, and duration. Cost is shown only from actual Hermes data with availability indicated; unknown cost is not zero. Run limits must be described honestly, without promising a hard spending cap when provider information is unavailable.
- Diagnostics contain only allowlisted versions, state counts, and error codes, without user paths, task goals, conversations, keys, or raw logs. Only the user can publish a report manually.
- Data is extended through backward-compatible format-1 fields. Old records without the new fields remain readable. Restoring older code does not replace the current database. New executable files must be included in the manifest.

## Lifecycle contracts

`Store.cancel_task(project_id, task_id, reason)`; HTTP POST `/projects/{p}/tasks/{t}/cancel` `{reason, confirm:true}`.

`Store.revise_task(project_id, task_id, feedback)`; POST `/projects/{p}/tasks/{t}/revise` `{feedback, confirm:true}`.

`Store.archive_task(project_id, task_id, archived)`; POST `/projects/{p}/tasks/{t}/archive` `{archived:bool}`.

Task fields: `attempt` (default 1), `attempts` (snapshots of previous attempts), `feedback`, and `archived`. Run field: `attempt` (1 for old records). A snapshot contains the attempt number, goal/criteria/plan, status, summary, artifacts, specialist_review, acceptance_review, team, feedback, and time. Current files are not physically deleted. `cancelled` is a separate task/team status, not a false indication of success.

Recovery and collection of Hermes state are implemented by a separate adapter; HTTP does not accept a client-invented observation that execution has stopped.

## Verification

1. Tests first reproduce every class of behavior being fixed; ordinary checks do not call a model.
2. Real temporary profiles/SQLite: canceling ready work permits maintenance; active/unknown work does not. Attempt history survives reopening the database, and a late old run cannot overwrite a new attempt.
3. UI and RPC: connection selection, no automatic example execution, profile changes during an operation, archive/search, revision, and renewed approval.
4. An isolated real Desktop: first start, cancellation, revision, persistence after restart, upgrade/rollback. Do not control the user's working window.
5. Full Python/JS suites, package builds, archive checks, and secret scans. Unverified new-account login and independent beginner testing are disclosed, not obscured.
