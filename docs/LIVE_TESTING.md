# Testing with a real model

English | [Russian](LIVE_TESTING.ru.md)

This is an optional developer check, not an end-user installation guide. Ordinary `npm test`, `npm run test:native`, and Python tests do not submit the test task to an external model.

`npm run test:live` is skipped by default. It starts only with `ALTRON_LIVE=1` and explicitly provided model, provider, Hermes directory, and runtime settings. It uses the owner's existing connection and may consume their quota or paid tokens. Do not add it to ordinary CI or run it without the connection owner's permission.

## Boundaries

- A new named profile with the `altron-qa-` prefix and a random ID is created through the standard safe archive extraction into a new name. An existing `altron` is not overwritten.
- The model and provider are set only for the new QA profile using the standard `hermes config set` command.
- A separate test Desktop uses its own window settings and UI-plugin directory. It connects in the standard remote mode to a separately started `hermes serve --isolated` on `127.0.0.1`. The QA profile name is explicit, and the absence of prior sessions is checked before submitting a task. The user's current window is neither controlled nor closed.
- The test does not copy the user's keys, tokens, passwords, `.env`, or `auth.json`. It creates a separate random token in the new QA profile's `.env` for its temporary server; the value is not published. Hermes's normal access mechanism is used. The tested Hermes version allows a new profile without its own connection to read the shared provider connection.
- Child-process environment variables are restricted to a system allowlist. Private conversations and projects are not used as inputs.
- Changes to the main `config.yaml` are checked byte for byte; the main profile is not reconfigured.
- The test creates a synthetic `input.json` with a random marker. Only the model should create `result.json` and submit it through `altron_update`.
- Ordinary mode checks one run. With `ALTRON_LIVE_TEAM=1`, it checks two approved steps handing off `result.json` → `handoff.json`, the first file's exact checksum, and selected specialist instructions. Both modes verify the selected model and provider, a real Hermes terminal event, the state requiring user acceptance, JSON contents, and SHA-256.
- The test clicks acceptance only after independent programmatic checks of the synthetic file. This is not a separate reviewer model or acceptance of a real user task.
- After fully closing and restarting both the test Desktop **and the test server**, the accepted task and run count are checked for changes.
- There is no automatic resubmission. A failed run is stored separately. Another test invocation is a separate attempt requiring the previous outcome to be established first.

## Running the developer test

You need Hermes with a built Desktop, its Python interpreter, Node.js, and a built archive in `dist/` named `altron-` followed by its version and `.tar.gz`. `ALTRON_JS_HOME` points to `apps/desktop`, `ALTRON_PYTHON` to the installed Hermes Python, and `HERMES_HOME` to Hermes's main settings directory, not a nested profile.

In Git Bash, set **paths and exact connection identifiers, not secrets**. Substitute your own values:

```bash
export ALTRON_JS_HOME='C:/path/to/hermes-agent/apps/desktop'
```

```bash
export ALTRON_PYTHON='C:/path/to/hermes-agent/venv/Scripts/python.exe'
```

```bash
export HERMES_HOME='C:/path/to/hermes-home'
```

```bash
export ALTRON_LIVE_MODEL='your-exact-model-id'
```

```bash
export ALTRON_LIVE_PROVIDER='your-provider-id'
```

After explicit permission for this invocation:

```bash
ALTRON_LIVE=1 ALTRON_LIVE_TEAM=1 npm run test:live
```

A run is limited to 15 minutes, with 10 minutes allowed for the model's response. Connections are configured through Hermes, not secret-bearing environment variables in this test. The test does not log in or request a verification code.

## Testing upgrades without AI

`npm run test:upgrade` requires `ALTRON_JS_HOME`, `ALTRON_PYTHON`, and `ALTRON_OLD_ARCHIVE` — the absolute path to a downloaded archive of an earlier 0.2 or 0.3 release. Verify its SHA-256 against the published release before running. The current version's main and maintenance archives must be built in `dist/`. Run the test separately for each older release. If that version supports team plans, the test also creates an unstarted plan, cancels it through the new maintenance panel, and verifies preservation of the plan/steps without creating executions.

The test imports the old profile through the real Desktop, creates a project and task, imports the separate maintenance profile, updates code, restarts Desktop, saves a new decision, restores old code through the maintenance profile, and checks that both generations of data remain. Temporary `.env` and `auth.json` contain only synthetic control values; no AI connection is used. Actual API responses are not mocked; only file selection in the system dialog is automated. Evidence is stored in `.hermes/upgrade-…`.

## Results and retention

The output prints the path to `.hermes/live-…`. It retains the run boundaries, synthetic input/output files, task record, verification results, and a screenshot of the result on success. The QA profile and its history are retained for investigation; there is no automatic deletion. `.hermes/`, `dist/`, and `node_modules/` are excluded from Git. Only a separately reviewed, anonymized report is transferred to GitHub, not the entire run directory.

Success verifies the specific “approve → run → receive file → verify → accept” path. It does not verify installing Hermes on clean Windows 11, a new account's first login, every provider, or the full set of user-release requirements.
