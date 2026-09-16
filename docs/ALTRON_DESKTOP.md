# Altron Desktop 0.5 — interview, work and result

This guide applies to public beta **0.5.0-beta.2**. Use its release archives and checksums, not the published 0.4 archive. The new default workflow is documented in [Autonomous projects](AUTONOMOUS_PROJECTS.md). See the [verification report](DESKTOP_VERIFICATION.md) for tested scope and limitations.

The current Altron interface is in Russian. This guide describes its actions in English.

## Installation

1. Install the official [Hermes Desktop](https://hermes-agent.nousresearch.com/docs/user-guide/desktop). Altron does not replace Hermes or include shared paid AI access.
2. Import `altron-0.5.0-beta.2.tar.gz` with the profile-import button. Do not extract the archive or use GitHub's Source code ZIP.
3. Fully close and reopen Desktop. Enable **Desktop: Altron** in the plugins section, select the **altron** profile, and click **Altron** in the bottom bar.
4. Connect your own account/model in Hermes's built-in settings. Do not enter passwords, verification codes, or keys in Altron.

Import refuses to overwrite an existing profile. If Altron is already installed, use the [upgrade procedure](UPDATING.md) rather than deleting the profile. The working `default` profile is not reconfigured. The package contains no `.env`, `auth.json`, conversations, author projects, or databases. The first screen and first project start empty.

## Start with an idea

The default screen opens a saved interview. Select a configured connection, describe your need, answer the questions, review the proposal, choose a dedicated folder and confirm it once. The backend continues, validates files and command receipts, and repairs failures within your limits. Keep Desktop running. [Read the complete autonomous workflow](AUTONOMOUS_PROJECTS.md).

## Manual workflow

Select the secondary manual-mode button to use the explicit project/task/team controls below. Autonomous projects cannot be edited through the manual project form.

### Your first manual result

1. Enter a project name, such as “Learning page.”
2. Open the folder picker. Navigate to a suitable directory and choose an existing folder, or enter a new folder name and use the create-and-select action. Then create the project. The full-path field remains available for advanced users. Do not select an entire drive or Hermes's settings directory.
3. Select a configured connection and a model from the catalog. The action for using the current Hermes connection copies only the explicitly displayed setting. It does not change other conversations' models. If login is needed, complete it in Hermes's own **Settings → Model**. Checking settings does not query the model or guarantee that the provider will accept a future request.
4. Fill the learning example. This populates the form with a task to create a standalone `index.html` containing a heading, three services, and a contact button, plus `CHECKS.md` documenting the checks. **Nothing is started or created yet.** You can rewrite the goal and criteria in your own words.
5. Create the task. Write a clear plan, for example: “Create the page in this folder; open it in a browser; check the button and console; record the checks in CHECKS.md; submit both files to Altron.” Alternatively, separately confirm a request for Altron to draft the plan.
6. Approve the plan, then start the executor. The confirmation checks the project, folder, model, and connection. Only the final launch confirmation sends the task. Your provider may charge for it; Altron does not substitute a different model after a failure.
7. Wait until the task needs acceptance and Hermes confirms completion. Open the result folder, open `index.html` in a browser, and open `CHECKS.md` in a text editor. Check the heading, three services, contact button, and browser-console errors. Opening a file on a remote Hermes machine requires access to that machine: the File Explorer action applies to the local computer.
8. If the result meets the criteria, describe what you checked, confirm that you opened the files and verified the criteria, and accept the result. Otherwise, return it for revision.

This is a reproducible user scenario, not a prewritten result. Its quality depends on the selected model and actual checks. The [report](DESKTOP_VERIFICATION.md) states this build's verification scope; automation is not presented as an independent beginner's trial.

## Revising the same task

After confirmed completion, return the task for revision, describe a specific problem, and confirm. For example: “The button does not show contact details. Fix it and verify by clicking it.”

- The task ID, original goal, and acceptance criteria are preserved.
- Previous plans, reports, feedback, file lists, and checksums remain in the attempt history; earlier executor conversations also remain available.
- The new attempt receives a number and a status indicating that it needs a plan. Approve the revised plan and confirm its launch separately.
- Requesting revision does not itself call a model or change files.
- Attempt history is not a backup of file contents: the next approved task may change files in the project directory. Use your own backups or Git for important file versions.

A late response from an earlier executor cannot overwrite a new attempt. Revision and acceptance remain blocked until execution is confirmed to have finished.

## Cancellation, stopping, and recovery

**Canceling a task** applies to a plan that has not started or work that has already stopped. Enter a reason and confirm. The plan and history remain; a canceled team no longer blocks maintenance on its own. If the executor is still active, stop it first.

**Requesting a stop** sends a request to Hermes. It does not promise an immediate stop. Execution is considered finished only after confirmation.

**Checking and recovering state** helps after closing the window, restarting, or losing a terminal event. Altron:

- checks the actual Hermes session, profile, and folder;
- does not stop an active executor or treat a lost connection as proof that execution stopped;
- closes an old idle session and checks whether another process owns it;
- records an interrupted state without submitting another task or advancing the team to its next step.

If the registry is unavailable or the Hermes version is unsupported, the block remains. Do not delete database records or bypass `active_operations`. Use the diagnostic report when uncertainty remains. If work is still active, request a stop; after confirmation, choose revision or cancellation.

Main status meanings:

- **Failed:** the launch failed or no result was submitted.
- **Unconfirmed:** whether execution is still active cannot yet be established reliably.
- **Stop requested:** the request was sent, but confirmation has not arrived.
- **Execution stopped:** stopping was confirmed or an explicit safe reconciliation was completed. Read the explanation attached to the run.
- **Canceled by the user:** the task was explicitly canceled, not successfully completed.

## Teams and limits

Team configuration saves role settings within the project. For a simple start, you can explicitly assign the selected connection to all main roles except the reviewer. This action never assigns a separate reviewer.

A specialist sequence defines steps, roles, outputs, and acceptance criteria. For example, a technical executor creates a page, then a documentation specialist writes instructions for opening it. Each next step receives the previous step's verified files only after completion. Pausing prevents advancement to the next step. Resuming requires confirmation; after a failure, reconcile the state first.

The new-run limit explicitly permits a specified number of further calls: plan generation, each team step, and a separate review each count as one. Zero blocks new runs; an empty field removes the limit. This is **not a spending cap** and does not stop an already running executor. A failed attempt to prepare a run also consumes a permitted attempt.

The UI displays the selected specialist, state, duration, and available usage data. An unavailable price is **unknown**, not zero; an estimated price is labeled as Hermes's estimate, not the provider's bill.

## Overview and archive

The project overview shows open tasks, tasks awaiting acceptance, errors, and the latest decision. Task search matches goals and acceptance criteria. A completed, canceled, or stopped task can be archived and later restored from the archive view. Data and files are not deleted. Archiving does not hide unconfirmed execution from safety checks.

## Diagnostics and maintenance

In the help and safe-diagnostics section, generate a diagnostic report, review it, and copy it if needed. It contains only versions, the OS, and counts of projects and states; it excludes user paths, task text, conversations, and secrets. Nothing is sent to GitHub automatically.

Do not attach `.env`, `auth.json`, the database, an entire profile, or raw logs. Check screenshots for personal data before publishing them. [Bug report form](https://github.com/VibeSan7/altron-desktop/issues/new?template=bug_report.yml).

Updates and code rollback are covered [separately](UPDATING.md). Preserve the profile; do not remove maintenance locks manually. To stop using Altron, finish its tasks, disable **Desktop: Altron**, and switch back to your previous profile. Deletion is unnecessary.
