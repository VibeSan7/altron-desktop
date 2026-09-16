# Altron maintenance contract

`altron.dashboard.maintenance` is a standalone module using only the Python standard library. It does not import `plugin_api.py`, configuration, or credentials.

## API

```python
Maintenance(profile_home, desktop_home)
stage(archive_bytes: bytes, expected_sha256: str) -> dict
apply(stage_id: str) -> dict
rollback() -> dict
status() -> dict
pending_plans() -> dict
cancel_pending_plan(project_id: str, task_id: str, reason: str) -> dict
```

`profile_home` and `desktop_home` must be absolute paths to existing directories. The profile must contain `plugins/altron` and `altron/altron.db`; Desktop must contain `desktop-plugins/altron`. `desktop_home` may be the same directory as `profile_home`.

`stage` first verifies the entire tar archive and its published lowercase SHA-256, then writes only inside `profile_home/altron/maintenance`. Its response contains `id`, `version`, and a sorted `files` list without the `altron/` prefix. Installed files are unchanged until staging succeeds. Checking another package preserves the previous operation and backup reference until another application creates the next backup; checking an archive alone does not remove rollback access.

`apply` accepts only the matching previously staged ID. Response:

```json
{"status":"applied","requires_restart":true,"version":"0.3.0","backup_id":"..."}
```

`rollback` returns `{"status":"rolled_back","requires_restart":true}`. It restores previous code, not an older copy of the current `altron.db`. It verifies that the current database format matches the backup database format before changing any code. A migration from 1 to 2 therefore blocks code-only rollback to the previous format-1 installation. Applying a package whose `data_version` is older than the current database is also rejected.

`status` returns `status`, `version`, `backup_id`, and `requires_restart`. Normal states are `idle`, `staged`, `applied`, and `rolled_back`. An unfinished, failed, or damaged operation returns `recovery_required`.

## Archive

The only root is `altron/`. The required `altron/release.json` has exactly this structure:

```json
{"format":1,"version":"0.3.0","data_version":1,"files":{"plugins/altron/__init__.py":"<64 lowercase hex>"}}
```

`files` lists every archived file except `release.json`, with hashes indexed by paths relative to `altron/`. Managed files must be under `plugins/altron/` or `desktop-plugins/altron/`. Allowed root documents — `config.yaml`, `SOUL.md`, `README.md`, `LICENSE`, and `THIRD_PARTY_NOTICES.md` — are verified and retained in the staged package but never replaced. Required files:

- `plugins/altron/__init__.py`;
- `plugins/altron/plugin.yaml`;
- `plugins/altron/dashboard/plugin_api.py`;
- `desktop-plugins/altron/plugin.js`.

Tar and gzip/tar are supported. Gzip decompression is bounded before tar parsing; oversized headers/metadata and an oversized decompressed stream are rejected. Limits: a 16 MiB archive, 128 files, 8 MiB per file, and 32 MiB total. Rejections include traversal, absolute/drive/backslash/NUL paths, duplicates and case-fold collisions, disallowed paths, symlink/hardlink/special/sparse entries, `.env*`, `auth.json`, `credentials.json`, `*.db`, `*.log`, and invalid manifests, versions, or hashes.

Both release data versions 1 and 2 are understood by the 0.5 maintenance component. The 0.5 main archive declares version 2. The new maintenance profile must be used when upgrading a format-1 installation; an older maintenance component rejects version-2 archives. Mission records also participate in `active_operations`: an unsettled turn, unknown execution, prepared turn or queued/running work prevents maintenance. Merely reading maintenance status does not migrate an existing database, and the Store checks its maintenance guard before schema initialization.

## Journal and backups

The journal is `altron/maintenance/journal.json`, with `schema: 1`:

```json
{
  "schema": 1,
  "events": [{"event":"staged", "stage_id":"...", "files":{"path":{"sha256":"...","size":1}}}],
  "stage": {"id":"...", "version":"...", "data_version":1, "files":{}, "archive_sha256":"...", "stage_dir":"stages/..."},
  "operation": {"kind":"apply", "state":"applied", "stage_id":"...", "backup_id":"...", "files":[], "applied":[]},
  "version": "...",
  "backup_id": "...",
  "requires_restart": true
}
```

`events` records the action order and actual old/new SHA-256 values. `backups/<backup_id>/backup.json` records the affected files; old bytes are stored in `code/`, staged new bytes in `new/`, and a verified SQLite copy of `altron.db` is retained. Unknown local files are not deleted.

