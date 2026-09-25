# Updating Altron and rolling back

This guide targets public beta **0.5.0-beta.2**. Use its main archive, maintenance archive and `SHA256SUMS.txt` together. The public 0.4 release is a different build without autonomous missions. The current source supports English and Russian; the maintenance workspace follows Hermes by default and also provides its own saved language selector.

## Before an upgrade

**Version 0.5 introduces database format 2. A code-only rollback to 0.4 or earlier is blocked after the first migration.** Never work around that block or overwrite the current database with an old copy. Preserve a complete pre-upgrade profile backup and the previous Desktop-plugin files before proceeding. Keep the backup private: it can contain connections, history and credentials.

An upgrade preserves existing project documents and configuration. It adds mission tables and updates the SQLite format in a transaction when the new Store is first opened. Reading maintenance status alone does not perform this migration.

## First installation

Import `altron-0.5.0-beta.2.tar.gz` using [ALTRON_DESKTOP.md](ALTRON_DESKTOP.md). Do not extract it or use GitHub Source code ZIP. The separate maintenance archive is unnecessary for a fresh installation. Existing profiles are not overwritten.

## Upgrade an existing 0.2, 0.3 or 0.4 profile

Use the **new maintenance profile**, not the old profile's updater: the older code does not accept a format-2 package.

1. Finish or explicitly cancel unstarted tasks. Settle all existing executions. Unknown sessions, prepared/running/queued missions and unsettled turns block maintenance; do not bypass this protection.
2. Fully close all Hermes windows. Copy the existing profile and previous Altron Desktop-plugin files to a separate private backup location.
3. Open Desktop and import `altron-maintenance-0.5.0-beta.2.tar.gz`. If that profile name already exists, choose another unused name; do not overwrite it. The maintenance profile contains no AI tools or credentials.
4. Fully close and reopen Desktop, select the new maintenance profile, enable **Desktop: Altron Maintenance**, and open its update panel. Keep every other Hermes window closed.
5. Select the existing Altron profile explicitly. Confirm that other windows are closed. If an approved team plan has never started, the panel can cancel that plan after a separate reason and confirmation. It preserves the plan and steps and cannot cancel an already created execution this way.
6. Enter the full path to the **main** `altron-0.5.0-beta.2.tar.gz` archive. Enter its 64-character SHA-256 from `SHA256SUMS.txt`. Verify the package and displayed version, then confirm installation. The checksum proves integrity, not trustworthiness of the source.
7. The updater backs up its affected code and database before replacement. Fully close and reopen Desktop after installation. Select the previous Altron profile, open Altron and inspect its saved projects in manual mode. The default screen now offers the autonomous interview.

Code changes affect the selected profile's Altron backend and the shared Altron Desktop UI. The updater does not replace `.env`, `auth.json`, `config.yaml`, `SOUL.md`, other plugins, conversations or project files. It does not install or update Hermes itself. Importing the main archive over an existing profile is not an upgrade procedure.

## Compatible code rollback

For an update that has not changed the database format:

1. Finish work and fully close other Hermes windows.
2. Open maintenance, choose to restore previous code and confirm.
3. Fully close and restart Desktop. Verify the saved projects and results.

Rollback preserves the current database rather than restoring an old snapshot. It first checks the current schema against the backed-up schema, validates backup files, and verifies that installed code has not been changed elsewhere. Same-format reinstallation and rollback are tested separately from schema migration.

## After a format-1 → format-2 migration

The maintenance panel rejects code-only rollback with `database_incompatible`. **This is deliberate, not a reason to delete locks, edit `user_version`, or disable `active_operations`.** An older program cannot interpret the new mission state safely.

Keep the current profile intact. If returning to an earlier version is essential, arrange a separate, explicit recovery from the full pre-upgrade backup in an isolated profile and matching Desktop-plugin environment. Such a restore returns to the backup's point in time and does not include work created afterward. Altron does not perform this destructive data downgrade automatically.

Backups from the updater live under the selected profile's `altron/maintenance/backups/`. Preserve the journal and profile for diagnosis; inspect logs and paths before sharing anything. Do not publish `.env`, `auth.json`, raw databases or a complete profile.

## Evidence limits

See [DESKTOP_VERIFICATION.md](DESKTOP_VERIFICATION.md) for actual checked versions. A controlled local upgrade does not prove installation on a clean PC, first login to every provider or unattended multi-day reliability.
