# Updating Altron and rolling back

English | [Russian](UPDATING.ru.md)

This guide applies to upgrading to **0.4.0-beta.1**. Get the main archive, maintenance archive, and checksums from the same [0.4.0-beta.1 release](https://github.com/VibeSan7/altron-desktop/releases/tag/v0.4.0-beta.1), not from the earlier 0.3 release.

The current Altron interface is in Russian. Actions are described in English here; see the [Russian version](UPDATING.ru.md) for the corresponding on-screen labels.

## If Altron is not installed yet

Import the main `altron-0.4.0-beta.1.tar.gz` archive using the [installation guide](ALTRON_DESKTOP.md). The `altron-maintenance-0.4.0-beta.1.tar.gz` archive is not needed for a first installation. Do not extract the archives.

## Upgrading from Altron 0.2 or 0.3 through a separate profile

Version 0.2 has no built-in updater. In 0.3, an approved team plan that has never started may block an update. A separate maintenance profile handles these cases. **Do not import a new Altron archive over an existing profile** or manually replace the profile directory.

1. Finish Altron's tasks. Use File Explorer to copy the existing profile directory to a separate backup directory. Do not publish this copy: it may contain your connections and history.
2. From one [public GitHub release](https://github.com/VibeSan7/altron-desktop/releases), download the main `altron-0.4.0-beta.1.tar.gz` archive, `altron-maintenance-0.4.0-beta.1.tar.gz`, and `SHA256SUMS.txt`. Downloading requires neither an invitation nor a GitHub login.
3. Use Hermes Desktop's profile-import action and select the **altron-maintenance** archive. This is a separate profile without AI tools or your credentials. It does not replace the existing Altron profile. If a maintenance profile already exists, import the new one under a different unused name; do not overwrite the previous profile.
4. Fully close every Hermes Desktop window. Reopen Desktop and select the imported maintenance profile. Do not open the old Altron in another window during maintenance.
5. Enable **Desktop: Altron Maintenance** in the plugins section, then open the Altron update panel.
6. Explicitly select the existing Altron profile in the update-target list. Its name may differ from `altron`. The panel does not accept arbitrary paths or choose a profile for you.
7. Confirm that all other Hermes windows are fully closed. If approved plans that have never started are listed, read the relevant plan, choose to cancel that unstarted plan, enter a reason, and confirm cancellation separately. The plan and steps are preserved. This does not stop an executor or submit another task. This action does not change a plan that has any created run.
8. Expand Altron maintenance. Enter the full path to the **main** Altron archive, for example using File Explorer's copy-as-path action, without the surrounding quotation marks. From `SHA256SUMS.txt`, copy only the 64 characters next to that archive's name. The checksum verifies the downloaded file's integrity; it does not replace trust in the release source.
9. Check the package and verify the displayed version. Choose to install the verified package, then confirm maintenance. A backup of Altron's database and the affected code is created before replacement.
10. After installation is reported, fully close and reopen Desktop. Select the previous Altron profile and open **Altron**. Check its projects and tasks. Models and connections do not need to be configured again: their files are not replaced. In the new version, a canceled task can be returned for revision.

This changes Altron's UI code shared by profiles on the computer and Altron's code within the selected profile. Projects, the database, `.env`, `auth.json`, `config.yaml`, `SOUL.md`, Hermes history, and unrelated plugins are not replaced. Explicit cancellation in step 7 changes only the selected unstarted task's state and adds a record of the reason. Active or unconfirmed runs still block updates. A paused team task also counts as unfinished work.

## Subsequent updates

If there are no unfinished tasks, Altron 0.3 or later can open its own maintenance panel. Select the main archive of the next compatible release, enter its checksum, and complete verification, confirmation, and a full restart. Do not use the maintenance archive as the main update package.

## Restoring previous code

1. Finish tasks and fully close all other Hermes windows.
2. In Altron maintenance, choose to restore the previous code, then confirm maintenance.
3. Fully close and restart Desktop. Check projects and results.

Rollback restores code, not an old database copy: newer project data is retained when the format is compatible. An older UI does not display newer features. In particular, rolling back to 0.2 removes access to teams and the maintenance panel; rolling back to 0.3 removes the new cancellation and revision controls. Use the saved maintenance profile to upgrade again.

If the main UI will not open, perform the same operation from the maintenance profile after selecting the target profile. Rollback is blocked if its backup is damaged, the code has been changed elsewhere, or work is unfinished.

Backups are stored inside the selected profile at `altron/maintenance/backups/`. Do not delete lock files manually or restore a database over the current one without investigating the cause. Preserve the profile and `altron/maintenance/journal.json` for diagnosis; check the journal for personal paths before sharing it.

## Limitations

Maintenance does not install or update Hermes itself. It does not close other windows or background processes for you: closing the other windows is mandatory. See the [verification report](DESKTOP_VERIFICATION.md) for the tested scenarios and limitations of a specific release.