Applying an update holds an atomic profile lock and a shared Desktop lock. Locks belonging to another process, or left after a crash, are not removed automatically. Validation first checks `user_version` 1 or 2, the `altron_projects` structure, and JSON documents. It rejects `prepared`, `running`, `unknown`, `cancel_requested`, `reported`, any session-bound run without a terminal status (including `failed`/`interrupted`), and team states `ready`, `running`, `paused`, or `unknown`. The SQLite write lock is held until replacement/rollback finishes, preventing a new run from slipping between validation and code changes. A SQLite backup is then made using `Connection.backup`, `PRAGMA integrity_check` is run, and code is changed only through `os.replace`.

If compensating recovery fails, the journal enters `recovery_required`. A subsequent `status` does not report success. Explicit `rollback` again requires both locks; it does not remove another process's lock, checks compatibility of the current database, and restores only files whose current bytes match the staged new version. For a normal `applied` rollback, all affected files are checked first, so a user-modified file prevents partial restoration from starting. Newly added files are removed only if their hashes still match the installed version.

## Cancellation, attempts, and recovery

A canceled plan sets both task and team status to `cancelled`. This neither removes history nor hides actual executions: all `runs`, including archived attempts, are still checked before maintenance. A new attempt increments `attempt`, and the previous task record is saved as a snapshot in `attempts`; Altron 0.5 uses additive SQLite format 2 for durable mission state; old project documents are preserved.

Recovery is a separate explicit action. The adapter reads the `tui_gateway.server` registry and checks the stored session ID, profile, and folder. An active, awaiting-approval, or building executor is not closed. An old idle runtime is closed through Hermes's normal mechanism so a late submission cannot restart it. Then `active_session_liveness_guard` holds the normal ownership lock until the result is written to Altron. Ownership by another process, an unverifiable OS state, a damaged registry, or an incompatible version does not grant permission. Recovery does not use `session.resume` or `prompt.submit`.

The absence of active execution does not prove successful completion. A recovered run is marked interrupted; submitted files are preserved, and the team does not advance. Revision and a new launch require separate user actions. After rollback, old 0.2/0.3 code cannot display the new controls even though the database is preserved; upgrade again to work with the new history.

### Upgrading an older version with an unstarted plan

The separate maintenance profile can show and explicitly cancel only a team plan in `approved` / `ready` states, with all steps `pending` and without `run_id`, and no runs for the task. Confirmation includes the selected profile and reason. During cancellation, the profile lock and `BEGIN IMMEDIATE` protect the repeated check and write against a concurrent launch. Only task/team states and the cancellation record change; the plan, steps, and other data remain. This action does not close executors or bypass the ordinary `active_operations` update check. Any previously created run makes the action unavailable.

## Stable error codes

`MaintenanceError` inherits from `ValueError`; its string representation is always the machine-readable code:

`paths_must_be_absolute`, `invalid_profile_home`, `invalid_desktop_home`, `invalid_profile_code`, `invalid_profile_data`, `invalid_database`, `invalid_desktop_code`, `path_is_link`, `lock_exists`, `journal_invalid`, `archive_bytes_invalid`, `expected_sha256_invalid`, `archive_too_large`, `archive_checksum_mismatch`, `invalid_archive`, `archive_path_invalid`, `forbidden_archive_file`, `archive_member_type`, `archive_file_too_large`, `archive_total_too_large`, `archive_file_count_too_large`, `archive_path_not_allowed`, `release_manifest_missing`, `release_manifest_invalid`, `release_format_unsupported`, `version_invalid`, `data_version_unsupported`, `invalid_manifest_path`, `duplicate_archive_path`, `duplicate_manifest_path`, `manifest_hash_invalid`, `manifest_file_set_mismatch`, `file_hash_mismatch`, `missing_required_file`, `stage_not_found`, `staged_file_changed`, `update_pending`, `database_incompatible`, `database_invalid`, `active_operations`, `invalid_code_path`, `database_backup_invalid`, `apply_verification_failed`, `apply_failed`, `code_changed`, `backup_invalid`, `no_applied_update`, `recovery_required`, `invalid_reason`, `project_not_found`, `plan_not_unstarted`.

Reapplying the same staged ID after successful installation is rejected as `update_pending`, preserving the original backup. Before rollback, all old backup files, sizes, hashes, and safe paths are checked. The HTTP API retains the process identity that applied the update: reloading one module does not count as restarting the server.

Integrators must display the code rather than replace it with exception text, and must not continue applying an update after `recovery_required`.
