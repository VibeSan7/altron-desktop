# Altron Desktop 0.5.0-beta.2 verification

**Status: public beta; not a stable production release.** Published at [v0.5.0-beta.2](https://github.com/VibeSan7/altron-desktop/releases/tag/v0.5.0-beta.2). Evidence and exact profile archive checksums: [public-release-0.5.0-beta.2.json](evidence/public-release-0.5.0-beta.2.json). The [0.4 report](DESKTOP_VERIFICATION_0.4.md) is retained separately; it is not evidence for the autonomous workflow.

## Checked environment

- Windows 11, build 26200; Python 3.11.15; Node.js 22.23.2.
- **Hermes Desktop 0.17.3 with Hermes Agent 0.21.3**, Hermes source commit `d84ece48b8552501660be229797e2d2aa4cee8db`. The Desktop version was read from the running Electron application. Earlier documentation incorrectly called the Agent version the Desktop version.
- Isolated profile homes, Desktop application data, and synthetic project folders. The ordinary tests do not inherit model credentials or configure the working default profile.
- These results do not certify other Hermes revisions or operating systems.

## Automated suites

- **189 Python tests passed, 1 skipped** in the Hermes environment. The skipped check requires Windows permission to create a symbolic link; that permission was not elevated for testing.
- **185 portable Python tests passed, 2 skipped.** The second skip is a native Hermes hook integration check because Hermes's `gateway` package is not installed in the portable environment. That test runs in the full Hermes suite. Portable test dependencies also emit two upstream deprecation warnings; they were not hidden.
- **37 JavaScript tests passed**, including connection selection, state handling, mission UI, and safe manual controls.
- The live-model test remained skipped with `ALTRON_LIVE=0`; ordinary testing does not authorize inference.
- `npm audit` reported zero known vulnerabilities. This is not a general security guarantee.
- Builds and package tests passed. Profiles match their manifests. The handoff ZIP contains the same profiles, checksums, and offline installation/update guides, rather than a different build under the same version.

## Additional defect fixed in this candidate

A mission could outlive its approved time limit while its Hermes session was initializing, then be submitted when initialization finished. Three failing regression cases reproduced this. The coordinator now requests a stop before readiness handling, and the transactional claim checks the deadline again to close the last timing gap. It does not mark an unknown or still-running session stopped just because time expired. The affected controller/execution suite then passed all 27 tests.

## Real Desktop: autonomous protocol

Evidence ID: `aa-8lsMHs`. The main archive hash in the evidence exactly matches the public beta archive.

The test used a **scripted loopback model fixture**, real Hermes Desktop, real gateway, real SQLite persistence, and real filesystem/terminal tools. It verified:

- No result was created during interview or before project approval.
- The saved interview survived a full Desktop restart without another model request.
- Answer drafts survived navigation between modes.
- Approval errors received focus and were visible at a smaller window size; long text wrapped.
- One project approval led to a failed first work result and one automatic repair while the mission UI was unmounted.
- Required command success came from a real terminal receipt, and output contents and file hashes were checked independently.
- Two single-use native approvals allowed only the exact read-only check command. Project approval did not disable Hermes security.
- Keyboard focus stayed in the confirmation dialog; Escape dismissed it without cancelling the project.
- A completed result survived another full Desktop restart without replay or a new request.
- Runtime errors were collected in **every** imported, working, and reopened window and asserted empty. Earlier evidence that only watched the first import window is not used for this stronger claim.

This verifies the protocol and implementation, **not the reasoning quality of a real AI model**. There was no external inference or real user acceptance.

## Real Desktop: manual workflow and updates

- Native UI evidence `an-xJFxcT`: profile import through the native interface, connection catalog, exact selection, folder creation, separate synthetic projects, plan cancellation/revision, reversible archiving, restart persistence, invalid-provider rejection, and same-version maintenance apply/rollback. No external task was submitted. The captured UI-error list was empty.
- Upgrade evidence `upgrade-LZhijN`: **0.4.0-beta.1 to 0.5.0-beta.2**, preserving old tasks and a new decision, and safely refusing incompatible format-1 rollback after migration to format 2. The current code and both generations of data remained intact. Synthetic control settings/auth files were preserved; real credentials were not copied.
- The upgrade harness does not produce the same standalone UI-error log as the other two harnesses; its result is not presented as such a log.
- Completed Desktop processes exited successfully. Earlier failed attempts are retained locally and are not substituted for these results.

## Clean Windows bootstrap probe

A fresh Windows Sandbox verified WebView2, the Hermes bootstrap installer, official Node.js 22.23.2 installation, a source Desktop build and visible Electron launch, and import of `altron-clean` without replacing `default`. The bootstrap did not install Node or ship a packaged Desktop binary by itself; the source fallback required the official Node.js MSI. Provider login for a new account was not tested.

## Distribution and security

The profile archives are built from explicit file lists. The outer ZIP contains both profiles, checksums, license/notices, and documentation; it contains no development environment or raw QA profile. Extract the **outer ZIP**, but import the inner `.tar.gz` profiles without extracting them. See [first run](FIRST_RUN.md) and [updating](UPDATING.md).

File checksums prove archive identity, not usefulness or absence of malicious code. Secret-scan findings must be classified against the actual bytes: a checksum finding is accepted only after recalculating the referenced hashes, not merely because it looks hexadecimal. Private profiles, logs, conversations, keys, and databases are not delivery material.

## Known boundaries for this beta

These scenarios remain outside the evidence and are not replaced by fixture tests:

1. An explicitly authorized autonomous interview-to-result run with a real model and an independently checked useful result. The real-model attempt reached the interview and work stages but stopped at a separate native `execute_code` confirmation; no result was counted as successful.
2. A clean-machine check of Hermes and this kit is partial: a fresh Windows Sandbox verified WebView2, Hermes bootstrap, official Node.js 22.23.2 installation, source Desktop build/launch, and profile import without replacing `default`. The bootstrap itself did not install Node or ship a packaged Desktop binary. A new account's provider login remains untested.
3. A first-time user's walkthrough using [FIRST_RUN.md](FIRST_RUN.md), including reporting confusing steps and confirming the actual result.

No stable-release or universally autonomous claim is made. Closing a workspace tab is supported; closing the whole Desktop stops the executor. A profile is not an operating-system sandbox. Missing access, a permission refusal, exhausted limits, or uncertain runtime state may legitimately block a project rather than produce a false success.
