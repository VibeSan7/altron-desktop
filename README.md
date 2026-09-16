# Altron Desktop

English | [Russian](README.ru.md)

Only this README has a separate Russian translation in `README.ru.md`. All other documentation, issue templates, and release notes are in English only.

**Projects, tasks, and verifiable results inside the official Hermes Desktop.**

Beta **0.4.0-beta.1** takes a goal through to a result, with cancellation, recovery, and revisions within the same task. This is a preview, not a promise of error-free AI. **A new task executed by a real model has not been tested for 0.4**; the successful live test of the earlier 0.3 is not presented as new evidence. See the [verification report](docs/DESKTOP_VERIFICATION.md) for the exact scope.

## Download and open — no commands required

1. Install the [official Hermes Desktop](https://hermes-agent.nousresearch.com/docs/user-guide/desktop).
2. Download **`altron-0.4.0-beta.1.tar.gz`** from [release 0.4.0-beta.1](https://github.com/VibeSan7/altron-desktop/releases/tag/v0.4.0-beta.1). Do not extract it. Do not choose GitHub's Source code ZIP.
3. In Desktop, use **Import profile** next to the add-profile button and select the archive. This creates a separate `altron` profile, does not replace `default`, and refuses to overwrite an existing profile.
4. Fully close and reopen Desktop. Enable **Desktop: Altron** in the plugins section, then select **`altron`** in the profile rail. The package configuration already enables the Python component for that profile.
5. Click **Altron** in Desktop's bottom bar to open its workspace tab. On subsequent starts, select the `altron` profile first as well: this package's backend is not enabled in `default`.
6. Connect your own model using Hermes's built-in settings. In Altron, select the configured connection and a model from the catalog, or use the action that copies the current Hermes connection. Do not enter keys or passwords in Altron fields.

The current Altron interface is in Russian. This documentation describes its actions in English.

Desktop must provide the `host.openWorkspace`, `ctx.rest`, and `host.onEvent` SDK capabilities. Tested build: **Hermes Desktop 0.21.3**, source commit `d84ece48b8552501660be229797e2d2aa4cee8db`; Python 3.11+. Recovery also requires Hermes's runtime registry and cross-process session-ownership checks. If these capabilities are unavailable, Altron keeps the operation blocked rather than assuming execution has stopped.

Details: [installation, usage, and rollback](https://github.com/VibeSan7/altron-desktop/blob/main/docs/ALTRON_DESKTOP.md).

## What you can do

- Create multiple projects with separate folders, tasks, and decisions.
- Ask Altron to propose a plan or write one yourself.
- Approve a plan **before** starting an executor.
- Choose technical work, research/business work, or documentation.
- Save each role's model, connection, and selected instructions.
- Approve a sequence of specialists: the next receives verified files from the previous step and starts only after confirmed completion.
- Pause a team without hidden retries or model substitutions.
- Cancel a plan that has not started and check the actual state after a failure.
- Request revisions within the same task ID, retaining feedback and attempt history and requiring new explicit approval.
- Choose or create a folder and fill a learning example without starting it automatically.
- Search tasks, move settled tasks into a reversible archive, and see the next required actions.
- Set the number of permitted new runs and view usage data only when Hermes provides it.
- Generate a diagnostic report without conversations, user paths, or secrets.
- Deliver results as real files, check their integrity with SHA-256, and accept the work manually.
- Request a separate review through a separately confirmed run.
- Open the executor's conversation in Hermes and request a stop.
- Return to projects after restarting without automatically resubmitting tasks.
- Verify an update package against its published checksum, create a backup, and restore previous code without replacing current projects or settings.

**Example:** a project called “Website,” a task to prepare a contact page, and acceptance criteria requiring the page to open and display a phone number and address. First approve the plan, then start the executor. Its file and report are submitted for review; the model saying “done” does not complete the task by itself.

## Safety and honest status reporting

Altron keeps its own database at `altron/altron.db` inside the selected Hermes profile. The package contains no author projects, message history, tokens, passwords, or default models.

- Project folders cannot overlap; access to another project's task is rejected.
- The `altron_context` and `altron_update` tools are bound to the assigned session.
- Clicking twice does not start a second executor.
- Acknowledgment that a task was delivered is not treated as completion.
- A terminal Hermes error is stored as an error rather than leaving the task running forever.
- After acknowledgment is lost or Desktop restarts, unfinished execution is treated as unconfirmed. There is no automatic resubmission.
- Only the user can accept a result; a changed or unavailable file blocks acceptance.

**This is application-level data separation, not a separate virtual machine.** Ordinary Hermes tools retain their permissions. Dangerous actions remain subject to Hermes's built-in restrictions and confirmations; Altron does not disable them.

## What has been tested — and what is not claimed

The [verification report](https://github.com/VibeSan7/altron-desktop/blob/main/docs/DESKTOP_VERIFICATION.md) distinguishes:
- tests of data, the HTTP API, tool context, and execution control;
- real Desktop runs with synthetic projects, restarts, and rejection of an invalid connection;
- archive construction, contents, and native import without overwriting profiles;
- automated GitHub checks.

The previously published 0.3 also passed a real task using `openai-codex / gpt-6-astra`: the model created a file and submitted it to Altron, and programmatic checks verified its contents and SHA-256 before acceptance. See the [report](https://github.com/VibeSan7/altron-desktop/blob/main/docs/DESKTOP_VERIFICATION.md) for details and exact limits. This tested the owner's existing connection, not a new account's first login or every provider. Users connect their own accounts and manage availability in Hermes. Teams follow an approved plan rather than running unattended in the background. The beta does not include its own Telegram bridge, automatic migration from the old Registry, a standalone Hermes installer, or distributed infrastructure. Selected agency-agents instructions are adapted to Altron's rules; source and license details are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). A specialist instruction is not a separate tool and does not guarantee response quality.

Built-in maintenance is available from 0.3 onward. To upgrade from 0.2, or cancel an unstarted plan that blocks an upgrade from 0.3, use the separate `altron-maintenance-0.4.0-beta.1.tar.gz` archive and the [step-by-step upgrade and rollback guide](https://github.com/VibeSan7/altron-desktop/blob/main/docs/UPDATING.md). Do not import the main archive over an existing profile. Installing Hermes on a clean computer and signing into a new account remain outside the verified scenario.

## Development

Node.js 22 and Python 3.11+. Ordinary tests do not require a working Hermes profile.

```sh
npm ci
```

```sh
npm test
```

```sh
npm run build
```

```sh
python -m pip install -r altron/requirements-test.txt
```

```sh
python -m pytest -c altron/pytest.ini altron/tests --ignore=altron/tests/test_plugin.py --ignore=altron/tests/test_native_loader.py --ignore=altron/tests/test_profile_import.py --ignore=altron/tests/test_bundle.py
```

The profile is built by the standard Python step in the [workflow](.github/workflows/altron-desktop.yml); its contents are defined by [manifest.json](packaging/manifest.json). Run `test_bundle.py` after building the archive.

Integration checks require an installed Hermes. `npm run test:native` also uses `ALTRON_JS_HOME` (the `apps/desktop` directory) and `ALTRON_PYTHON` (its Python interpreter). The test creates its own settings and does not inherit an environment containing keys. The separate [real-model test](docs/LIVE_TESTING.md) requires the explicit `ALTRON_LIVE=1 npm run test:live` opt-in; without it, the test is skipped.

## Repository structure

- `altron/` — the Desktop module, API, tools, UI source, and tests.
- `packaging/` — a neutral profile and an explicit package file list.
- `docs/` — guides, verification boundaries, and the maintenance contract.
- `.github/workflows/` — automated tests and reproducible builds.

## Feedback

Report reproducible problems through [GitHub Issues](https://github.com/VibeSan7/altron-desktop/issues). Include Windows, Hermes, and Altron versions, reproduction steps, and expected versus actual behavior. A GitHub account is required to submit an issue, but not to download. **Do not attach** keys, `.env`, `auth.json`, an entire profile directory, private conversations, or raw logs. Check screenshots for personal data before publishing them.

[MIT](LICENSE). Hermes and its dependencies have their own terms and are not copied into the Altron archive.
