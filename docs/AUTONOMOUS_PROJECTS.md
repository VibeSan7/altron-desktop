# Autonomous projects

Altron 0.5 starts with **interview → work → result**. Manual projects and specialist sequences remain available in the secondary manual mode.

## Start with an idea

1. Select your own configured Hermes connection and exact model. Selection alone does not send a prompt. No provider credentials are included in Altron.
2. Describe the problem or desired outcome in your own words. Starting the interview sends a request to that connection and may consume its quota.
3. Answer the follow-up questions. Altron saves the conversation. During the interview, only the two Altron context/report tools are allowed; it cannot begin implementing the project.
4. Review the proposed goal, requirements, exclusions, plan, deliverables and concrete checks. You can answer again to correct the proposal.
5. Choose a dedicated project folder and set the work-turn and elapsed-time limits. Confirm the exact proposal once to start execution.

The default limit is 12 work turns and 168 hours. One turn can contain multiple model and tool calls. These are **not token or money limits**. The selected provider remains responsible for billing. Native Hermes approvals are not disabled.

## What happens after approval

The backend creates and drives worker sessions, saves checkpoints and validates reported results. The worker may continue across multiple turns. A reported result that fails its agreed checks is sent back for repair within the remaining authorization; you do not need to keep pressing Continue.

You can switch away from or close the Altron tab. **Keep Hermes Desktop and the computer running.** This is not an installed Windows service. Fully closing Desktop stops its backend; a reboot or uncertain session state requires explicit, safe recovery rather than a blind replay.

The approved model/provider, project folder and contract are fixed for that mission. This mode does not authorize separate reviewers, delegation, new accounts, publishing, payments or additional access. A genuine external blocker should stop the mission. A revision authorizes another bounded attempt at the same contract, not an expansion of permissions.

## What “ready” means

A model saying “done” is insufficient. Altron requires:

- a report submitted by the bound worker session;
- actual deliverable files inside the approved project directory;
- a native Hermes terminal receipt and confirmed idle/stopped execution;
- passing checks from the approved contract.

File checks verify presence and optionally specified text. Command checks require a successful **foreground** terminal call with the exact approved command and project working directory. The worker cannot submit its own synthetic command receipts. Later potentially modifying tools invalidate earlier command receipts. File hashes are checked again when the result is settled.

“Ready according to checks” is an automatic verification state, **not acceptance by the user** or a guarantee that the result is useful. Weak criteria produce weak assurance. Read the instructions and inspect the delivered files. Checksums prove integrity, not product quality.

## Stop, recover or revise

- **Stop:** request interruption. The UI distinguishes a request from confirmed cancellation.
- **Prepared/queued:** reconnect explicitly to continue a saved mission that has not been submitted. The backend and UI cannot both claim the same prepared turn.
- **Unconfirmed:** check the previous session first. Altron verifies its profile, directory, session lineage and process ownership. It does not treat a lost connection as proof of termination.
- **Blocked/cancelled:** recovery is allowed only after confirmed termination. Missing ownership or runtime capabilities keep the mission blocked.
- **Revision:** enter feedback and explicitly confirm fresh work/time limits. Original approval and earlier turns remain in the history. Deadlines and work-turn counts are renewed for that revision.

The mission list survives restarts. Draft idea, answer, folder and revision text are stored separately by connection, profile, workspace and mission. Previous turns can be opened in Hermes. Attempt history does not back up earlier file contents; use your own file backups or version control for that.

## Safety boundary and compatibility

This is application-level orchestration, **not a filesystem or network sandbox**. Normal Hermes tools retain their permissions. The project scope in the prompt and named-tool restrictions are not a replacement for operating-system isolation or native approvals. Do not grant a development profile access to sensitive production resources.

Autonomy uses the verified Hermes runtime adapter for session creation, prompt submission, tool hooks and ownership checks. An incompatible runtime fails closed instead of guessing that a session stopped. The exact tested build and evidence are in [DESKTOP_VERIFICATION.md](DESKTOP_VERIFICATION.md).

Altron 0.5 introduces SQLite data format 2. See [UPDATING.md](UPDATING.md) **before upgrading**: a code-only downgrade to format-1 code is blocked after migration. Settings, credentials and existing project documents are preserved; importing over an existing profile is not an upgrade procedure.

## Native permission requests

Project approval does not override Hermes security. When Hermes requires a separate command approval, Altron shows a permission-wait notice; use the corresponding **Open Hermes history** action to inspect and answer the native request. A rejected, unanswered or pending command is not a failed test to retry automatically. Altron blocks the project rather than rephrasing or replaying the denied action. No global approval bypass is installed.

Hermes may also use its own auxiliary model settings for titles and smart security decisions. The selected Altron worker and its no-fallback check do not reconfigure those Hermes features. Work-turn and time limits are not a billing cap.

## Developer verification

`npm run test:autonomous` exercises the real Desktop, gateway, plugin tools, filesystem and command receipts against a deterministic loopback model-protocol fixture. It performs an interview, obtains one approval, submits a deliberately incorrect first result, verifies automatic repair while the mission UI is unmounted, and reopens the saved result after restarting Desktop. It does not use real provider credentials or prove language-model reasoning quality.

It requires the same `ALTRON_JS_HOME` and `ALTRON_PYTHON` settings as `npm run test:native`, plus freshly built archives in `dist/`. Test artifacts stay in the ignored `.hermes/aa-*` directories. Do not publish whole test profiles or raw logs. A successful controlled test is not evidence of a week-long unattended run or universal model/provider support.
