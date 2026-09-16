# First run and user acceptance

This is the installation and acceptance path for a new Windows 11 user. Altron is an extension of Hermes Desktop, not a standalone Windows application. The interface is currently Russian. See [verification](DESKTOP_VERIFICATION.md) for the exact tested build and remaining release gates.

## Before starting

- Install [official Hermes Desktop](https://hermes-agent.nousresearch.com/docs/user-guide/desktop). The checked environment is Desktop 0.17.3 with Hermes Agent 0.21.3 and the Hermes revision listed in the verification report; a different build is not automatically certified.
- Use your own model connection. Altron includes no shared account or paid quota. Configure provider spending limits with your provider; Altron's work-turn and time limits are not money limits.
- Choose a new, dedicated folder containing no valuable files. Do not grant production access for this first exercise. A separate profile does not isolate operating-system permissions.
- Keep Hermes's native security confirmations enabled. Reject unexpected commands or requests for access.

## Unpack the kit, not the profile

1. Extract the outer `altron-kit-<version>.zip` to read this guide and the README in your preferred language.
2. Locate `altron-<version>.tar.gz` and `SHA256SUMS.txt` inside it. Keep that inner `.tar.gz` intact: Desktop imports it directly. The maintenance archive is not needed for a first installation.
3. Import the main archive using **Import profile** beside the add-profile control. It creates `altron` without overwriting `default`.
4. If `altron` already exists, stop this installation path. Follow [UPDATING.md](UPDATING.md); do not delete the existing profile to get past the warning.
5. Fully close and reopen Desktop. Enable **Desktop: Altron** under Plugins, select the `altron` profile, and open **Altron** from the bottom bar.
6. Connect your own model in Hermes, then select the connection and exact model in Altron. Never send passwords, verification codes, `.env` or `auth.json` to support.

## Try one small useful project

For example, describe a need such as: “I want a short, readable checklist for preparing our weekly meeting.” This is only an example, not a preselected project.

1. Start the interview. Answer questions about the audience, desired result and constraints. Starting the interview already calls your model.
2. Read the proposal. Correct missing requirements before approving it. Inspect the deliverable filenames and concrete checks; a file-presence check does not prove usefulness.
3. Select the dedicated project folder, choose modest work-turn and time limits, and confirm **Approve and start** once.
4. If Hermes asks for an additional command permission, inspect it in the corresponding execution history. Project approval is not blanket security approval.
5. Switch to another tab while work runs. Keep Desktop and the computer running. Do not launch a second copy of the task because a response is slow.
6. At **Ready according to checks**, open the result folder. Read every deliverable and the usage instructions, and check that they meet your actual need. This state is not acceptance on your behalf.
7. If needed, request a revision with concrete feedback and explicitly approve the new limits.
8. After completion, fully restart Desktop. Confirm that the result is still visible and that it did not launch again.

## If something goes wrong

- **Waiting for permission:** inspect the native Hermes request. A denied command is not automatically rephrased or retried.
- **Unknown state:** inspect the previous execution, then use explicit recovery. Do not delete locks or edit the database.
- **Stop requested:** wait for verified stopping; the request itself is not proof that execution ended.
- **Time/turn limit:** no additional work is authorized automatically. If you want more work, review the state and explicitly approve revised limits.
- **Import or compatibility error:** preserve the original profile and report the exact message. Do not overwrite files in the installed Hermes application.
- **Stop using Altron:** finish or stop its work, disable Desktop: Altron and switch profiles. No deletion is required.

## Record the acceptance result

A new-machine check is only passed after someone actually completes it. Record:

- Windows, Hermes Desktop and Altron versions; whether Hermes was newly installed.
- Provider and exact model identifiers, but no account identifiers or credentials.
- Whether import, first login, interview, approval, file delivery, stopping and reopening worked.
- Whether the delivered result was useful, not only whether automated checks passed.
- For a failure: numbered reproduction steps, expected and actual behavior, and a redacted screenshot.

Do not submit whole profiles, databases, raw logs or private conversations. See [GitHub Issues](https://github.com/VibeSan7/altron-desktop/issues) for reporting. Nothing is uploaded automatically.
