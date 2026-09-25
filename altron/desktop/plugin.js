// altron/ui/main.mjs
import React from "react";
import * as sdk from "@hermes/plugin-sdk";

// altron/ui/i18n.mjs
var supportedLanguages = /* @__PURE__ */ new Set(["hermes", "ru", "en"]);
var messages = {
  en: {
    plugin: {
      description: "Projects, approved tasks, specialists, and result verification.",
      open: "Open Altron",
      teamError: "Altron team continuation stopped because the result or state was not confirmed. There was no automatic retry.",
      maintenanceDescription: "Safely update an existing Altron installation to a new version.",
      maintenanceTitle: "Altron update",
      maintenanceButton: "Update Altron"
    },
    actions: {
      submitUnknown: "Delivery response was not confirmed. There was no automatic retry.",
      stoppedBeforeSubmit: "The run stopped before the task was submitted. The model was not substituted.",
      cancelRequested: "The user requested a stop. Completion is not confirmed yet."
    },
    language: {
      label: "Language",
      hermes: "Hermes",
      ru: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439",
      en: "English"
    },
    common: {
      attempt: (number) => `Attempt ${number}`,
      archived: "Archived",
      yes: "yes",
      no: "no",
      unknownTime: "time not specified",
      notSpecified: "not specified"
    },
    workspace: {
      demoGoal: "Create a standalone index.html page in the project folder with a clear heading, a list of three services, and a button that reveals contact information. Do not use external libraries, network access, or publishing.",
      demoAcceptance: "Open index.html in a browser. Check the heading, the three services, the button click, and that the console has no errors. Describe the completed checks and limitations in CHECKS.md.",
      usageTokens: (input, output) => `Tokens (text units): ${input} input / ${output} output. `,
      costUnknown: (tokens) => `${tokens}Cost is unknown: Hermes did not provide a confirmed amount.`,
      cost: (tokens, cost, estimated) => `${tokens}Cost: $${cost}${estimated ? " \u2014 Hermes estimate, not a provider invoice" : " \u2014 according to Hermes"}.`,
      elapsed: (minutes, seconds) => `${minutes} min ${seconds} sec`,
      timeUnknown: "Time is unknown",
      connectionTitle: "AI connection for the next run",
      connectionDescription: "Your Hermes connections are used. Do not enter keys or passwords here. This choice does not change other conversations.",
      catalogError: "Could not read the catalog. Check the Hermes connection or enter values you already know manually.",
      configuredConnection: "Configured connection",
      chooseConnection: "Choose a connection",
      loginRequired: " \u2014 sign-in required in Hermes",
      catalogModel: "Model from catalog",
      chooseModel: "Choose a model",
      useCurrentConnection: "Use the current Hermes connection",
      connectionReady: "Settings selected. No request was sent to the model; response availability will be checked during a confirmed run.",
      connectionNeeded: "Choose a connection and model. If sign-in is not configured yet: Settings \u2192 Model in Hermes. No request was sent to the model.",
      advancedEntry: "Advanced manual entry",
      model: "Model",
      provider: "Provider",
      checkConnection: "Check connection settings",
      folderUnavailable: "The folder is unavailable. You can enter the full path in the project field.",
      chooseFolder: "Choose folder",
      folderDialog: "Choose project folder",
      folderPrivacy: "Only folders on the computer running the selected Hermes are shown; file contents are not read.",
      parentFolder: "Up one level",
      newFolderName: "New folder name",
      createFolderFailed: "Could not create the folder. Check its name, permissions, and whether a folder with that name already exists.",
      createAndChoose: "Create and choose folder",
      chooseThisFolder: "Choose this folder",
      closeFolderPicker: "Close folder picker",
      diagnosticsTitle: "Help and safe diagnostics",
      diagnosticsDescription: "Report without paths or task contents: only versions, system details, and state counts. It is not sent anywhere automatically.",
      buildDiagnostics: "Create diagnostic report",
      copyDiagnostics: "Copy verified report",
      reportIssue: "Report a problem on GitHub"
    },
    taskControls: {
      attempt: (number, archived) => `Attempt ${number}${archived ? " \xB7 Archived" : ""}`,
      revisionFeedback: (value) => `Revision notes: ${value}`,
      cancellationReason: (value) => `Cancellation reason: ${value}`,
      unsettled: "Execution is not yet confirmed as finished. Cancelling the task, starting a new attempt, archiving, and acceptance are blocked. Request the active worker to stop or check the state after a failure.",
      cancel: "Cancel task",
      revise: "Return for revision",
      recover: "Check and recover state",
      restoreArchive: "Restore from archive",
      archive: "Move to archive",
      dialogLabel: "Confirm task change",
      recoverDescription: "Altron will check active Hermes sessions and close only an inactive old run. This action does not stop an active worker. No new task is sent; if verification is unavailable, the block remains.",
      reviseDescription: "History, the previous report, and the file list are kept. The new attempt remains a draft until it is approved and its launch is confirmed.",
      cancelDescription: "The plan and history are kept. This task will no longer wait for execution.",
      whatToFix: "What to change",
      cancelReason: "Cancellation reason",
      confirmChange: "Confirm task change",
      leaveUnchanged: "Leave unchanged",
      recoveryActive: "Hermes is still working. No repeated run was started.",
      recoveryDone: "Verification finished. There is no automatic continuation; choose the next action.",
      attemptHistory: "Attempt history",
      historyDescription: "Previous plans, notes, reports, and checksums are saved. Files in the working folder may be changed by the next attempt; this is not a file versioning system.",
      previousAttempt: (number) => `Attempt ${number}`,
      acceptance: (value) => `Acceptance: ${value}`
    },
    team: {
      roles: {
        altron: "Altron \u2014 requirements and plan",
        technical: "Technical work",
        business: "Research and business",
        memory: "Decisions and documentation",
        reviewer: "Independent review"
      },
      states: {
        cancelled: "Cancelled by user",
        interrupted: "Step interrupted",
        blocked: "Step not started: files from the previous step are not confirmed",
        ready: "Waiting to start",
        running: "Team is working",
        paused: "Paused",
        unknown: "State is not confirmed \u2014 retry is forbidden",
        failed: "Stopped with an error",
        review: "All steps delivered \u2014 acceptance required",
        done: "Accepted by user",
        pending: "Not started yet",
        prepared: "Prepared",
        reported: "Files delivered, waiting for completion",
        complete: "Step completed",
        cancel_requested: "Stop requested"
      },
      noRoute: "No model assigned to this role",
      setup: "Team setup",
      setupDescription: "Roles and connections are saved for this project. Empty roles do not run. No models work around the clock here. Changing the team does not change plans that are already approved.",
      assignAll: "Assign the selected connection to every role except the reviewer",
      modelFor: (role) => `Model \u2014 ${role}`,
      providerFor: (role) => `Provider \u2014 ${role}`,
      instructionsFor: (role) => `Instructions \u2014 ${role}`,
      baseRole: "Base Altron role",
      adaptedInstructions: "Adapted agency-agents instructions are selected. They do not grant new access or replace approval.",
      removeAssignment: (role) => `Remove assignment \u2014 ${role}`,
      assignmentIncomplete: "Every assigned role needs both a model and a provider.",
      save: "Save team setup",
      source: (commit) => `Instructions pinned to: ${commit}. MIT license; sources and changes are listed in THIRD_PARTY_NOTICES.md.`,
      sequence: "Specialist sequence",
      sequenceDescription: "Optional: split the plan into steps. Altron passes confirmed files to the next worker after the previous step finishes. The reviewer runs separately.",
      stepRole: (number) => `Role for step ${number}`,
      stepResult: (number) => `Result for step ${number}`,
      stepAcceptance: (number) => `Checks for step ${number}`,
      removeStep: (number) => `Remove step ${number}`,
      addStep: "Add step",
      approvePlan: "Approve team plan",
      approvedTeam: (state) => `Approved team: ${state}`,
      criteria: (value) => `Checks: ${value}`,
      separateReviewer: "The reviewer starts with a separate confirmation. The user, not the team, accepts the final work.",
      start: "Start approved team",
      resume: "Continue after pause",
      pause: "Pause team and request a stop",
      startDialog: "Confirm team start",
      project: (name) => `Project: ${name}`,
      startDescription: "Only the steps shown above will run, in order, on the specified models. Your provider may charge you. If an error occurs or the profile changes, continuation stops; there are no hidden retries.",
      confirmStart: "Confirm team start",
      doNotStart: "Do not start"
    },
    maintenance: {
      errors: {
        active_operations: "There are active, paused, or unconfirmed runs. Finish them first; the update did not start.",
        archive_checksum_mismatch: "The checksum does not match. Download the archive and SHA256SUMS.txt from the same release.",
        invalid_archive_path: "No regular archive file was found at the full path on this computer.",
        lock_exists: "Maintenance is blocked by another or interrupted operation. The lock is not removed automatically.",
        code_changed: "Installed files changed after the update. Rollback stopped and did not overwrite your changes.",
        backup_invalid: "The backup is damaged. Rollback stopped.",
        database_incompatible: "The database format is incompatible with this code. Rollback stopped without changing files. After a migration, use a verified compatible release or restore a complete backup separately.",
        recovery_required: "The previous operation did not finish. New tasks are forbidden until recovery."
      },
      states: {
        idle: "No updates have been performed",
        staged: "Package verified",
        applied: "Update installed",
        rolled_back: "Previous code restored",
        recovery_required: "Recovery required"
      },
      restartNotice: "Altron: completely close Hermes Desktop and open it again. New tasks are blocked until restart.",
      genericError: "The package or operation did not pass verification. Files are not considered updated. Check the release archive and maintenance state.",
      title: "Altron maintenance",
      description: "Download the Altron archive and SHA256SUMS.txt from the same verified GitHub release. The update changes Altron code, not your projects, connections, or settings. A database and old-code backup is created before replacement.",
      scopeDescription: "The selected Hermes server is maintained. For a normal local installation, this is your computer. Its profiles share the interface code. Finish work in every Altron window before updating.",
      stateUnknown: "State is not confirmed",
      unavailable: "Maintenance is unavailable in this profile. Check the Altron package installation.",
      restartRequired: "Completely close Hermes Desktop and open it again. New tasks are blocked until restart.",
      archivePath: "Full path to the Altron archive",
      checksum: "SHA-256 checksum",
      verifyPackage: "Verify package",
      packageVerified: (version) => `Verified package ${version}`,
      codeFiles: (count) => `${count} code files. They are not replaced until confirmation.`,
      install: "Install verified package",
      rollback: "Restore previous code",
      confirmDialog: "Confirm maintenance",
      installQuestion: "Install the verified package? A full Hermes Desktop restart will be required after replacement.",
      rollbackQuestion: "Restore the previous code? Current projects and the database are kept. A full Hermes Desktop restart will be required.",
      confirm: "Confirm maintenance",
      cancel: "Cancel"
    },
    bootstrap: {
      pendingTitle: "Approved plans that have not started",
      pendingDescription: "In the old version they may block an update. You can explicitly cancel the selected plan: its text and history are kept. This does not stop active work or bypass protection.",
      pendingError: "The plan list is not confirmed. The update remains blocked.",
      noPending: "There are no unstarted team plans.",
      cancelPlan: "Cancel this unstarted plan",
      cancelDialog: "Cancel old plan",
      planSummary: (profile, project, task) => `Profile: ${profile}. Project: ${project}. Task: ${task}. No new task is sent.`,
      cancelReason: "Reason for cancelling the old plan",
      cancelFailed: "Cancellation was not confirmed. If the plan already started, this operation is forbidden; do not delete its records manually.",
      confirmCancel: "Confirm cancellation of the old plan",
      keepPlan: "Keep old plan",
      title: "Update an existing Altron installation",
      description: "This panel moves an installed Altron to a new version without importing its profile again. Connections, projects, and history are not replaced. No AI is started.",
      safety: "Before maintenance, finish tasks and completely close all other Hermes windows. Open only the altron-maintenance profile. Altron interface code is shared by this computer\u2019s profiles.",
      targetError: "Choose the altron-maintenance service profile. The installation list could not be loaded.",
      target: "Profile to update",
      chooseTarget: "Choose a profile",
      noTarget: "No existing Altron installation with a project database was found. For a new installation, import the main Altron package.",
      windowsClosed: "I completely closed all other Hermes windows"
    },
    mission: {
      statuses: {
        prepared: "Prepared",
        creating: "Creating session",
        bound: "Session linked",
        running: "In progress",
        waiting: "Waiting for an answer",
        awaiting_approval: "Awaiting confirmation",
        queued: "Queued",
        ready: "Ready based on checks",
        blocked: "Blocked",
        unknown: "State is not confirmed",
        cancel_requested: "Stop requested",
        cancelled: "Confirmed stopped"
      },
      phases: { interview: "Interview", work: "Work" },
      sessionInterview: "Altron \u2014 interview",
      sessionWork: "Altron \u2014 work",
      errors: {
        scope_changed: "The profile or connection changed. The operation stopped; the other source was not modified.",
        model_mismatch: "Hermes returned a different model or provider. The session was not linked.",
        profile_mismatch: "Hermes returned a different profile. The session was not linked.",
        session_identity_missing: "Hermes did not return both session identities. There is no repeated link attempt.",
        mission_already_starting: "This operation is already running. The repeated click did not start it again.",
        directory_required: "Choose the project folder before confirmation.",
        directory_must_be_absolute: "Enter the full project-folder path, not a relative path.",
        project_overlap: "This folder already belongs to another project. Choose a separate folder.",
        invalid_limits: "Limits: 1\u2013200 work turns and 1\u2013168 hours.",
        permission_pending: "Hermes is waiting for permission for a separate command. Open the Hermes session and review the request. Altron does not bypass protection.",
        permission_required: "Hermes did not allow the command or receive a response. Automatic retries stopped; check permissions before continuing.",
        run_still_active: "The previous run is still active. Blind retry is forbidden.",
        time_limit: "The time limit was reached.",
        turn_limit: "The work-turn limit was reached."
      },
      genericError: "The operation is not confirmed. Check the mission state and Hermes connection.",
      empty: "No data yet.",
      myMissions: "My missions",
      queryError: "Saved missions could not be read. Check the connection; no new execution was started.",
      turnsLimit: "Work turns (1\u2013200)",
      hoursLimit: "Hours (1\u2013168)",
      interview: "Interview",
      interviewDescription: "Questions and answers are saved in the mission. You do not need to write a technical specification in advance.",
      altronQuestion: "Altron question",
      yourAnswer: "Your answer",
      reviseProposal: "Correct or clarify the proposal",
      answerQuestion: "Answer the question",
      answerPlaceholder: "Add the next important piece of context\u2026",
      saveAnswer: "Save answer",
      proposalDescription: "You can clarify the proposal with the answer above. Confirmation below starts the project. Separate Hermes security requests may require your decision.",
      goal: "Goal",
      requirements: "Requirements",
      outOfScope: "Out of scope",
      plan: "Plan",
      deliverables: "Deliverables",
      checks: "Specific checks",
      connection: (model, provider) => `Model: ${model} \xB7 Provider: ${provider}`,
      projectFolder: "Project folder \u2014 choose explicitly",
      folderPlaceholder: "Full path to a separate folder",
      limitsDescription: "These are work-turn and time limits, not a number of individual model calls or a spending limit.",
      approve: "Confirm and start",
      fileContentCheck: (path) => `File ${path}: content is checked`,
      fileExistenceCheck: (path) => `File ${path}: existence is checked`,
      commandCheck: (command) => `Command: ${command}`,
      runs: "Turns and state",
      checkpoint: "Checkpoint",
      turn: (number) => `Turn ${number}`,
      created: (value) => `Created: ${value}`,
      terminal: (status, settled) => `Completion: ${status}; settled: ${settled}`,
      openHistory: "Open Hermes history",
      stopRequested: "A stop was requested. It becomes a confirmed cancellation only after actual execution has been checked.",
      stateUnknown: "The state is not confirmed. The task is not sent again automatically; check it and recover explicitly first.",
      blocked: "Blocked: ",
      reasonMissing: "reason not specified",
      stop: "Stop execution",
      resume: "Continue saved mission",
      recover: "Check previous execution and recover",
      result: "Result",
      resultReady: "Ready based on confirmed checks. This does not mean the user has accepted the result.",
      resultNotReady: "The result has not passed all confirmed checks yet.",
      files: "Files",
      verifications: "Checks",
      passed: "Passed",
      failed: "Failed",
      fileCheck: "File check",
      commandVerification: "Command check",
      source: (value) => `source: ${value}`,
      instructions: "Instructions",
      showFolder: "Show folder in File Explorer",
      optionalRevision: "Optional revision",
      revisionPlaceholder: "Describe what should change\u2026",
      revisionLimits: (turns, hours) => `The new revision uses the same approved project and checks. Confirmed limits: ${turns} turns and ${hours} hours.`,
      confirmRevision: "Confirm revision",
      stopTitle: "Stop mission?",
      recoverTitle: "Recover mission?",
      reviseTitle: "Confirm revision?",
      stopDescription: "A stop is requested first and becomes confirmed after Hermes checks it.",
      recoverDescription: "The previous execution is checked first. There is no blind retry.",
      reviseDescription: (turns, hours) => `Approved requirements are kept. Allow up to ${turns} work turns and ${hours} hours for revision?`,
      stopLabel: "Stop",
      recoverLabel: "Check and recover",
      reviseLabel: "Confirm revision",
      flow: "INTERVIEW \u2192 WORK \u2192 RESULT",
      startTitle: "Start with your idea",
      startDescription: "You do not need to write a technical specification in advance. Altron will ask questions, propose a concrete plan, and request one final confirmation before work.",
      desiredResult: "What do you want to create?",
      desiredPlaceholder: "Describe the problem or desired result in your own words\u2026",
      reportExampleText: "Prepare a concise report about the current process for the team.",
      pageExampleText: "Create a small page with instructions and checks for users.",
      reportExample: "Report example",
      pageExample: "Page example",
      examplesDescription: "Examples only fill the field. The interview uses the selected AI connection and may consume its allowance; project execution starts only after the plan is confirmed.",
      savingInterview: "Saving interview\u2026",
      startInterview: "Start interview",
      autonomousMission: "Autonomous mission",
      newInterview: "New interview",
      work: "Work",
      closeDescription: "You can close the Altron tab \u2014 work continues while Hermes Desktop is running. Fully closing the app or turning off the computer will require safe recovery.",
      artifactSize: (bytes) => `${bytes} bytes`
    },
    view: {
      statuses: {
        cancelled: "Cancelled by user",
        team_waiting: "Passing work between team steps",
        interrupted: "Execution stopped",
        draft: "Plan required",
        approved: "Plan approved",
        launching: "Preparing launch",
        planning: "Altron is preparing a plan",
        running: "In progress",
        reviewing: "Review in progress",
        review: "Acceptance required",
        done: "Accepted by user",
        failed: "Stopped with an error",
        unknown: "State is not confirmed",
        cancel_requested: "Stop requested",
        reported: "Result delivered",
        prepared: "Launch prepared"
      },
      roles: {
        technical: "Technical work",
        business: "Research and business",
        memory: "Decisions and documentation",
        altron: "Altron \u2014 prepare a plan",
        reviewer: "Independent reviewer"
      },
      errors: {
        runtime_state_changed: "The run state changed during verification. Nothing was restarted; refresh and check again.",
        runtime_unavailable: "Could not connect to Hermes run verification. The block remains; restart Hermes and check the state again, not the task launch.",
        runtime_scope_mismatch: "The run belongs to a different folder or profile. It was not changed.",
        runtime_state_unconfirmed: "Hermes did not confirm a safe finish. The block remains.",
        run_budget_exhausted: "The allowed project-run limit was reached. Change it explicitly in the limits section.",
        task_archived: "Restore the task from the archive first.",
        scope_changed: "The profile or project changed. The operation stopped.",
        model_mismatch: "Hermes returned a different model or provider. The task was not sent.",
        model_and_provider_required: "Choose a model and specify its provider.",
        project_overlap: "This folder already belongs to another project. Choose a separate folder.",
        directory_not_found: "The folder was not found. Create it in File Explorer and enter its full path.",
        directory_must_be_absolute: "Enter the full path to an existing folder.",
        directory_too_broad: "Use a separate project folder, not an entire drive or Hermes profile.",
        artifact_changed: "The file changed after the result was delivered. Acceptance is blocked.",
        artifact_unavailable: "One of the files is unavailable. Acceptance is blocked.",
        run_state_unconfirmed: "The run state could not be confirmed. Nothing was sent again.",
        run_already_starting: "This run is already being processed."
      },
      genericError: "The operation was not confirmed. Check the task state and Hermes connection; there is no automatic retry.",
      trackingError: "Could not save the final Altron run state. The state is not confirmed; no retry was performed.",
      readinessCriteria: "Readiness criteria",
      archivedTask: "The task is archived. Restore it to continue.",
      nextDraft: "Next: write a plan yourself or ask Altron. Work does not begin before approval.",
      nextApproved: "Next: check the selected connection and confirm the launch, or cancel the plan.",
      nextReview: "Next: open the files, check the criteria, and accept the result or return it for revision.",
      nextStopped: "Next: check the Hermes state. After a confirmed stop, you can revise this same task.",
      planForApproval: "Plan for approval",
      askPlan: "Ask Altron to prepare a plan",
      approvePlan: "Approve plan",
      approvedPlan: "Approved plan",
      noApprovedPlan: "The plan is not approved yet.",
      assignee: "Worker",
      startWorker: "Start worker",
      launchDialog: "Confirm launch",
      launch: (role) => `Launch: ${role}`,
      launchSummary: (project, directory, model, provider) => `Project: ${project}
Folder: ${directory}
Model: ${model}
Provider: ${provider}`,
      launchDescription: "This is a separate run in your Hermes. Your provider may charge you. Altron does not automatically replace the model or resend the task.",
      confirmLaunch: "Confirm launch",
      doNotLaunch: "Do not launch",
      workerReport: "Worker report \u2014 not acceptance yet",
      resultFiles: "Actual result files",
      fileSize: (bytes) => `${bytes} bytes`,
      openResultFolder: "Open result folder",
      reviewerConclusion: "Independent reviewer conclusion",
      orderReview: "Request independent review",
      checksumDescription: "You may check the files yourself. A checksum confirms that a file has not changed, not that its contents are correct.",
      reviewField: "What you checked against the task criteria",
      reviewCheckbox: "I opened the files and checked the criteria, not only the report.",
      acceptResult: "I checked the result \u2014 accept",
      userAcceptance: (value) => `User acceptance: ${value}`,
      runAttempt: (attempt, elapsed) => `Attempt ${attempt} \xB7 ${elapsed}`,
      openHermes: "Open conversation in Hermes",
      requestStop: "Request stop",
      projectNow: "Current project state",
      projectSummary: (active, review, blocked, done, archived) => `Open tasks: ${active}. Awaiting acceptance: ${review}. Stop needs review: ${blocked}. Accepted: ${done}. Archived: ${archived}.`,
      lastDecision: (value) => `Latest decision: ${value}`,
      runLimit: "New-run limit",
      remainingRuns: (value) => `Allowed runs remaining: ${value}. This includes plan preparation, each team step, and an independent review. It is not a spending limit; an active run is not interrupted.`,
      unlimited: "unlimited",
      allowRuns: "Allow more runs",
      emptyUnlimited: "Empty \u2014 unlimited",
      confirmRunLimit: "Confirm run limit",
      newTask: "New task",
      fillDemo: "Fill learning example",
      demoDescription: "The example only fills the form: a page with a button and its checks. Creating and launching the task still require your next actions.",
      desiredOutcome: "Required outcome",
      readinessCheck: "How to check completion",
      createTask: "Create task",
      searchTasks: "Search tasks",
      showArchive: "Show archive",
      projectDecisions: "Project decisions",
      newDecision: "New decision",
      saveDecision: "Save decision",
      headerDescription: "Describe an idea. Altron will clarify the task, do the work, and show a verified result.",
      noConnection: "No Hermes connection. Task actions are unavailable.",
      loading: "Loading Altron\u2026",
      apiUnavailable: "The Altron API is unavailable. Check that the Python part of the package is enabled in this Hermes profile.",
      modeLabel: "Altron mode",
      autonomousMode: "Autonomous project",
      manualMode: "Manual mode",
      refresh: "Refresh state",
      currentProject: "Current project",
      chooseProject: "Choose project",
      addProject: "Add project",
      projectName: "Project name",
      projectFolder: "Project folder",
      projectFolderPlaceholder: "Full path to a separate existing folder",
      folderWarning: "Do not choose an entire drive or the Hermes folder. Altron does not copy old projects or create tasks automatically.",
      createProject: "Create project",
      projectUnavailable: "The selected project is unavailable. Data from another owner is not substituted.",
      autonomousProjectNotice: "This project runs in autonomous mode. Open it under \u201CAutonomous project\u201D."
    }
  },
  ru: {
    plugin: {
      description: "\u041F\u0440\u043E\u0435\u043A\u0442\u044B, \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438, \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0441\u0442\u044B \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u0432.",
      open: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C Altron",
      teamError: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u044B Altron \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E: \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0438\u043B\u0438 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u0430 \u043D\u0435\u0442.",
      maintenanceDescription: "\u0411\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u044B\u0439 \u043F\u0435\u0440\u0435\u0445\u043E\u0434 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0433\u043E Altron \u043D\u0430 \u043D\u043E\u0432\u0443\u044E \u0432\u0435\u0440\u0441\u0438\u044E.",
      maintenanceTitle: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 Altron",
      maintenanceButton: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 Altron"
    },
    actions: {
      submitUnknown: "\u041E\u0442\u0432\u0435\u0442 \u043D\u0430 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0443 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u0430 \u043D\u0435\u0442.",
      stoppedBeforeSubmit: "\u0417\u0430\u043F\u0443\u0441\u043A \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D \u0434\u043E \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u0437\u0430\u0434\u0430\u043D\u0438\u044F. \u041C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u043F\u043E\u0434\u043C\u0435\u043D\u044F\u043B\u0430\u0441\u044C.",
      cancelRequested: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u0437\u0430\u043F\u0440\u043E\u0441\u0438\u043B \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0443. \u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435 \u0435\u0449\u0451 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E."
    },
    language: {
      label: "\u042F\u0437\u044B\u043A",
      hermes: "Hermes",
      ru: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439",
      en: "English"
    },
    common: {
      attempt: (number) => `\u041F\u043E\u043F\u044B\u0442\u043A\u0430 ${number}`,
      archived: "\u0412 \u0430\u0440\u0445\u0438\u0432\u0435",
      yes: "\u0434\u0430",
      no: "\u043D\u0435\u0442",
      unknownTime: "\u0432\u0440\u0435\u043C\u044F \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E",
      notSpecified: "\u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E"
    },
    workspace: {
      demoGoal: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0432 \u043F\u0430\u043F\u043A\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0430\u0432\u0442\u043E\u043D\u043E\u043C\u043D\u0443\u044E \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 index.html: \u043F\u043E\u043D\u044F\u0442\u043D\u044B\u0439 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A, \u0441\u043F\u0438\u0441\u043E\u043A \u0442\u0440\u0451\u0445 \u0443\u0441\u043B\u0443\u0433 \u0438 \u043A\u043D\u043E\u043F\u043A\u0443, \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u044E\u0449\u0443\u044E \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u043D\u0443\u044E \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044E. \u0411\u0435\u0437 \u0432\u043D\u0435\u0448\u043D\u0438\u0445 \u0431\u0438\u0431\u043B\u0438\u043E\u0442\u0435\u043A, \u0441\u0435\u0442\u0438 \u0438 \u043F\u0443\u0431\u043B\u0438\u043A\u0430\u0446\u0438\u0438.",
      demoAcceptance: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C index.html \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435. \u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A, \u0442\u0440\u0438 \u0443\u0441\u043B\u0443\u0433\u0438, \u043D\u0430\u0436\u0430\u0442\u0438\u0435 \u043A\u043D\u043E\u043F\u043A\u0438 \u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043E\u0448\u0438\u0431\u043E\u043A \u0432 \u043A\u043E\u043D\u0441\u043E\u043B\u0438. \u041E\u043F\u0438\u0441\u0430\u0442\u044C \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u044B\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u0438 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F \u0432 CHECKS.md.",
      usageTokens: (input, output) => `\u0422\u043E\u043A\u0435\u043D\u044B (\u0447\u0430\u0441\u0442\u0438 \u0442\u0435\u043A\u0441\u0442\u0430): ${input} \u0432\u0445\u043E\u0434 / ${output} \u0432\u044B\u0445\u043E\u0434. `,
      costUnknown: (tokens) => `${tokens}\u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C \u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430: Hermes \u043D\u0435 \u043F\u0440\u0435\u0434\u043E\u0441\u0442\u0430\u0432\u0438\u043B \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u0443\u044E \u0441\u0443\u043C\u043C\u0443.`,
      cost: (tokens, cost, estimated) => `${tokens}\u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C: $${cost}${estimated ? " \u2014 \u043E\u0446\u0435\u043D\u043A\u0430 Hermes, \u043D\u0435 \u0441\u0447\u0451\u0442 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430" : " \u2014 \u043F\u043E \u0434\u0430\u043D\u043D\u044B\u043C Hermes"}.`,
      elapsed: (minutes, seconds) => `${minutes} \u043C\u0438\u043D ${seconds} \u0441`,
      timeUnknown: "\u0412\u0440\u0435\u043C\u044F \u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E",
      connectionTitle: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0418\u0418 \u0434\u043B\u044F \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0433\u043E \u0437\u0430\u043F\u0443\u0441\u043A\u0430",
      connectionDescription: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E\u0442\u0441\u044F \u0432\u0430\u0448\u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F Hermes. \u041A\u043B\u044E\u0447\u0438 \u0438 \u043F\u0430\u0440\u043E\u043B\u0438 \u0441\u044E\u0434\u0430 \u043D\u0435 \u0432\u0432\u043E\u0434\u044F\u0442\u0441\u044F. \u0412\u044B\u0431\u043E\u0440 \u0437\u0434\u0435\u0441\u044C \u043D\u0435 \u043C\u0435\u043D\u044F\u0435\u0442 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0434\u0440\u0443\u0433\u0438\u0445 \u0434\u0438\u0430\u043B\u043E\u0433\u043E\u0432.",
      catalogError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u043A\u0430\u0442\u0430\u043B\u043E\u0433. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 Hermes \u0438\u043B\u0438 \u0437\u0430\u0434\u0430\u0439\u0442\u0435 \u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0435 \u0432\u0430\u043C \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F \u0432\u0440\u0443\u0447\u043D\u0443\u044E.",
      configuredConnection: "\u041D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u043D\u043E\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435",
      chooseConnection: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435",
      loginRequired: " \u2014 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0432\u0445\u043E\u0434 \u0432 Hermes",
      catalogModel: "\u041C\u043E\u0434\u0435\u043B\u044C \u0438\u0437 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430",
      chooseModel: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u043E\u0434\u0435\u043B\u044C",
      useCurrentConnection: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0435\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 Hermes",
      connectionReady: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0432\u044B\u0431\u0440\u0430\u043D\u044B. \u0417\u0430\u043F\u0440\u043E\u0441 \u043A \u043C\u043E\u0434\u0435\u043B\u0438 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u043B\u0441\u044F; \u0440\u0430\u0431\u043E\u0442\u043E\u0441\u043F\u043E\u0441\u043E\u0431\u043D\u043E\u0441\u0442\u044C \u043E\u0442\u0432\u0435\u0442\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u0441\u044F \u043F\u0440\u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E\u043C \u0437\u0430\u043F\u0443\u0441\u043A\u0435.",
      connectionNeeded: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438 \u043C\u043E\u0434\u0435\u043B\u044C. \u0415\u0441\u043B\u0438 \u0432\u0445\u043E\u0434 \u0435\u0449\u0451 \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D: Settings \u2192 Model \u0432 Hermes. \u0417\u0430\u043F\u0440\u043E\u0441 \u043A \u043C\u043E\u0434\u0435\u043B\u0438 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u043B\u0441\u044F.",
      advancedEntry: "\u0420\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u043D\u044B\u0439 \u0440\u0443\u0447\u043D\u043E\u0439 \u0432\u0432\u043E\u0434",
      model: "\u041C\u043E\u0434\u0435\u043B\u044C",
      provider: "\u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440",
      checkConnection: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F",
      folderUnavailable: "\u041F\u0430\u043F\u043A\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430. \u041C\u043E\u0436\u043D\u043E \u0443\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u0432 \u043F\u043E\u043B\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430.",
      chooseFolder: "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u043F\u0430\u043F\u043A\u0443",
      folderDialog: "\u0412\u044B\u0431\u043E\u0440 \u043F\u0430\u043F\u043A\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
      folderPrivacy: "\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0430\u043F\u043A\u0438 \u043D\u0430 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0435, \u0433\u0434\u0435 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 Hermes; \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435 \u0444\u0430\u0439\u043B\u043E\u0432 \u043D\u0435 \u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044F.",
      parentFolder: "\u041D\u0430 \u0443\u0440\u043E\u0432\u0435\u043D\u044C \u0432\u044B\u0448\u0435",
      newFolderName: "\u0418\u043C\u044F \u043D\u043E\u0432\u043E\u0439 \u043F\u0430\u043F\u043A\u0438",
      createFolderFailed: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u0430\u043F\u043A\u0443. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0438\u043C\u044F, \u043F\u0440\u0430\u0432\u0430 \u0438 \u043D\u0430\u043B\u0438\u0447\u0438\u0435 \u043F\u0430\u043F\u043A\u0438 \u0441 \u0442\u0430\u043A\u0438\u043C \u0438\u043C\u0435\u043D\u0435\u043C.",
      createAndChoose: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0438 \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u043F\u0430\u043F\u043A\u0443",
      chooseThisFolder: "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u044D\u0442\u0443 \u043F\u0430\u043F\u043A\u0443",
      closeFolderPicker: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0432\u044B\u0431\u043E\u0440 \u043F\u0430\u043F\u043A\u0438",
      diagnosticsTitle: "\u041F\u043E\u043C\u043E\u0449\u044C \u0438 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u0430\u044F \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430",
      diagnosticsDescription: "\u041E\u0442\u0447\u0451\u0442 \u0431\u0435\u0437 \u043F\u0443\u0442\u0435\u0439 \u0438 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0433\u043E \u0437\u0430\u0434\u0430\u0447: \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u0435\u0440\u0441\u0438\u0438, \u0441\u0438\u0441\u0442\u0435\u043C\u0430 \u0438 \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0439. \u041E\u043D \u043D\u0438\u043A\u0443\u0434\u0430 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438.",
      buildDiagnostics: "\u0421\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043E\u0442\u0447\u0451\u0442",
      copyDiagnostics: "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u043E\u0442\u0447\u0451\u0442",
      reportIssue: "\u0421\u043E\u043E\u0431\u0449\u0438\u0442\u044C \u043E \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u0435 \u043D\u0430 GitHub"
    },
    taskControls: {
      attempt: (number, archived) => `\u041F\u043E\u043F\u044B\u0442\u043A\u0430 ${number}${archived ? " \xB7 \u0412 \u0430\u0440\u0445\u0438\u0432\u0435" : ""}`,
      revisionFeedback: (value) => `\u0417\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u043A \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u043A\u0435: ${value}`,
      cancellationReason: (value) => `\u041F\u0440\u0438\u0447\u0438\u043D\u0430 \u043E\u0442\u043C\u0435\u043D\u044B: ${value}`,
      unsettled: "\u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u0435\u0449\u0451 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E \u043A\u0430\u043A \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D\u043D\u043E\u0435. \u041E\u0442\u043C\u0435\u043D\u0430 \u0437\u0430\u0434\u0430\u0447\u0438, \u043D\u043E\u0432\u0430\u044F \u043F\u043E\u043F\u044B\u0442\u043A\u0430, \u0430\u0440\u0445\u0438\u0432 \u0438 \u043F\u0440\u0438\u0451\u043C\u043A\u0430 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u044B. \u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u0435 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0443 \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0449\u0435\u0433\u043E \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F \u0438\u043B\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043F\u043E\u0441\u043B\u0435 \u0441\u0431\u043E\u044F.",
      cancel: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443",
      revise: "\u0412\u0435\u0440\u043D\u0443\u0442\u044C \u043D\u0430 \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u043A\u0443",
      recover: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435",
      restoreArchive: "\u0412\u0435\u0440\u043D\u0443\u0442\u044C \u0438\u0437 \u0430\u0440\u0445\u0438\u0432\u0430",
      archive: "\u0423\u0431\u0440\u0430\u0442\u044C \u0432 \u0430\u0440\u0445\u0438\u0432",
      dialogLabel: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0437\u0430\u0434\u0430\u0447\u0438",
      recoverDescription: "Altron \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442 \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0449\u0438\u0435 \u0441\u0435\u0430\u043D\u0441\u044B Hermes \u0438 \u0437\u0430\u043A\u0440\u043E\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0435\u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0449\u0438\u0439 \u0441\u0442\u0430\u0440\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A. \u0410\u043A\u0442\u0438\u0432\u043D\u043E\u0433\u043E \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F \u044D\u0442\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043D\u0435 \u043E\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0435\u0442. \u041D\u043E\u0432\u043E\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0435 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F; \u043F\u0440\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E\u0439 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0435 \u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u043A\u0430 \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F.",
      reviseDescription: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F, \u043F\u0440\u0435\u0436\u043D\u0438\u0439 \u043E\u0442\u0447\u0451\u0442 \u0438 \u0441\u043F\u0438\u0441\u043E\u043A \u0444\u0430\u0439\u043B\u043E\u0432 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F. \u041D\u043E\u0432\u0430\u044F \u043F\u043E\u043F\u044B\u0442\u043A\u0430 \u043E\u0441\u0442\u0430\u043D\u0435\u0442\u0441\u044F \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A\u043E\u043C \u0434\u043E \u043D\u043E\u0432\u043E\u0433\u043E \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u0437\u0430\u043F\u0443\u0441\u043A\u0430.",
      cancelDescription: "\u041F\u043B\u0430\u043D \u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F. \u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u044D\u0442\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0438 \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435 \u0431\u0443\u0434\u0435\u0442 \u043E\u0436\u0438\u0434\u0430\u0442\u044C\u0441\u044F.",
      whatToFix: "\u0427\u0442\u043E \u0438\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C",
      cancelReason: "\u041F\u0440\u0438\u0447\u0438\u043D\u0430 \u043E\u0442\u043C\u0435\u043D\u044B",
      confirmChange: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438",
      leaveUnchanged: "\u041E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0431\u0435\u0437 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439",
      recoveryActive: "Hermes \u0432\u0441\u0451 \u0435\u0449\u0451 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u0440\u0430\u0431\u043E\u0442\u0443. \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u043B\u0441\u044F.",
      recoveryDone: "\u0421\u0432\u0435\u0440\u043A\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u044F \u043D\u0435\u0442; \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0430\u043B\u044C\u043D\u0435\u0439\u0448\u0435\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435.",
      attemptHistory: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u043E\u043F\u044B\u0442\u043E\u043A",
      historyDescription: "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B \u043F\u0440\u0435\u0436\u043D\u0438\u0435 \u043F\u043B\u0430\u043D\u044B, \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F, \u043E\u0442\u0447\u0451\u0442\u044B \u0438 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u044B\u0435 \u0441\u0443\u043C\u043C\u044B. \u0424\u0430\u0439\u043B\u044B \u0432 \u0440\u0430\u0431\u043E\u0447\u0435\u0439 \u043F\u0430\u043F\u043A\u0435 \u043C\u043E\u0433\u0443\u0442 \u0431\u044B\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u044B \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0439 \u043F\u043E\u043F\u044B\u0442\u043A\u043E\u0439; \u044D\u0442\u043E \u043D\u0435 \u0441\u0438\u0441\u0442\u0435\u043C\u0430 \u0432\u0435\u0440\u0441\u0438\u0439 \u0444\u0430\u0439\u043B\u043E\u0432.",
      previousAttempt: (number) => `\u041F\u043E\u043F\u044B\u0442\u043A\u0430 ${number}`,
      acceptance: (value) => `\u041F\u0440\u0438\u0451\u043C\u043A\u0430: ${value}`
    },
    team: {
      roles: {
        altron: "Altron \u2014 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u043F\u043B\u0430\u043D",
        technical: "\u0422\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0440\u0430\u0431\u043E\u0442\u0430",
        business: "\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u0431\u0438\u0437\u043D\u0435\u0441",
        memory: "\u0420\u0435\u0448\u0435\u043D\u0438\u044F \u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044F",
        reviewer: "\u041E\u0442\u0434\u0435\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430"
      },
      states: {
        cancelled: "\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u0430 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C",
        interrupted: "\u0428\u0430\u0433 \u043F\u0440\u0435\u0440\u0432\u0430\u043D",
        blocked: "\u0428\u0430\u0433 \u043D\u0435 \u043D\u0430\u0447\u0430\u0442: \u0444\u0430\u0439\u043B\u044B \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0433\u043E \u0448\u0430\u0433\u0430 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B",
        ready: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u0437\u0430\u043F\u0443\u0441\u043A\u0430",
        running: "\u041A\u043E\u043C\u0430\u043D\u0434\u0430 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442",
        paused: "\u041D\u0430 \u043F\u0430\u0443\u0437\u0435",
        unknown: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E \u2014 \u043F\u043E\u0432\u0442\u043E\u0440 \u0437\u0430\u043F\u0440\u0435\u0449\u0451\u043D",
        failed: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E \u0441 \u043E\u0448\u0438\u0431\u043A\u043E\u0439",
        review: "\u0412\u0441\u0435 \u0448\u0430\u0433\u0438 \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u044B \u2014 \u043D\u0443\u0436\u043D\u0430 \u043F\u0440\u0438\u0451\u043C\u043A\u0430",
        done: "\u041F\u0440\u0438\u043D\u044F\u0442\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C",
        pending: "\u0415\u0449\u0451 \u043D\u0435 \u043D\u0430\u0447\u0430\u0442",
        prepared: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D",
        reported: "\u0424\u0430\u0439\u043B\u044B \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u044B, \u043E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435",
        complete: "\u0428\u0430\u0433 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D",
        cancel_requested: "\u0417\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u0430 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430"
      },
      noRoute: "\u041C\u043E\u0434\u0435\u043B\u044C \u0434\u043B\u044F \u0440\u043E\u043B\u0438 \u043D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0430",
      setup: "\u0421\u043E\u0441\u0442\u0430\u0432 \u043A\u043E\u043C\u0430\u043D\u0434\u044B",
      setupDescription: "\u0420\u043E\u043B\u0438 \u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430. \u041F\u0443\u0441\u0442\u044B\u0435 \u0440\u043E\u043B\u0438 \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u044E\u0442\u0441\u044F. \u0417\u0434\u0435\u0441\u044C \u043D\u0435\u0442 \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0449\u0438\u0445 \u043A\u0440\u0443\u0433\u043B\u043E\u0441\u0443\u0442\u043E\u0447\u043D\u043E \u043C\u043E\u0434\u0435\u043B\u0435\u0439. \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u0441\u043E\u0441\u0442\u0430\u0432\u0430 \u043D\u0435 \u043C\u0435\u043D\u044F\u0435\u0442 \u0443\u0436\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u043F\u043B\u0430\u043D\u044B.",
      assignAll: "\u041D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0432\u0441\u0435\u043C \u0440\u043E\u043B\u044F\u043C, \u043A\u0440\u043E\u043C\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0449\u0435\u0433\u043E",
      modelFor: (role) => `\u041C\u043E\u0434\u0435\u043B\u044C \u2014 ${role}`,
      providerFor: (role) => `\u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440 \u2014 ${role}`,
      instructionsFor: (role) => `\u0418\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u0438 \u2014 ${role}`,
      baseRole: "\u041E\u0441\u043D\u043E\u0432\u043D\u0430\u044F \u0440\u043E\u043B\u044C Altron",
      adaptedInstructions: "\u0412\u044B\u0431\u0440\u0430\u043D\u044B \u0430\u0434\u0430\u043F\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0438\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u0438 agency-agents. \u041E\u043D\u0438 \u043D\u0435 \u0434\u0430\u044E\u0442 \u043D\u043E\u0432\u044B\u0445 \u0434\u043E\u0441\u0442\u0443\u043F\u043E\u0432 \u0438 \u043D\u0435 \u0437\u0430\u043C\u0435\u043D\u044F\u044E\u0442 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u0438\u0435.",
      removeAssignment: (role) => `\u0423\u0431\u0440\u0430\u0442\u044C \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u2014 ${role}`,
      assignmentIncomplete: "\u0414\u043B\u044F \u043A\u0430\u0436\u0434\u043E\u0439 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u043E\u0439 \u0440\u043E\u043B\u0438 \u043D\u0443\u0436\u043D\u044B \u0438 \u043C\u043E\u0434\u0435\u043B\u044C, \u0438 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440.",
      save: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0441\u043E\u0441\u0442\u0430\u0432 \u043A\u043E\u043C\u0430\u043D\u0434\u044B",
      source: (commit) => `\u0418\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u0438 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u044B: ${commit}. \u041B\u0438\u0446\u0435\u043D\u0437\u0438\u044F MIT; \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438 \u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u2014 \u0432 THIRD_PARTY_NOTICES.md.`,
      sequence: "\u041F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0441\u0442\u043E\u0432",
      sequenceDescription: "\u041D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E: \u0440\u0430\u0437\u0431\u0435\u0439\u0442\u0435 \u043F\u043B\u0430\u043D \u043D\u0430 \u0448\u0430\u0433\u0438. Altron \u043F\u0435\u0440\u0435\u0434\u0430\u0441\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u043C\u0443 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044E \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0433\u043E. \u041F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0449\u0438\u0439 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E.",
      stepRole: (number) => `\u0420\u043E\u043B\u044C \u0448\u0430\u0433\u0430 ${number}`,
      stepResult: (number) => `\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0448\u0430\u0433\u0430 ${number}`,
      stepAcceptance: (number) => `\u041A\u0440\u0438\u0442\u0435\u0440\u0438\u0438 \u0448\u0430\u0433\u0430 ${number}`,
      removeStep: (number) => `\u0423\u0431\u0440\u0430\u0442\u044C \u0448\u0430\u0433 ${number}`,
      addStep: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0448\u0430\u0433",
      approvePlan: "\u0421\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u0442\u044C \u043A\u043E\u043C\u0430\u043D\u0434\u043D\u044B\u0439 \u043F\u043B\u0430\u043D",
      approvedTeam: (state) => `\u0421\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u0430\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u0430: ${state}`,
      criteria: (value) => `\u041A\u0440\u0438\u0442\u0435\u0440\u0438\u0438: ${value}`,
      separateReviewer: "\u041F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0449\u0438\u0439 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u043C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435\u043C. \u0418\u0442\u043E\u0433\u043E\u0432\u0443\u044E \u0440\u0430\u0431\u043E\u0442\u0443 \u043F\u0440\u0438\u043D\u0438\u043C\u0430\u0435\u0442 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C, \u0430 \u043D\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u0430.",
      start: "\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u0443\u044E \u043A\u043E\u043C\u0430\u043D\u0434\u0443",
      resume: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u043F\u043E\u0441\u043B\u0435 \u043F\u0430\u0443\u0437\u044B",
      pause: "\u041F\u0440\u0438\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043A\u043E\u043C\u0430\u043D\u0434\u0443 \u0438 \u0437\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0443",
      startDialog: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u043A\u043E\u043C\u0430\u043D\u0434\u044B",
      project: (name) => `\u041F\u0440\u043E\u0435\u043A\u0442: ${name}`,
      startDescription: "\u0411\u0443\u0434\u0443\u0442 \u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0435 \u0432\u044B\u0448\u0435 \u0448\u0430\u0433\u0438 \u043D\u0430 \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0445 \u043C\u043E\u0434\u0435\u043B\u044F\u0445. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u044B \u0440\u0430\u0441\u0445\u043E\u0434\u044B \u0432\u0430\u0448\u0435\u0433\u043E \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430. \u041F\u0440\u0438 \u043E\u0448\u0438\u0431\u043A\u0435 \u0438\u043B\u0438 \u0441\u043C\u0435\u043D\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044F \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F; \u0441\u043A\u0440\u044B\u0442\u044B\u0445 \u043F\u043E\u0432\u0442\u043E\u0440\u043E\u0432 \u043D\u0435\u0442.",
      confirmStart: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u0437\u0430\u043F\u0443\u0441\u043A \u043A\u043E\u043C\u0430\u043D\u0434\u044B",
      doNotStart: "\u041D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0442\u044C"
    },
    maintenance: {
      errors: {
        active_operations: "\u0415\u0441\u0442\u044C \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0449\u0438\u0435, \u043F\u0440\u0438\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u0435 \u0438\u043B\u0438 \u043D\u0435\u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0438. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u0438\u0445; \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043D\u0435 \u043D\u0430\u0447\u0430\u043B\u043E\u0441\u044C.",
        archive_checksum_mismatch: "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u0430\u044F \u0441\u0443\u043C\u043C\u0430 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u043B\u0430. \u0421\u043A\u0430\u0447\u0430\u0439\u0442\u0435 \u0430\u0440\u0445\u0438\u0432 \u0438 SHA256SUMS.txt \u0438\u0437 \u043E\u0434\u043D\u043E\u0433\u043E \u0432\u044B\u043F\u0443\u0441\u043A\u0430.",
        invalid_archive_path: "\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u043E\u0431\u044B\u0447\u043D\u044B\u0439 \u0444\u0430\u0439\u043B \u0430\u0440\u0445\u0438\u0432\u0430 \u043F\u043E \u043F\u043E\u043B\u043D\u043E\u043C\u0443 \u043F\u0443\u0442\u0438 \u043D\u0430 \u044D\u0442\u043E\u043C \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0435.",
        lock_exists: "\u041E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0434\u0440\u0443\u0433\u043E\u0439 \u0438\u043B\u0438 \u043F\u0440\u0435\u0440\u0432\u0430\u043D\u043D\u043E\u0439 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0435\u0439. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u0441\u043D\u044F\u0442\u0438\u044F \u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u043A\u0438 \u043D\u0435\u0442.",
        code_changed: "\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u044B \u043F\u043E\u0441\u043B\u0435 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F. \u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D, \u0432\u0430\u0448\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043D\u0435 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0438\u0441\u0430\u043D\u044B.",
        backup_invalid: "\u0420\u0435\u0437\u0435\u0440\u0432\u043D\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u043F\u043E\u0432\u0440\u0435\u0436\u0434\u0435\u043D\u0430. \u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D.",
        database_incompatible: "\u0424\u043E\u0440\u043C\u0430\u0442 \u0431\u0430\u0437\u044B \u043D\u0435\u0441\u043E\u0432\u043C\u0435\u0441\u0442\u0438\u043C \u0441 \u044D\u0442\u0438\u043C \u043A\u043E\u0434\u043E\u043C. \u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D \u0431\u0435\u0437 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0444\u0430\u0439\u043B\u043E\u0432. \u041F\u043E\u0441\u043B\u0435 \u043C\u0438\u0433\u0440\u0430\u0446\u0438\u0438 \u043D\u0443\u0436\u0435\u043D \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u0441\u043E\u0432\u043C\u0435\u0441\u0442\u0438\u043C\u044B\u0439 \u0432\u044B\u043F\u0443\u0441\u043A \u0438\u043B\u0438 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0435 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u043E\u043B\u043D\u043E\u0439 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u043E\u0439 \u043A\u043E\u043F\u0438\u0438.",
        recovery_required: "\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0430\u044F \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u043D\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430. \u041D\u043E\u0432\u044B\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u044F \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D\u044B \u0434\u043E \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F."
      },
      states: {
        idle: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0439 \u0435\u0449\u0451 \u043D\u0435 \u0431\u044B\u043B\u043E",
        staged: "\u041F\u0430\u043A\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D",
        applied: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E",
        rolled_back: "\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u0439 \u043A\u043E\u0434 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D",
        recovery_required: "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435"
      },
      restartNotice: "Altron: \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u0437\u0430\u043A\u0440\u043E\u0439\u0442\u0435 Hermes Desktop \u0438 \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0441\u043D\u043E\u0432\u0430. \u0414\u043E \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u043D\u043E\u0432\u044B\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u044F \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u044B.",
      genericError: "\u041F\u0430\u043A\u0435\u0442 \u0438\u043B\u0438 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u043D\u0435 \u043F\u0440\u043E\u0448\u043B\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443. \u0424\u0430\u0439\u043B\u044B \u043D\u0435 \u0441\u0447\u0438\u0442\u0430\u044E\u0442\u0441\u044F \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D\u043D\u044B\u043C\u0438. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0430\u0440\u0445\u0438\u0432 \u0432\u044B\u043F\u0443\u0441\u043A\u0430 \u0438 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u044F.",
      title: "\u041E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0435 Altron",
      description: "\u0421\u043A\u0430\u0447\u0430\u0439\u0442\u0435 \u0430\u0440\u0445\u0438\u0432 Altron \u0438 SHA256SUMS.txt \u0438\u0437 \u043E\u0434\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0433\u043E \u0432\u044B\u043F\u0443\u0441\u043A\u0430 GitHub. \u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043C\u0435\u043D\u044F\u0435\u0442 \u043A\u043E\u0434 Altron, \u043D\u043E \u043D\u0435 \u0432\u0430\u0448\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u044B, \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438. \u041A\u043E\u043F\u0438\u044F \u0431\u0430\u0437\u044B \u0438 \u0441\u0442\u0430\u0440\u043E\u0433\u043E \u043A\u043E\u0434\u0430 \u0441\u043E\u0437\u0434\u0430\u0451\u0442\u0441\u044F \u0434\u043E \u0437\u0430\u043C\u0435\u043D\u044B.",
      scopeDescription: "\u041E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u0441\u0435\u0440\u0432\u0435\u0440 Hermes. \u0414\u043B\u044F \u043E\u0431\u044B\u0447\u043D\u043E\u0439 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u044D\u0442\u043E \u0432\u0430\u0448 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440. \u041A\u043E\u0434 \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430 \u043E\u0431\u0449\u0438\u0439 \u0434\u043B\u044F \u0435\u0433\u043E \u043F\u0440\u043E\u0444\u0438\u043B\u0435\u0439. \u041F\u0435\u0440\u0435\u0434 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435\u043C \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u0440\u0430\u0431\u043E\u0442\u0443 \u0432\u043E \u0432\u0441\u0435\u0445 \u043E\u043A\u043D\u0430\u0445 Altron.",
      stateUnknown: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E",
      unavailable: "\u041E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0432 \u044D\u0442\u043E\u043C \u043F\u0440\u043E\u0444\u0438\u043B\u0435. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0443 \u043F\u0430\u043A\u0435\u0442\u0430 Altron.",
      restartRequired: "\u041F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u0437\u0430\u043A\u0440\u043E\u0439\u0442\u0435 Hermes Desktop \u0438 \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0441\u043D\u043E\u0432\u0430. \u041D\u043E\u0432\u044B\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u044F \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u044B \u0434\u043E \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u043A\u0430.",
      archivePath: "\u041F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A \u0430\u0440\u0445\u0438\u0432\u0443 Altron",
      checksum: "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u0430\u044F \u0441\u0443\u043C\u043C\u0430 SHA-256",
      verifyPackage: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u0430\u043A\u0435\u0442",
      packageVerified: (version) => `\u041F\u0440\u043E\u0432\u0435\u0440\u0435\u043D \u043F\u0430\u043A\u0435\u0442 ${version}`,
      codeFiles: (count) => `${count} \u0444\u0430\u0439\u043B\u043E\u0432 \u043A\u043E\u0434\u0430. \u0414\u043E \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u043E\u043D\u0438 \u043D\u0435 \u0437\u0430\u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F.`,
      install: "\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u043F\u0430\u043A\u0435\u0442",
      rollback: "\u0412\u0435\u0440\u043D\u0443\u0442\u044C \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u0439 \u043A\u043E\u0434",
      confirmDialog: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u044F",
      installQuestion: "\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u043F\u0430\u043A\u0435\u0442? \u041F\u043E\u0441\u043B\u0435 \u0437\u0430\u043C\u0435\u043D\u044B \u043F\u043E\u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u043A Hermes Desktop.",
      rollbackQuestion: "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u0439 \u043A\u043E\u0434? \u0422\u0435\u043A\u0443\u0449\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u044B \u0438 \u0431\u0430\u0437\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F. \u041F\u043E\u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u043A Hermes Desktop.",
      confirm: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u043E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0435",
      cancel: "\u041E\u0442\u043C\u0435\u043D\u0430"
    },
    bootstrap: {
      pendingTitle: "\u0421\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u043F\u043B\u0430\u043D\u044B, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u0435\u0449\u0451 \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u043B\u0438\u0441\u044C",
      pendingDescription: "\u0412 \u0441\u0442\u0430\u0440\u043E\u0439 \u0432\u0435\u0440\u0441\u0438\u0438 \u043E\u043D\u0438 \u043C\u043E\u0433\u0443\u0442 \u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435. \u041C\u043E\u0436\u043D\u043E \u044F\u0432\u043D\u043E \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043F\u043B\u0430\u043D: \u0435\u0433\u043E \u0442\u0435\u043A\u0441\u0442 \u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F. \u042D\u0442\u043E \u043D\u0435 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430 \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0449\u0435\u0433\u043E \u0437\u0430\u0434\u0430\u043D\u0438\u044F \u0438 \u043D\u0435 \u043E\u0431\u0445\u043E\u0434 \u0437\u0430\u0449\u0438\u0442\u044B.",
      pendingError: "\u0421\u043F\u0438\u0441\u043E\u043A \u043F\u043B\u0430\u043D\u043E\u0432 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D. \u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043D\u0435 \u0440\u0430\u0437\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E.",
      noPending: "\u041D\u0435\u0437\u0430\u043F\u0443\u0449\u0435\u043D\u043D\u044B\u0445 \u043A\u043E\u043C\u0430\u043D\u0434\u043D\u044B\u0445 \u043F\u043B\u0430\u043D\u043E\u0432 \u043D\u0435\u0442.",
      cancelPlan: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u044D\u0442\u043E\u0442 \u043D\u0435\u0437\u0430\u043F\u0443\u0449\u0435\u043D\u043D\u044B\u0439 \u043F\u043B\u0430\u043D",
      cancelDialog: "\u041E\u0442\u043C\u0435\u043D\u0430 \u0441\u0442\u0430\u0440\u043E\u0433\u043E \u043F\u043B\u0430\u043D\u0430",
      planSummary: (profile, project, task) => `\u041F\u0440\u043E\u0444\u0438\u043B\u044C: ${profile}. \u041F\u0440\u043E\u0435\u043A\u0442: ${project}. \u0417\u0430\u0434\u0430\u0447\u0430: ${task}. \u041D\u043E\u0432\u043E\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0435 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F.`,
      cancelReason: "\u041F\u0440\u0438\u0447\u0438\u043D\u0430 \u043E\u0442\u043C\u0435\u043D\u044B \u0441\u0442\u0430\u0440\u043E\u0433\u043E \u043F\u043B\u0430\u043D\u0430",
      cancelFailed: "\u041E\u0442\u043C\u0435\u043D\u0430 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430. \u0415\u0441\u043B\u0438 \u043F\u043B\u0430\u043D \u0443\u0436\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u043B\u0441\u044F, \u044D\u0442\u0430 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D\u0430; \u043D\u0435 \u0443\u0434\u0430\u043B\u044F\u0439\u0442\u0435 \u0435\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0438 \u0432\u0440\u0443\u0447\u043D\u0443\u044E.",
      confirmCancel: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u043E\u0442\u043C\u0435\u043D\u0443 \u0441\u0442\u0430\u0440\u043E\u0433\u043E \u043F\u043B\u0430\u043D\u0430",
      keepPlan: "\u041E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0441\u0442\u0430\u0440\u044B\u0439 \u043F\u043B\u0430\u043D",
      title: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0433\u043E Altron",
      description: "\u042D\u0442\u0430 \u043F\u0430\u043D\u0435\u043B\u044C \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u0439 Altron \u043D\u0430 \u043D\u043E\u0432\u0443\u044E \u0432\u0435\u0440\u0441\u0438\u044E \u0431\u0435\u0437 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0433\u043E \u0438\u043C\u043F\u043E\u0440\u0442\u0430 \u0435\u0433\u043E \u043F\u0440\u043E\u0444\u0438\u043B\u044F. \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F, \u043F\u0440\u043E\u0435\u043A\u0442\u044B \u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u043D\u0435 \u0437\u0430\u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F. \u0418\u0418 \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F.",
      safety: "\u041F\u0435\u0440\u0435\u0434 \u043E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0435\u043C \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u044F \u0438 \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u0437\u0430\u043A\u0440\u043E\u0439\u0442\u0435 \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0435 \u043E\u043A\u043D\u0430 Hermes. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u043E\u0444\u0438\u043B\u044C altron-maintenance. \u0418\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441 Altron \u043E\u0431\u0449\u0438\u0439 \u0434\u043B\u044F \u043F\u0440\u043E\u0444\u0438\u043B\u0435\u0439 \u044D\u0442\u043E\u0433\u043E \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0430.",
      targetError: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u044F altron-maintenance. \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043E\u043A.",
      target: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0434\u043B\u044F \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F",
      chooseTarget: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044C",
      noTarget: "\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 Altron \u0441 \u0431\u0430\u0437\u043E\u0439 \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432. \u0414\u043B\u044F \u043D\u043E\u0432\u043E\u0439 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u0443\u0439\u0442\u0435 \u043E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u043F\u0430\u043A\u0435\u0442 Altron.",
      windowsClosed: "\u042F \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u0437\u0430\u043A\u0440\u044B\u043B \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0435 \u043E\u043A\u043D\u0430 Hermes"
    },
    mission: {
      statuses: {
        prepared: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043E",
        creating: "\u0421\u043E\u0437\u0434\u0430\u0451\u0442\u0441\u044F \u0441\u0435\u0441\u0441\u0438\u044F",
        bound: "\u0421\u0435\u0441\u0441\u0438\u044F \u0441\u0432\u044F\u0437\u0430\u043D\u0430",
        running: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435",
        waiting: "\u0416\u0434\u0451\u043C \u043E\u0442\u0432\u0435\u0442\u0430",
        awaiting_approval: "\u0416\u0434\u0451\u0442 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F",
        queued: "\u0412 \u043E\u0447\u0435\u0440\u0435\u0434\u0438",
        ready: "\u0413\u043E\u0442\u043E\u0432\u043E \u043F\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430\u043C",
        blocked: "\u0417\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E",
        unknown: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E",
        cancel_requested: "\u0417\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u0430 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430",
        cancelled: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E"
      },
      phases: { interview: "\u0418\u043D\u0442\u0435\u0440\u0432\u044C\u044E", work: "\u0420\u0430\u0431\u043E\u0442\u0430" },
      sessionInterview: "Altron \u2014 \u0438\u043D\u0442\u0435\u0440\u0432\u044C\u044E",
      sessionWork: "Altron \u2014 \u0440\u0430\u0431\u043E\u0442\u0430",
      errors: {
        scope_changed: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0438\u043B\u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0441\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C. \u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0430; \u0434\u0440\u0443\u0433\u043E\u0439 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u0451\u043D.",
        model_mismatch: "Hermes \u0432\u0435\u0440\u043D\u0443\u043B \u0434\u0440\u0443\u0433\u0443\u044E \u043C\u043E\u0434\u0435\u043B\u044C \u0438\u043B\u0438 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430. \u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D\u0430.",
        profile_mismatch: "Hermes \u0432\u0435\u0440\u043D\u0443\u043B \u0434\u0440\u0443\u0433\u043E\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C. \u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D\u0430.",
        session_identity_missing: "Hermes \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B \u043E\u0431\u0435 \u0438\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u043E\u0441\u0442\u0438 \u0441\u0435\u0441\u0441\u0438\u0438. \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0439 \u043F\u0440\u0438\u0432\u044F\u0437\u043A\u0438 \u043D\u0435\u0442.",
        mission_already_starting: "\u042D\u0442\u0430 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u0443\u0436\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F. \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0439 \u043A\u043B\u0438\u043A \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u043B \u0435\u0451 \u0441\u043D\u043E\u0432\u0430.",
        directory_required: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0430\u043F\u043A\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u043F\u0435\u0440\u0435\u0434 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435\u043C.",
        directory_must_be_absolute: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A \u043F\u0430\u043F\u043A\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u0430 \u043D\u0435 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439.",
        project_overlap: "\u042D\u0442\u0430 \u043F\u0430\u043F\u043A\u0430 \u0443\u0436\u0435 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043A \u0434\u0440\u0443\u0433\u043E\u043C\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0443. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0443\u044E \u043F\u0430\u043F\u043A\u0443.",
        invalid_limits: "\u041B\u0438\u043C\u0438\u0442\u044B: \u043E\u0442 1 \u0434\u043E 200 \u0440\u0430\u0431\u043E\u0447\u0438\u0445 \u0445\u043E\u0434\u043E\u0432 \u0438 \u043E\u0442 1 \u0434\u043E 168 \u0447\u0430\u0441\u043E\u0432.",
        permission_pending: "Hermes \u043E\u0436\u0438\u0434\u0430\u0435\u0442 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u044F \u043D\u0430 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0443\u044E \u043A\u043E\u043C\u0430\u043D\u0434\u0443. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0441\u0435\u0430\u043D\u0441 Hermes \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0437\u0430\u043F\u0440\u043E\u0441. Altron \u043D\u0435 \u043E\u0431\u0445\u043E\u0434\u0438\u0442 \u0437\u0430\u0449\u0438\u0442\u0443.",
        permission_required: "Hermes \u043D\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0438\u043B \u043A\u043E\u043C\u0430\u043D\u0434\u0443 \u0438\u043B\u0438 \u043D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B \u043E\u0442\u0432\u0435\u0442. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u044B \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u044B; \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u044F \u043F\u0435\u0440\u0435\u0434 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435\u043C.",
        run_still_active: "\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u0435\u0449\u0451 \u0430\u043A\u0442\u0438\u0432\u043D\u043E. \u0421\u043B\u0435\u043F\u043E\u0439 \u043F\u043E\u0432\u0442\u043E\u0440 \u0437\u0430\u043F\u0440\u0435\u0449\u0451\u043D.",
        time_limit: "\u0412\u0440\u0435\u043C\u0435\u043D\u043D\u043E\u0439 \u043B\u0438\u043C\u0438\u0442 \u0438\u0441\u0447\u0435\u0440\u043F\u0430\u043D.",
        turn_limit: "\u041B\u0438\u043C\u0438\u0442 \u0440\u0430\u0431\u043E\u0447\u0438\u0445 \u0445\u043E\u0434\u043E\u0432 \u0438\u0441\u0447\u0435\u0440\u043F\u0430\u043D."
      },
      genericError: "\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043C\u0438\u0441\u0441\u0438\u0438 \u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 Hermes.",
      empty: "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445.",
      myMissions: "\u041C\u043E\u0438 \u043C\u0438\u0441\u0441\u0438\u0438",
      queryError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u043C\u0438\u0441\u0441\u0438\u0438. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435; \u043D\u043E\u0432\u044B\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u043B\u0438\u0441\u044C.",
      turnsLimit: "\u0420\u0430\u0431\u043E\u0447\u0438\u0435 \u0445\u043E\u0434\u044B (1\u2013200)",
      hoursLimit: "\u0427\u0430\u0441\u044B (1\u2013168)",
      interview: "\u0418\u043D\u0442\u0435\u0440\u0432\u044C\u044E",
      interviewDescription: "\u0412\u043E\u043F\u0440\u043E\u0441\u044B \u0438 \u043E\u0442\u0432\u0435\u0442\u044B \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F \u0432 \u043C\u0438\u0441\u0441\u0438\u0438. \u0422\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0435 \u0437\u0430\u0440\u0430\u043D\u0435\u0435 \u043F\u0438\u0441\u0430\u0442\u044C \u043D\u0435 \u043D\u0443\u0436\u043D\u043E.",
      altronQuestion: "\u0412\u043E\u043F\u0440\u043E\u0441 Altron",
      yourAnswer: "\u0412\u0430\u0448 \u043E\u0442\u0432\u0435\u0442",
      reviseProposal: "\u0418\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0438\u043B\u0438 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435",
      answerQuestion: "\u041E\u0442\u0432\u0435\u0442 \u043D\u0430 \u0432\u043E\u043F\u0440\u043E\u0441",
      answerPlaceholder: "\u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0432\u0430\u0436\u043D\u044B\u0439 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u2026",
      saveAnswer: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442",
      proposalDescription: "\u041F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u043C\u043E\u0436\u043D\u043E \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442\u043E\u043C \u0432\u044B\u0448\u0435. \u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043D\u0438\u0436\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442 \u043F\u0440\u043E\u0435\u043A\u0442. \u041E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0435 \u0437\u0430\u043F\u0440\u043E\u0441\u044B \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0441\u0442\u0438 Hermes \u043C\u043E\u0433\u0443\u0442 \u043F\u043E\u0442\u0440\u0435\u0431\u043E\u0432\u0430\u0442\u044C \u0432\u0430\u0448\u0435\u0433\u043E \u0440\u0435\u0448\u0435\u043D\u0438\u044F.",
      goal: "\u0426\u0435\u043B\u044C",
      requirements: "\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F",
      outOfScope: "\u0417\u0430 \u043F\u0440\u0435\u0434\u0435\u043B\u0430\u043C\u0438 \u0437\u0430\u0434\u0430\u0447\u0438",
      plan: "\u041F\u043B\u0430\u043D",
      deliverables: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B",
      checks: "\u041A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438",
      connection: (model, provider) => `\u041C\u043E\u0434\u0435\u043B\u044C: ${model} \xB7 \u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440: ${provider}`,
      projectFolder: "\u041F\u0430\u043F\u043A\u0430 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u2014 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u044F\u0432\u043D\u043E",
      folderPlaceholder: "\u041F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0439 \u043F\u0430\u043F\u043A\u0435",
      limitsDescription: "\u042D\u0442\u043E \u043B\u0438\u043C\u0438\u0442\u044B \u0440\u0430\u0431\u043E\u0447\u0438\u0445 \u0445\u043E\u0434\u043E\u0432 \u0438 \u0432\u0440\u0435\u043C\u0435\u043D\u0438, \u0430 \u043D\u0435 \u0447\u0438\u0441\u043B\u043E \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u0432\u044B\u0437\u043E\u0432\u043E\u0432 \u043C\u043E\u0434\u0435\u043B\u0438 \u0438 \u043D\u0435 \u0434\u0435\u043D\u0435\u0436\u043D\u044B\u0439 \u043B\u0438\u043C\u0438\u0442.",
      approve: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0438 \u043D\u0430\u0447\u0430\u0442\u044C",
      fileContentCheck: (path) => `\u0424\u0430\u0439\u043B ${path}: \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442\u0441\u044F \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435`,
      fileExistenceCheck: (path) => `\u0424\u0430\u0439\u043B ${path}: \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442\u0441\u044F \u043D\u0430\u043B\u0438\u0447\u0438\u0435`,
      commandCheck: (command) => `\u041A\u043E\u043C\u0430\u043D\u0434\u0430: ${command}`,
      runs: "\u0425\u043E\u0434\u044B \u0438 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435",
      checkpoint: "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u0430\u044F \u0442\u043E\u0447\u043A\u0430",
      turn: (number) => `\u0425\u043E\u0434 ${number}`,
      created: (value) => `\u0421\u043E\u0437\u0434\u0430\u043D: ${value}`,
      terminal: (status, settled) => `\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435: ${status}; settled: ${settled}`,
      openHistory: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u044E Hermes",
      stopRequested: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430 \u0437\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u0430. \u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E\u0439 \u043E\u0442\u043C\u0435\u043D\u043E\u0439 \u043E\u043D\u0430 \u0441\u0442\u0430\u043D\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0441\u043B\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u0444\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438.",
      stateUnknown: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E. \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438; \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043D\u0443\u0436\u043D\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0438 \u044F\u0432\u043D\u043E\u0435 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435.",
      blocked: "\u0411\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u043A\u0430: ",
      reasonMissing: "\u043F\u0440\u0438\u0447\u0438\u043D\u0430 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u0430",
      stop: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435",
      resume: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u0443\u044E \u043C\u0438\u0441\u0441\u0438\u044E",
      recover: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C",
      result: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442",
      resultReady: "\u0413\u043E\u0442\u043E\u0432\u043E \u043F\u043E \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u043C \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430\u043C. \u042D\u0442\u043E \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442, \u0447\u0442\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u0443\u0436\u0435 \u043F\u0440\u0438\u043D\u044F\u043B \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442.",
      resultNotReady: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0435\u0449\u0451 \u043D\u0435 \u043F\u0440\u043E\u0448\u0451\u043B \u0432\u0441\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438.",
      files: "\u0424\u0430\u0439\u043B\u044B",
      verifications: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0438",
      passed: "\u041F\u0440\u043E\u0439\u0434\u0435\u043D\u0430",
      failed: "\u041D\u0435 \u043F\u0440\u043E\u0439\u0434\u0435\u043D\u0430",
      fileCheck: "\u0424\u0430\u0439\u043B\u043E\u0432\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430",
      commandVerification: "\u041A\u043E\u043C\u0430\u043D\u0434\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430",
      source: (value) => `\u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A: ${value}`,
      instructions: "\u0418\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F",
      showFolder: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u0430\u043F\u043A\u0443 \u0432 \u041F\u0440\u043E\u0432\u043E\u0434\u043D\u0438\u043A\u0435",
      optionalRevision: "\u041D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0440\u0435\u0432\u0438\u0437\u0438\u044F",
      revisionPlaceholder: "\u041E\u043F\u0438\u0448\u0438\u0442\u0435, \u0447\u0442\u043E \u043D\u0443\u0436\u043D\u043E \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C\u2026",
      revisionLimits: (turns, hours) => `\u041D\u043E\u0432\u0430\u044F \u0440\u0435\u0432\u0438\u0437\u0438\u044F \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u0442\u043E\u0442 \u0436\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442 \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438. \u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u043C\u044B\u0435 \u043B\u0438\u043C\u0438\u0442\u044B: ${turns} \u0445\u043E\u0434\u043E\u0432 \u0438 ${hours} \u0447\u0430\u0441\u043E\u0432.`,
      confirmRevision: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0440\u0435\u0432\u0438\u0437\u0438\u044E",
      stopTitle: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043C\u0438\u0441\u0441\u0438\u044E?",
      recoverTitle: "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043C\u0438\u0441\u0441\u0438\u044E?",
      reviseTitle: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0440\u0435\u0432\u0438\u0437\u0438\u044E?",
      stopDescription: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430 \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0435\u0442\u0441\u044F, \u0430 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E\u0439 \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 Hermes.",
      recoverDescription: "\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u0431\u0443\u0434\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E \u043F\u0435\u0440\u0432\u044B\u043C. \u0421\u043B\u0435\u043F\u043E\u0433\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u0430 \u043D\u0435 \u0431\u0443\u0434\u0435\u0442.",
      reviseDescription: (turns, hours) => `\u0421\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F. \u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u0434\u043E ${turns} \u0440\u0430\u0431\u043E\u0447\u0438\u0445 \u0445\u043E\u0434\u043E\u0432 \u0438 ${hours} \u0447\u0430\u0441\u043E\u0432 \u043D\u0430 \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u043A\u0443?`,
      stopLabel: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C",
      recoverLabel: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C",
      reviseLabel: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0440\u0435\u0432\u0438\u0437\u0438\u044E",
      flow: "\u0418\u041D\u0422\u0415\u0420\u0412\u042C\u042E \u2192 \u0420\u0410\u0411\u041E\u0422\u0410 \u2192 \u0420\u0415\u0417\u0423\u041B\u042C\u0422\u0410\u0422",
      startTitle: "\u041D\u0430\u0447\u043D\u0451\u043C \u0441 \u0432\u0430\u0448\u0435\u0439 \u0438\u0434\u0435\u0438",
      startDescription: "\u0412\u0430\u043C \u043D\u0435 \u043D\u0443\u0436\u043D\u043E \u0437\u0430\u0440\u0430\u043D\u0435\u0435 \u043F\u0438\u0441\u0430\u0442\u044C \u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0435. Altron \u0437\u0430\u0434\u0430\u0441\u0442 \u0432\u043E\u043F\u0440\u043E\u0441\u044B, \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0438\u0442 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0439 \u043F\u043B\u0430\u043D \u0438 \u043F\u043E\u043F\u0440\u043E\u0441\u0438\u0442 \u043E\u0434\u043D\u043E \u0444\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043F\u0435\u0440\u0435\u0434 \u0440\u0430\u0431\u043E\u0442\u043E\u0439.",
      desiredResult: "\u0427\u0442\u043E \u0432\u044B \u0445\u043E\u0442\u0438\u0442\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C?",
      desiredPlaceholder: "\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u0443 \u0438\u043B\u0438 \u0436\u0435\u043B\u0430\u0435\u043C\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0441\u0432\u043E\u0438\u043C\u0438 \u0441\u043B\u043E\u0432\u0430\u043C\u0438\u2026",
      reportExampleText: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u044C\u0442\u0435 \u043A\u0440\u0430\u0442\u043A\u0438\u0439 \u043E\u0442\u0447\u0451\u0442 \u043E \u0442\u0435\u043A\u0443\u0449\u0435\u043C \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435 \u0434\u043B\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u044B.",
      pageExampleText: "\u0421\u0434\u0435\u043B\u0430\u0439\u0442\u0435 \u043D\u0435\u0431\u043E\u043B\u044C\u0448\u0443\u044E \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 \u0441 \u0438\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u0435\u0439 \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430\u043C\u0438 \u0434\u043B\u044F \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u0439.",
      reportExample: "\u041F\u0440\u0438\u043C\u0435\u0440 \u043E\u0442\u0447\u0451\u0442\u0430",
      pageExample: "\u041F\u0440\u0438\u043C\u0435\u0440 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B",
      examplesDescription: "\u041F\u0440\u0438\u043C\u0435\u0440\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u043F\u043E\u043B\u043D\u044F\u044E\u0442 \u043F\u043E\u043B\u0435. \u0418\u043D\u0442\u0435\u0440\u0432\u044C\u044E \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0418\u0418 \u0438 \u043C\u043E\u0436\u0435\u0442 \u0440\u0430\u0441\u0445\u043E\u0434\u043E\u0432\u0430\u0442\u044C \u0435\u0433\u043E \u043B\u0438\u043C\u0438\u0442; \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u043D\u0430\u0447\u043D\u0451\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0441\u043B\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u043F\u043B\u0430\u043D\u0430.",
      savingInterview: "\u0421\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u043C \u0438\u043D\u0442\u0435\u0440\u0432\u044C\u044E\u2026",
      startInterview: "\u041D\u0430\u0447\u0430\u0442\u044C \u0438\u043D\u0442\u0435\u0440\u0432\u044C\u044E",
      autonomousMission: "\u0410\u0432\u0442\u043E\u043D\u043E\u043C\u043D\u0430\u044F \u043C\u0438\u0441\u0441\u0438\u044F",
      newInterview: "\u041D\u043E\u0432\u043E\u0435 \u0438\u043D\u0442\u0435\u0440\u0432\u044C\u044E",
      work: "\u0420\u0430\u0431\u043E\u0442\u0430",
      closeDescription: "\u041C\u043E\u0436\u043D\u043E \u0437\u0430\u043A\u0440\u044B\u0442\u044C \u0432\u043A\u043B\u0430\u0434\u043A\u0443 Altron \u2014 \u0440\u0430\u0431\u043E\u0442\u0430 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u0441\u044F, \u043F\u043E\u043A\u0430 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 Hermes Desktop. \u041F\u043E\u043B\u043D\u043E\u0435 \u0437\u0430\u043A\u0440\u044B\u0442\u0438\u0435 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u044B \u0438\u043B\u0438 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0430 \u043F\u043E\u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0433\u043E \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F.",
      artifactSize: (bytes) => `${bytes} \u0431\u0430\u0439\u0442`
    },
    view: {
      statuses: {
        cancelled: "\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C",
        team_waiting: "\u041F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u043C\u0435\u0436\u0434\u0443 \u0448\u0430\u0433\u0430\u043C\u0438 \u043A\u043E\u043C\u0430\u043D\u0434\u044B",
        interrupted: "\u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E",
        draft: "\u041D\u0443\u0436\u0435\u043D \u043F\u043B\u0430\u043D",
        approved: "\u041F\u043B\u0430\u043D \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D",
        launching: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u0437\u0430\u043F\u0443\u0441\u043A\u0430",
        planning: "Altron \u0441\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 \u043F\u043B\u0430\u043D",
        running: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435",
        reviewing: "\u0418\u0434\u0451\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430",
        review: "\u041D\u0443\u0436\u043D\u0430 \u043F\u0440\u0438\u0451\u043C\u043A\u0430",
        done: "\u041F\u0440\u0438\u043D\u044F\u0442\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C",
        failed: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E \u0441 \u043E\u0448\u0438\u0431\u043A\u043E\u0439",
        unknown: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E",
        cancel_requested: "\u0417\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u0430 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430",
        reported: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u0435\u0440\u0435\u0434\u0430\u043D",
        prepared: "\u0417\u0430\u043F\u0443\u0441\u043A \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D"
      },
      roles: {
        technical: "\u0422\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0440\u0430\u0431\u043E\u0442\u0430",
        business: "\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u0431\u0438\u0437\u043D\u0435\u0441",
        memory: "\u0420\u0435\u0448\u0435\u043D\u0438\u044F \u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044F",
        altron: "Altron \u2014 \u0441\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043F\u043B\u0430\u043D",
        reviewer: "\u041E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0449\u0438\u0439"
      },
      errors: {
        runtime_state_changed: "\u0412\u043E \u0432\u0440\u0435\u043C\u044F \u0441\u0432\u0435\u0440\u043A\u0438 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u043E\u0441\u044C. \u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u043A\u0430\u043B\u043E\u0441\u044C; \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u043D\u043E\u0432\u0430.",
        runtime_unavailable: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C\u0441\u044F \u043A \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0435 \u0438\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0439 Hermes. \u0411\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430; \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 Hermes \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F, \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A \u0437\u0430\u0434\u0430\u043D\u0438\u044F.",
        runtime_scope_mismatch: "\u0417\u0430\u043F\u0443\u0441\u043A \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043A \u0434\u0440\u0443\u0433\u043E\u0439 \u043F\u0430\u043F\u043A\u0435 \u0438\u043B\u0438 \u043F\u0440\u043E\u0444\u0438\u043B\u044E. \u041E\u043D \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u0451\u043D.",
        runtime_state_unconfirmed: "Hermes \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u043B \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435. \u0411\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430.",
        run_budget_exhausted: "\u0418\u0441\u0447\u0435\u0440\u043F\u0430\u043D \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u044B\u0439 \u043B\u0438\u043C\u0438\u0442 \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u0432 \u043F\u0440\u043E\u0435\u043A\u0442\u0430. \u0418\u0437\u043C\u0435\u043D\u0438\u0442\u0435 \u0435\u0433\u043E \u044F\u0432\u043D\u043E \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0439.",
        task_archived: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u0435\u0440\u043D\u0438\u0442\u0435 \u0437\u0430\u0434\u0430\u0447\u0443 \u0438\u0437 \u0430\u0440\u0445\u0438\u0432\u0430.",
        scope_changed: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0438\u043B\u0438 \u043F\u0440\u043E\u0435\u043A\u0442 \u0441\u043C\u0435\u043D\u0438\u043B\u0441\u044F. \u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E.",
        model_mismatch: "Hermes \u0432\u0435\u0440\u043D\u0443\u043B \u0434\u0440\u0443\u0433\u0443\u044E \u043C\u043E\u0434\u0435\u043B\u044C \u0438\u043B\u0438 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430. \u0417\u0430\u0434\u0430\u043D\u0438\u0435 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E.",
        model_and_provider_required: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u043E\u0434\u0435\u043B\u044C \u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u0435\u0451 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430.",
        project_overlap: "\u042D\u0442\u0430 \u043F\u0430\u043F\u043A\u0430 \u0443\u0436\u0435 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043A \u0434\u0440\u0443\u0433\u043E\u043C\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0443. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0443\u044E \u043F\u0430\u043F\u043A\u0443.",
        directory_not_found: "\u041F\u0430\u043F\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430. \u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0435\u0451 \u0432 \u041F\u0440\u043E\u0432\u043E\u0434\u043D\u0438\u043A\u0435 \u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C.",
        directory_must_be_absolute: "\u041D\u0443\u0436\u0435\u043D \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0439 \u043F\u0430\u043F\u043A\u0435.",
        directory_too_broad: "\u041D\u0443\u0436\u043D\u0430 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0430\u044F \u043F\u0430\u043F\u043A\u0430 \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u043D\u0435 \u0432\u0435\u0441\u044C \u0434\u0438\u0441\u043A \u0438\u043B\u0438 \u043F\u0440\u043E\u0444\u0438\u043B\u044C Hermes.",
        artifact_changed: "\u0424\u0430\u0439\u043B \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430. \u041F\u0440\u0438\u0451\u043C\u043A\u0430 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u0430.",
        artifact_unavailable: "\u041E\u0434\u0438\u043D \u0438\u0437 \u0444\u0430\u0439\u043B\u043E\u0432 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u041F\u0440\u0438\u0451\u043C\u043A\u0430 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u0430.",
        run_state_unconfirmed: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430. \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0439 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u043D\u0435\u0442.",
        run_already_starting: "\u042D\u0442\u043E\u0442 \u0437\u0430\u043F\u0443\u0441\u043A \u0443\u0436\u0435 \u043E\u0431\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u0435\u0442\u0441\u044F."
      },
      genericError: "\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 Hermes; \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u0430 \u043D\u0435\u0442.",
      trackingError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438\u0442\u043E\u0433 \u0437\u0430\u043F\u0443\u0441\u043A\u0430 Altron. \u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E; \u043F\u043E\u0432\u0442\u043E\u0440 \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u043B\u0441\u044F.",
      readinessCriteria: "\u041A\u0440\u0438\u0442\u0435\u0440\u0438\u0438 \u0433\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u0438",
      archivedTask: "\u0417\u0430\u0434\u0430\u0447\u0430 \u0432 \u0430\u0440\u0445\u0438\u0432\u0435. \u0412\u0435\u0440\u043D\u0438\u0442\u0435 \u0435\u0451, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C.",
      nextDraft: "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433: \u0441\u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u043B\u0430\u043D \u0441\u0430\u043C\u0438 \u0438\u043B\u0438 \u043F\u043E\u043F\u0440\u043E\u0441\u0438\u0442\u0435 Altron. \u0414\u043E \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u0438\u044F \u0440\u0430\u0431\u043E\u0442\u0430 \u043D\u0435 \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F.",
      nextApproved: "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433: \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0437\u0430\u043F\u0443\u0441\u043A. \u041B\u0438\u0431\u043E \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u0435 \u043F\u043B\u0430\u043D.",
      nextReview: "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433: \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0444\u0430\u0439\u043B\u044B, \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043A\u0440\u0438\u0442\u0435\u0440\u0438\u0438 \u0438 \u043F\u0440\u0438\u043C\u0438\u0442\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0438\u043B\u0438 \u0432\u0435\u0440\u043D\u0438\u0442\u0435 \u043D\u0430 \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u043A\u0443.",
      nextStopped: "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433: \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 Hermes. \u041F\u043E\u0441\u043B\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E\u0439 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u043C\u043E\u0436\u043D\u043E \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u044D\u0442\u0443 \u0436\u0435 \u0437\u0430\u0434\u0430\u0447\u0443.",
      planForApproval: "\u041F\u043B\u0430\u043D \u0434\u043B\u044F \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u0438\u044F",
      askPlan: "\u041F\u043E\u043F\u0440\u043E\u0441\u0438\u0442\u044C Altron \u0441\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043F\u043B\u0430\u043D",
      approvePlan: "\u0421\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u0442\u044C \u043F\u043B\u0430\u043D",
      approvedPlan: "\u0421\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u043F\u043B\u0430\u043D",
      noApprovedPlan: "\u041F\u043B\u0430\u043D \u0435\u0449\u0451 \u043D\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D.",
      assignee: "\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C",
      startWorker: "\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F",
      launchDialog: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430",
      launch: (role) => `\u0417\u0430\u043F\u0443\u0441\u043A: ${role}`,
      launchSummary: (project, directory, model, provider) => `\u041F\u0440\u043E\u0435\u043A\u0442: ${project}
\u041F\u0430\u043F\u043A\u0430: ${directory}
\u041C\u043E\u0434\u0435\u043B\u044C: ${model}
\u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440: ${provider}`,
      launchDescription: "\u042D\u0442\u043E \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A \u0432 \u0432\u0430\u0448\u0435\u043C Hermes. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u044B \u0440\u0430\u0441\u0445\u043E\u0434\u044B \u0432\u0430\u0448\u0435\u0433\u043E \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0437\u0430\u043C\u0435\u043D\u044B \u043C\u043E\u0434\u0435\u043B\u0438 \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0439 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 Altron \u043D\u0435 \u0434\u0435\u043B\u0430\u0435\u0442.",
      confirmLaunch: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u0437\u0430\u043F\u0443\u0441\u043A",
      doNotLaunch: "\u041D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0442\u044C",
      workerReport: "\u041E\u0442\u0447\u0451\u0442 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F \u2014 \u0435\u0449\u0451 \u043D\u0435 \u043F\u0440\u0438\u0451\u043C\u043A\u0430",
      resultFiles: "\u0420\u0435\u0430\u043B\u044C\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430",
      fileSize: (bytes) => `${bytes} \u0431\u0430\u0439\u0442`,
      openResultFolder: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0430\u043F\u043A\u0443 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430",
      reviewerConclusion: "\u0417\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0449\u0435\u0433\u043E",
      orderReview: "\u0417\u0430\u043A\u0430\u0437\u0430\u0442\u044C \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0443\u044E \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443",
      checksumDescription: "\u041C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0444\u0430\u0439\u043B\u044B \u0441\u0430\u043C\u043E\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u043D\u043E. \u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u0430\u044F \u0441\u0443\u043C\u043C\u0430 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u043D\u0435\u0438\u0437\u043C\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u0444\u0430\u0439\u043B\u0430, \u0430 \u043D\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0435\u0433\u043E \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u044F.",
      reviewField: "\u0427\u0442\u043E \u0432\u044B \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u043B\u0438 \u043F\u043E \u043A\u0440\u0438\u0442\u0435\u0440\u0438\u044F\u043C \u0437\u0430\u0434\u0430\u0447\u0438",
      reviewCheckbox: "\u042F \u043E\u0442\u043A\u0440\u044B\u043B \u0444\u0430\u0439\u043B\u044B \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u043B \u043A\u0440\u0438\u0442\u0435\u0440\u0438\u0438, \u0430 \u043D\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043B \u043E\u0442\u0447\u0451\u0442.",
      acceptResult: "\u042F \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u043B \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u2014 \u043F\u0440\u0438\u043D\u044F\u0442\u044C",
      userAcceptance: (value) => `\u041F\u0440\u0438\u0451\u043C\u043A\u0430 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F: ${value}`,
      runAttempt: (attempt, elapsed) => `\u041F\u043E\u043F\u044B\u0442\u043A\u0430 ${attempt} \xB7 ${elapsed}`,
      openHermes: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u0438\u0430\u043B\u043E\u0433 \u0432 Hermes",
      requestStop: "\u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0443",
      projectNow: "\u0421\u0435\u0439\u0447\u0430\u0441 \u0432 \u043F\u0440\u043E\u0435\u043A\u0442\u0435",
      projectSummary: (active, review, blocked, done, archived) => `\u041E\u0442\u043A\u0440\u044B\u0442\u044B\u0445 \u0437\u0430\u0434\u0430\u0447: ${active}. \u041D\u0443\u0436\u043D\u0430 \u043F\u0440\u0438\u0451\u043C\u043A\u0430: ${review}. \u041D\u0443\u0436\u0435\u043D \u0440\u0430\u0437\u0431\u043E\u0440 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438: ${blocked}. \u041F\u0440\u0438\u043D\u044F\u0442\u043E: ${done}. \u0412 \u0430\u0440\u0445\u0438\u0432\u0435: ${archived}.`,
      lastDecision: (value) => `\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u0435: ${value}`,
      runLimit: "\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0435 \u043D\u043E\u0432\u044B\u0445 \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u0432",
      remainingRuns: (value) => `\u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u044B\u0445 \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u0432: ${value}. \u0421\u0447\u0438\u0442\u0430\u044E\u0442\u0441\u044F \u0438 \u0441\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u043B\u0430\u043D\u0430, \u0438 \u043A\u0430\u0436\u0434\u044B\u0439 \u0448\u0430\u0433 \u043A\u043E\u043C\u0430\u043D\u0434\u044B, \u0438 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430. \u042D\u0442\u043E \u043D\u0435 \u0434\u0435\u043D\u0435\u0436\u043D\u044B\u0439 \u043B\u0438\u043C\u0438\u0442; \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A \u043D\u0435 \u043F\u0440\u0435\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F.`,
      unlimited: "\u0431\u0435\u0437 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F",
      allowRuns: "\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u0435\u0449\u0451 \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u0432",
      emptyUnlimited: "\u041F\u0443\u0441\u0442\u043E \u2014 \u0431\u0435\u0437 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F",
      confirmRunLimit: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u043B\u0438\u043C\u0438\u0442 \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u0432",
      newTask: "\u041D\u043E\u0432\u0430\u044F \u0437\u0430\u0434\u0430\u0447\u0430",
      fillDemo: "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0443\u0447\u0435\u0431\u043D\u044B\u0439 \u043F\u0440\u0438\u043C\u0435\u0440",
      demoDescription: "\u041F\u0440\u0438\u043C\u0435\u0440 \u0442\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u0444\u043E\u0440\u043C\u0443: \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 \u0441 \u043A\u043D\u043E\u043F\u043A\u043E\u0439 \u0438 \u0435\u0451 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443. \u0421\u043E\u0437\u0434\u0430\u043D\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u0438 \u0437\u0430\u043F\u0443\u0441\u043A \u043F\u043E\u0442\u0440\u0435\u0431\u0443\u044E\u0442 \u0432\u0430\u0448\u0438\u0445 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0445 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439.",
      desiredOutcome: "\u041A\u0430\u043A\u043E\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043D\u0443\u0436\u0435\u043D",
      readinessCheck: "\u041A\u0430\u043A \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0433\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u044C",
      createTask: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443",
      searchTasks: "\u041F\u043E\u0438\u0441\u043A \u0437\u0430\u0434\u0430\u0447",
      showArchive: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0430\u0440\u0445\u0438\u0432",
      projectDecisions: "\u0420\u0435\u0448\u0435\u043D\u0438\u044F \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
      newDecision: "\u041D\u043E\u0432\u043E\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u0435",
      saveDecision: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0440\u0435\u0448\u0435\u043D\u0438\u0435",
      headerDescription: "\u0420\u0430\u0441\u0441\u043A\u0430\u0436\u0438\u0442\u0435 \u043E\u0431 \u0438\u0434\u0435\u0435. Altron \u0443\u0442\u043E\u0447\u043D\u0438\u0442 \u0437\u0430\u0434\u0430\u0447\u0443, \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442 \u0440\u0430\u0431\u043E\u0442\u0443 \u0438 \u043F\u043E\u043A\u0430\u0436\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442.",
      noConnection: "\u041D\u0435\u0442 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u043A Hermes. \u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0441 \u0437\u0430\u0434\u0430\u0447\u0430\u043C\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B.",
      loading: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 Altron\u2026",
      apiUnavailable: "API Altron \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435, \u0447\u0442\u043E Python-\u0447\u0430\u0441\u0442\u044C \u043F\u0430\u043A\u0435\u0442\u0430 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0430 \u0432 \u044D\u0442\u043E\u043C \u043F\u0440\u043E\u0444\u0438\u043B\u0435 Hermes.",
      modeLabel: "\u0420\u0435\u0436\u0438\u043C Altron",
      autonomousMode: "\u0410\u0432\u0442\u043E\u043D\u043E\u043C\u043D\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442",
      manualMode: "\u0420\u0443\u0447\u043D\u043E\u0439 \u0440\u0435\u0436\u0438\u043C",
      refresh: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435",
      currentProject: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u043F\u0440\u043E\u0435\u043A\u0442",
      chooseProject: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0435\u043A\u0442",
      addProject: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442",
      projectName: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
      projectFolder: "\u041F\u0430\u043F\u043A\u0430 \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
      projectFolderPlaceholder: "\u041F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0439 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0439 \u043F\u0430\u043F\u043A\u0435",
      folderWarning: "\u041D\u0435 \u0432\u044B\u0431\u0438\u0440\u0430\u0439\u0442\u0435 \u0432\u0435\u0441\u044C \u0434\u0438\u0441\u043A \u0438\u043B\u0438 \u043F\u0430\u043F\u043A\u0443 Hermes. Altron \u043D\u0435 \u043A\u043E\u043F\u0438\u0440\u0443\u0435\u0442 \u0441\u0442\u0430\u0440\u044B\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u044B \u0438 \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u0451\u0442 \u0437\u0430\u0434\u0430\u0447\u0438 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438.",
      createProject: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442",
      projectUnavailable: "\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u0427\u0443\u0436\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043D\u0435 \u043F\u043E\u0434\u0441\u0442\u0430\u0432\u043B\u044F\u044E\u0442\u0441\u044F.",
      autonomousProjectNotice: "\u042D\u0442\u043E\u0442 \u043F\u0440\u043E\u0435\u043A\u0442 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u0432 \u0430\u0432\u0442\u043E\u043D\u043E\u043C\u043D\u043E\u043C \u0440\u0435\u0436\u0438\u043C\u0435. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0435\u0433\u043E \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 \xAB\u0410\u0432\u0442\u043E\u043D\u043E\u043C\u043D\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442\xBB."
    }
  }
};
function valueAt(tree, key) {
  return key.split(".").reduce((value, part) => value?.[part], tree);
}
function translate(language, key, ...args) {
  const locale = language === "ru" ? "ru" : "en";
  const value = valueAt(messages[locale], key) ?? valueAt(messages.en, key);
  if (typeof value === "function") return value(...args);
  return typeof value === "string" ? value : key;
}
var russianT = (key, ...args) => translate("ru", key, ...args);
var defaultLocalizer = {
  useI18n: () => ({ t: russianT })
};
function readLanguage(storage) {
  const value = storage.get("language", "hermes");
  return supportedLanguages.has(value) ? value : "hermes";
}
function writeLanguage(storage, language) {
  const value = supportedLanguages.has(language) ? language : "hermes";
  storage.set("language", value);
  return value;
}
function createI18n(React2, sdk2, ctx, pluginId) {
  const { createElement: h, createContext, useCallback, useContext, useMemo, useState } = React2;
  const LanguageContext = createContext(null);
  ctx.i18n.register(messages);
  function Provider({ children }) {
    const hermesT = sdk2.usePluginI18n(pluginId);
    const [language, setLanguageState] = useState(() => readLanguage(ctx.storage));
    const setLanguage = useCallback((value2) => setLanguageState(writeLanguage(ctx.storage, value2)), []);
    const t = useMemo(() => language === "hermes" ? hermesT : (key, ...args) => translate(language, key, ...args), [hermesT, language]);
    const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
    return h(LanguageContext.Provider, { value }, children);
  }
  function useI18n() {
    const value = useContext(LanguageContext);
    if (!value) throw new Error("Altron locale provider is missing");
    return value;
  }
  function LanguageSelector() {
    const { language, setLanguage, t } = useI18n();
    const label = t("language.label");
    return h(
      "label",
      { style: { display: "inline-flex", gap: 8, alignItems: "center" } },
      h("span", null, label),
      h(
        "select",
        {
          "aria-label": label,
          value: language,
          onChange: (event) => setLanguage(event.target.value),
          style: { color: "inherit", background: "var(--ui-background)", padding: 6 }
        },
        h("option", { value: "hermes" }, t("language.hermes")),
        h("option", { value: "ru" }, t("language.ru")),
        h("option", { value: "en" }, t("language.en"))
      )
    );
  }
  return { Provider, LanguageSelector, useI18n };
}

// altron/ui/actions.mjs
function createActions({ api, rpc, isCurrent, getConnectionId, getProfile, onEvent, onDispose, onTrackingError, onTerminal, openSession, t = russianT }) {
  const busy = /* @__PURE__ */ new Set();
  const connectionId = getConnectionId();
  const profile = getProfile();
  const sourceCurrent = () => getConnectionId() === connectionId && getProfile() === profile;
  const current = () => isCurrent() && sourceCurrent();
  const track = (projectId, runId, runtimeId) => {
    const stop = onEvent("message.complete", async (event) => {
      if (event.session_id !== runtimeId || !["complete", "error", "interrupted"].includes(event.payload?.status)) return;
      stop();
      if (!sourceCurrent()) return;
      try {
        await api(`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/terminal`, {
          method: "POST",
          body: { runtime_id: runtimeId, status: event.payload.status }
        });
        if (sourceCurrent()) await onTerminal?.({ projectId, runId, status: event.payload.status });
      } catch (error) {
        onTrackingError(error);
      }
    });
    onDispose(stop);
  };
  const check = () => {
    if (!current()) throw new Error("scope_changed");
  };
  const post = (path, body) => {
    check();
    return api(path, { method: "POST", body });
  };
  return {
    async start({ projectId, taskId, role, model, provider, specialist = null, team = false }) {
      const key = `${projectId}:${taskId}`;
      check();
      if (busy.has(key)) throw new Error("run_already_starting");
      if (!team && (!model?.trim() || !provider?.trim())) throw new Error("model_and_provider_required");
      busy.add(key);
      let run;
      let submitted = false;
      try {
        const path = `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`;
        run = team ? await post(`${path}/team/next`) : await post(`${path}/runs`, { role, model, provider, specialist });
        if (!run) return null;
        if (team) ({ role, model, provider } = run);
        check();
        const session = await rpc("session.create", {
          source: "desktop",
          profile,
          cwd: run.directory,
          title: `Altron \xB7 ${role} \xB7 ${taskId.slice(0, 8)}`,
          model,
          provider,
          reasoning_effort: "max",
          close_on_disconnect: false,
          hidden: false,
          follow_profile_config: false
        });
        check();
        if (session.info?.model !== model || session.info?.provider !== provider) throw new Error("model_mismatch");
        if (session.info?.profile_name !== profile) throw new Error("profile_mismatch");
        if (!session.session_id || !session.stored_session_id) throw new Error("session_identity_missing");
        await post(`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(run.id)}/bind`, {
          runtime_id: session.session_id,
          stored_id: session.stored_session_id
        });
        check();
        track(projectId, run.id, session.session_id);
        submitted = true;
        const accepted = await rpc("prompt.submit", { session_id: session.session_id, text: run.prompt });
        if (accepted.status !== "streaming") throw new Error("prompt_delivery_unconfirmed");
        return { ...run, runtime_id: session.session_id, stored_id: session.stored_session_id, status: "running" };
      } catch (error) {
        if (run && current()) {
          try {
            await post(`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(run.id)}/status`, {
              status: submitted ? "unknown" : "failed",
              note: submitted ? t("actions.submitUnknown") : t("actions.stoppedBeforeSubmit")
            });
          } catch {
            throw new Error("run_state_unconfirmed", { cause: error });
          }
        }
        throw error;
      } finally {
        busy.delete(key);
      }
    },
    async cancel({ projectId, run }) {
      check();
      await post(`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(run.id)}/status`, {
        status: "cancel_requested",
        note: t("actions.cancelRequested")
      });
      check();
      if (run.runtime_id) await rpc("session.interrupt", { session_id: run.runtime_id });
      return { status: "cancel_requested" };
    },
    async open(run) {
      check();
      if (!run.stored_id) throw new Error("session_identity_missing");
      return openSession(run.stored_id);
    }
  };
}

// altron/ui/workspace-tools.mjs
var demoTask = {
  goal: russianT("workspace.demoGoal"),
  acceptance: russianT("workspace.demoAcceptance")
};
var demoTaskFor = (t) => ({
  goal: t("workspace.demoGoal"),
  acceptance: t("workspace.demoAcceptance")
});
async function loadConnections(rpc, profile) {
  const inventory = await rpc("model.options", { profile, explicit_only: true, include_unconfigured: true });
  const current = { model: inventory.model || "", provider: inventory.provider || "" };
  const providers = (inventory.providers || []).map((p) => ({
    id: current.provider && (p.slug === current.provider || p.name === current.provider || p.aliases?.includes(current.provider)) ? current.provider : p.slug,
    label: p.name,
    authenticated: p.authenticated === true,
    models: [...new Set(p.models || [])]
  }));
  const selected = providers.find((p) => p.id === current.provider);
  if (selected && current.model && !selected.models.includes(current.model)) selected.models.unshift(current.model);
  return { current, providers };
}
function projectSummary(project) {
  const visible = project.tasks.filter((task) => !task.archived);
  return {
    active: visible.filter((t) => !["done", "cancelled"].includes(t.status)).length,
    archived: project.tasks.length - visible.length,
    review: visible.filter((t) => t.status === "review").length,
    blocked: visible.filter((t) => ["unknown", "failed", "interrupted", "cancel_requested"].includes(t.status)).length,
    done: visible.filter((t) => t.status === "done").length
  };
}
function usageText(usage = {}, t = russianT) {
  const tokens = Number.isFinite(usage.input) && Number.isFinite(usage.output) ? t("workspace.usageTokens", usage.input, usage.output) : "";
  if (!Number.isFinite(usage.cost_usd) || !["known", "estimated"].includes(usage.cost_status)) return t("workspace.costUnknown", tokens);
  return t("workspace.cost", tokens, usage.cost_usd.toFixed(4), usage.cost_status === "estimated");
}
function elapsedText(run, now = Date.now(), t = russianT) {
  const end = run.finished_at ? Date.parse(run.finished_at) : now;
  const seconds = Math.max(0, Math.floor((end - Date.parse(run.created_at)) / 1e3));
  return Number.isFinite(seconds) ? t("workspace.elapsed", Math.floor(seconds / 60), seconds % 60) : t("workspace.timeUnknown");
}
function createWorkspaceTools(React2, sdk2, ctx, localizer = defaultLocalizer) {
  const { createElement: h, useEffect, useRef, useState } = React2;
  const { Button: Button2, Input, useQuery, host: host2 } = sdk2;
  const stack4 = { display: "grid", gap: 10 };
  const panel4 = { ...stack4, padding: 12, border: "1px solid var(--ui-stroke-secondary)", borderRadius: 8 };
  const selectStyle2 = { color: "inherit", background: "var(--ui-background)", padding: 8 };
  const field = (label, input) => h("label", { style: stack4 }, h("span", null, label), React2.cloneElement(input, { "aria-label": label }));
  function Connections({ profile, queryKey, gateway, model, provider, setModel, setProvider, busy }) {
    const { t } = localizer.useI18n();
    const query = useQuery({ queryKey: [...queryKey, "connections"], queryFn: () => loadConnections((...args) => host2.request(...args), profile), enabled: gateway === "open", retry: false });
    const providers = query.data?.providers || [];
    const selected = providers.find((p) => p.id === provider);
    const current = query.data?.current;
    return h(
      "section",
      { style: panel4 },
      h("h3", null, t("workspace.connectionTitle")),
      h("p", null, t("workspace.connectionDescription")),
      query.error && h("p", { role: "status" }, t("workspace.catalogError")),
      field(t("workspace.configuredConnection"), h(
        "select",
        { value: selected ? provider : "", disabled: busy, style: selectStyle2, onChange: (e) => {
          setProvider(e.target.value);
          setModel("");
        } },
        h("option", { value: "" }, t("workspace.chooseConnection")),
        ...providers.map((p) => h("option", { key: p.id, value: p.id, disabled: !p.authenticated }, `${p.label}${p.authenticated ? "" : t("workspace.loginRequired")}`))
      )),
      field(t("workspace.catalogModel"), h(
        "select",
        { value: selected?.models.includes(model) ? model : "", disabled: busy || !selected?.authenticated, style: selectStyle2, onChange: (e) => setModel(e.target.value) },
        h("option", { value: "" }, t("workspace.chooseModel")),
        ...(selected?.models || []).map((name) => h("option", { key: name, value: name }, name))
      )),
      h(Button2, { disabled: busy || !current?.model || !providers.some((p) => p.id === current?.provider && p.authenticated), onClick: () => {
        setModel(current.model);
        setProvider(current.provider);
      } }, t("workspace.useCurrentConnection")),
      h("p", { role: "status" }, selected?.authenticated && model ? t("workspace.connectionReady") : t("workspace.connectionNeeded")),
      h(
        "details",
        null,
        h("summary", null, t("workspace.advancedEntry")),
        field(t("workspace.model"), h(Input, { value: model, maxLength: 300, disabled: busy, onChange: (e) => setModel(e.target.value) })),
        field(t("workspace.provider"), h(Input, { value: provider, maxLength: 100, disabled: busy, onChange: (e) => setProvider(e.target.value) }))
      ),
      h(Button2, { disabled: busy || gateway !== "open", onClick: () => query.refetch?.() }, t("workspace.checkConnection"))
    );
  }
  function FolderPicker({ directory, onChoose, busy }) {
    const { t } = localizer.useI18n();
    const [listing, setListing] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [name, setName] = useState("");
    const live = useRef(true);
    useEffect(() => {
      live.current = true;
      return () => {
        live.current = false;
      };
    }, []);
    const browse = async (path) => {
      setLoading(true);
      setError("");
      try {
        const data = await ctx.rest(`/folders?path=${encodeURIComponent(path || "")}`);
        if (live.current) setListing(data);
      } catch {
        if (live.current) setError(t("workspace.folderUnavailable"));
      } finally {
        if (live.current) setLoading(false);
      }
    };
    return h(
      "div",
      { style: stack4 },
      h(Button2, { type: "button", disabled: busy || loading, onClick: () => browse(directory) }, t("workspace.chooseFolder")),
      error && h("p", { role: "alert" }, error),
      listing && h(
        "section",
        { role: "dialog", "aria-label": t("workspace.folderDialog"), style: panel4 },
        h("strong", null, listing.path),
        h("p", null, t("workspace.folderPrivacy")),
        h(Button2, { type: "button", disabled: loading || !listing.parent, onClick: () => browse(listing.parent) }, t("workspace.parentFolder")),
        h("div", { style: { ...stack4, maxHeight: 250, overflow: "auto" } }, ...listing.directories.map((entry) => h(Button2, { key: entry.path, type: "button", disabled: loading, onClick: () => browse(entry.path) }, entry.name))),
        field(t("workspace.newFolderName"), h(Input, { value: name, maxLength: 120, disabled: loading, onChange: (e) => setName(e.target.value) })),
        h(Button2, { type: "button", disabled: loading || !name.trim(), onClick: async () => {
          setLoading(true);
          setError("");
          try {
            const created = await ctx.rest("/folders", { method: "POST", body: { parent: listing.path, name } });
            if (live.current) {
              onChoose(created.path);
              setListing(null);
              setName("");
            }
          } catch {
            if (live.current) setError(t("workspace.createFolderFailed"));
          } finally {
            if (live.current) setLoading(false);
          }
        } }, t("workspace.createAndChoose")),
        h(Button2, { type: "button", disabled: loading, onClick: () => {
          onChoose(listing.path);
          setListing(null);
        } }, t("workspace.chooseThisFolder")),
        h(Button2, { type: "button", disabled: loading, onClick: () => setListing(null) }, t("workspace.closeFolderPicker"))
      )
    );
  }
  function Diagnostics({ perform = (work) => work(), busy = false }) {
    const { t } = localizer.useI18n();
    const [report, setReport] = useState(null);
    return h(
      "details",
      { style: panel4 },
      h("summary", null, t("workspace.diagnosticsTitle")),
      h("p", null, t("workspace.diagnosticsDescription")),
      h(Button2, { disabled: busy, onClick: () => perform(async () => setReport(await ctx.rest("/diagnostics"))) }, t("workspace.buildDiagnostics")),
      report && h(
        React2.Fragment,
        null,
        h("pre", { style: { whiteSpace: "pre-wrap" } }, JSON.stringify(report, null, 2)),
        h(Button2, { disabled: busy, onClick: () => perform(() => ctx.os.writeClipboard(JSON.stringify(report, null, 2))) }, t("workspace.copyDiagnostics"))
      ),
      h("a", { href: "https://github.com/VibeSan7/altron-desktop/issues/new?template=bug_report.yml", target: "_blank", rel: "noreferrer" }, t("workspace.reportIssue"))
    );
  }
  return { Connections, FolderPicker, Diagnostics };
}

// altron/ui/mission-view.mjs
var DEFAULT_LIMITS = { max_turns: 12, max_hours: 168 };
var LIMITS = { max_turns: [1, 200], max_hours: [1, 168] };
var stack = { display: "grid", gap: 12, minWidth: 0 };
var row = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", minWidth: 0 };
var panel = { ...stack, padding: 16, border: "1px solid var(--ui-stroke-secondary)", borderRadius: 10 };
var muted = { color: "var(--ui-text-secondary)", fontSize: 13, overflowWrap: "anywhere" };
var textBlock = { whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0, minWidth: 0 };
function failure(code) {
  return new Error(code);
}
function validateLimits(max_turns, max_hours) {
  if (!Number.isInteger(max_turns) || max_turns < LIMITS.max_turns[0] || max_turns > LIMITS.max_turns[1]) throw failure("invalid_limits");
  if (!Number.isInteger(max_hours) || max_hours < LIMITS.max_hours[0] || max_hours > LIMITS.max_hours[1]) throw failure("invalid_limits");
}
function encodeMissionId(id) {
  return encodeURIComponent(id);
}
function lastTurn(mission) {
  return mission?.turns?.[mission.turns.length - 1] || null;
}
function needsSession(mission) {
  const turn = lastTurn(mission);
  return mission?.status === "prepared" && !turn?.runtime_id && !turn?.stored_id;
}
function createMissionActions({ api, rpc, getConnectionId, getProfile, isCurrent, t = russianT }) {
  const busy = /* @__PURE__ */ new Set();
  const sourceSnapshot = () => Object.freeze({ connectionId: getConnectionId(), profile: getProfile() });
  const check = (source) => {
    if (!isCurrent() || getConnectionId() !== source.connectionId || getProfile() !== source.profile) throw failure("scope_changed");
  };
  const external = async (source, work) => {
    check(source);
    return work();
  };
  const post = (source, path, body) => external(source, () => api(path, { method: "POST", body }));
  async function bindPrepared(source, mission) {
    if (!needsSession(mission)) return mission;
    const turn = lastTurn(mission);
    const selected = mission.connection || {};
    if (selected.profile !== source.profile) throw failure("profile_mismatch");
    if (!selected.model || !selected.provider) throw failure("model_mismatch");
    const created = await external(source, () => rpc("session.create", {
      source: "desktop",
      profile: selected.profile,
      model: selected.model,
      provider: selected.provider,
      cwd: turn.directory,
      close_on_disconnect: false,
      title: mission.phase === "interview" ? t("mission.sessionInterview") : t("mission.sessionWork")
    }));
    const info = created?.info || {};
    if (info.model !== selected.model || info.provider !== selected.provider) throw failure("model_mismatch");
    if (info.profile_name !== selected.profile) throw failure("profile_mismatch");
    if (!created?.session_id || !created?.stored_session_id) throw failure("session_identity_missing");
    return post(source, `/missions/${encodeMissionId(mission.id)}/bind`, {
      turn_id: turn.id,
      runtime_id: created.session_id,
      stored_id: created.stored_session_id
    });
  }
  function run(key, operation) {
    const source = sourceSnapshot();
    if (busy.has(key)) return Promise.reject(failure("mission_already_starting"));
    busy.add(key);
    return (async () => {
      try {
        return await operation(source);
      } finally {
        busy.delete(key);
      }
    })();
  }
  return {
    create({ message, model, provider }) {
      const source = sourceSnapshot();
      const key = `create:${source.connectionId}:${source.profile}`;
      if (busy.has(key)) return Promise.reject(failure("mission_already_starting"));
      busy.add(key);
      return (async () => {
        try {
          const mission = await post(source, "/missions", { message, model, provider, profile: source.profile });
          return mission ? await bindPrepared(source, mission) : mission;
        } finally {
          busy.delete(key);
        }
      })();
    },
    answer(id, { revision, message }) {
      return run(`answer:${id}`, async (source) => {
        const mission = await post(source, `/missions/${encodeMissionId(id)}/answer`, { revision, message });
        return mission ? await bindPrepared(source, mission) : mission;
      });
    },
    approve(id, { revision, directory, max_turns = DEFAULT_LIMITS.max_turns, max_hours = DEFAULT_LIMITS.max_hours }) {
      validateLimits(max_turns, max_hours);
      if (typeof directory !== "string" || !directory.trim()) throw failure("directory_required");
      return run(`approve:${id}`, async (source) => {
        const mission = await post(source, `/missions/${encodeMissionId(id)}/approve`, { revision, directory, max_turns, max_hours, confirm: true });
        return mission ? await bindPrepared(source, mission) : mission;
      });
    },
    resume(id) {
      return run(`resume:${id}`, async (source) => {
        const mission = await post(source, `/missions/${encodeMissionId(id)}/resume`, { confirm: true });
        return mission ? await bindPrepared(source, mission) : mission;
      });
    },
    cancel(id) {
      return run(`cancel:${id}`, (source) => post(source, `/missions/${encodeMissionId(id)}/cancel`, { confirm: true }));
    },
    recover(id) {
      return run(`recover:${id}`, async (source) => {
        const mission = await post(source, `/missions/${encodeMissionId(id)}/recover`, { confirm: true });
        return mission ? await bindPrepared(source, mission) : mission;
      });
    },
    revise(id, { feedback, max_turns = DEFAULT_LIMITS.max_turns, max_hours = DEFAULT_LIMITS.max_hours }) {
      validateLimits(max_turns, max_hours);
      return run(`revise:${id}`, async (source) => {
        const mission = await post(source, `/missions/${encodeMissionId(id)}/revise`, { feedback, max_turns, max_hours, confirm: true });
        return mission ? await bindPrepared(source, mission) : mission;
      });
    }
  };
}
function valueOf(event) {
  return event?.target?.value ?? "";
}
function listOf(value) {
  return Array.isArray(value) ? value : [];
}
function errorText(error, t = russianT) {
  const message = String(error?.message || error || "");
  const known = [
    "scope_changed",
    "model_mismatch",
    "profile_mismatch",
    "session_identity_missing",
    "mission_already_starting",
    "directory_required",
    "directory_must_be_absolute",
    "project_overlap",
    "invalid_limits",
    "permission_pending",
    "permission_required",
    "run_still_active",
    "time_limit",
    "turn_limit"
  ];
  const code = known.find((value) => message.includes(value));
  return code ? t(`mission.errors.${code}`) : message || t("mission.genericError");
}
function createDraftStorage(ctx, scope) {
  const key = (field) => `altron.mission.draft:${JSON.stringify([...scope, field])}`;
  return {
    read(field) {
      if (!ctx.storage?.get) return "";
      return ctx.storage.get(key(field), "");
    },
    write(field, value) {
      ctx.storage?.set?.(key(field), value);
    }
  };
}
function createMissionView(React2, sdk2, ctx, localizer = defaultLocalizer) {
  const { createElement: h, Fragment, useEffect, useMemo, useRef, useState } = React2;
  const { Button: Button2, ConfirmDialog, Input, Textarea, useQuery, useQueryClient } = sdk2;
  const { FolderPicker } = createWorkspaceTools(React2, sdk2, ctx, localizer);
  const field = (label, control) => h("label", { style: stack }, h("span", null, label), React2.cloneElement(control, { "aria-label": label }));
  const paragraph = (value) => h("p", { style: textBlock }, value || "");
  const itemList = (items, t) => items?.length ? h("ul", { style: { ...stack, gap: 6, paddingLeft: 20 } }, ...items.map((item, index) => h("li", { key: `${item?.path || item?.id || index}`, style: { overflowWrap: "anywhere" } }, typeof item === "string" ? item : item.path ? `${item.path}${item.purpose ? ` \u2014 ${item.purpose}` : ""}` : JSON.stringify(item)))) : h("p", { style: muted }, t("mission.empty"));
  function MissionView({ profile, connectionId, gateway, queryKey = [], workspaceId, model, provider, mission: suppliedMission }) {
    const { t } = localizer.useI18n();
    const baseKey = Array.isArray(queryKey) ? queryKey : [queryKey];
    const listKey = [...baseKey, "missions", "list", workspaceId, connectionId, profile];
    const [selectedId, setSelectedId] = useState(suppliedMission?.id || null);
    const [intro, setIntro] = useState("");
    const [answer, setAnswer] = useState("");
    const [feedback, setFeedback] = useState("");
    const [directory, setDirectory] = useState("");
    const [maxTurns, setMaxTurns] = useState(DEFAULT_LIMITS.max_turns);
    const [maxHours, setMaxHours] = useState(DEFAULT_LIMITS.max_hours);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [confirm, setConfirm] = useState(null);
    const touched = useRef(/* @__PURE__ */ new Set());
    const live = useRef(true);
    useEffect(() => {
      live.current = true;
      return () => {
        live.current = false;
      };
    }, []);
    const errorRef = useRef(null);
    const queryClient = useQueryClient?.();
    const missionsQuery = useQuery({ queryKey: listKey, queryFn: () => ctx.rest("/missions"), enabled: gateway === "open", retry: false, refetchInterval: 3e3 });
    const missions = listOf(missionsQuery.data);
    const detailKey = [...baseKey, "missions", "detail", workspaceId, connectionId, profile, selectedId || "none"];
    const detailQuery = useQuery({ queryKey: detailKey, queryFn: () => ctx.rest(`/missions/${encodeMissionId(selectedId)}`), enabled: gateway === "open" && Boolean(selectedId), retry: false, refetchInterval: 3e3 });
    const detail = detailQuery.data && !Array.isArray(detailQuery.data) ? detailQuery.data : null;
    const mission = suppliedMission || detail || missions.find((item) => item.id === selectedId) || null;
    const storage = useMemo(() => createDraftStorage(ctx, [workspaceId, connectionId, profile, selectedId || "new"]), [workspaceId, connectionId, profile, selectedId]);
    const actions = useMemo(() => createMissionActions({
      api: (...args) => ctx.rest(...args),
      rpc: (...args) => sdk2.host.request(...args),
      getConnectionId: () => sdk2.host?.state?.connectionId?.get?.() ?? connectionId,
      getProfile: () => sdk2.host?.state?.profile?.get?.() ?? profile,
      isCurrent: () => live.current && (sdk2.host?.state?.gateway?.get?.() ?? gateway) === "open",
      t
    }), [connectionId, gateway, profile, sdk2.host, ctx.rest, t]);
    useEffect(() => {
      if (suppliedMission?.id) setSelectedId(suppliedMission.id);
      else if (selectedId && missions.length && !missions.some((item) => item.id === selectedId)) setSelectedId(null);
    }, [missions, selectedId, suppliedMission?.id]);
    useEffect(() => {
      setIntro("");
      setAnswer("");
      setFeedback("");
      setDirectory("");
      setMaxTurns(DEFAULT_LIMITS.max_turns);
      setMaxHours(DEFAULT_LIMITS.max_hours);
      touched.current = /* @__PURE__ */ new Set();
      let active = true;
      const restore = async (name, setter) => {
        const saved = await Promise.resolve(storage.read(name));
        if (active && !touched.current.has(name) && typeof saved === "string" && saved) setter(saved);
      };
      void restore("intro", setIntro);
      void restore("answer", setAnswer);
      void restore("feedback", setFeedback);
      void restore("directory", setDirectory);
      return () => {
        active = false;
      };
    }, [storage]);
    useEffect(() => {
      if (!error) return;
      errorRef.current?.focus?.({ preventScroll: true });
      errorRef.current?.scrollIntoView?.({ block: "center", behavior: "instant" });
    }, [error]);
    const refresh = () => queryClient?.invalidateQueries?.({ queryKey: listKey });
    const perform = async (operation) => {
      if (busy || gateway !== "open") return;
      setBusy(true);
      setError("");
      try {
        await operation();
      } catch (failureValue) {
        setError(errorText(failureValue, t));
      } finally {
        setBusy(false);
        refresh();
      }
    };
    const edit = (name, setter) => (event) => {
      const next = valueOf(event);
      touched.current.add(name);
      setter(next);
      storage.write(name, next);
    };
    const chooseExample = (text) => {
      touched.current.add("intro");
      setIntro(text);
      storage.write("intro", text);
    };
    const startInterview = (event) => {
      event.preventDefault();
      if (!intro.trim() || !model?.trim() || !provider?.trim()) return;
      void perform(async () => {
        const created = await actions.create({ message: intro, model, provider });
        setSelectedId(created?.id || null);
      });
    };
    const answerMission = (event) => {
      event.preventDefault();
      if (!mission || !answer.trim()) return;
      void perform(async () => {
        const updated = await actions.answer(mission.id, { revision: mission.revision, message: answer });
        setAnswer("");
        storage.write("answer", "");
        setSelectedId(updated?.id || mission.id);
      });
    };
    const approveMission = (event) => {
      event.preventDefault();
      if (!mission || !directory.trim()) {
        setError(errorText(failure("directory_required"), t));
        return;
      }
      void perform(async () => {
        const updated = await actions.approve(mission.id, { revision: mission.revision, directory, max_turns: maxTurns, max_hours: maxHours });
        setSelectedId(updated?.id || mission.id);
      });
    };
    const runCancel = () => void perform(async () => {
      await actions.cancel(mission.id);
      setConfirm(null);
    });
    const runRecover = () => void perform(async () => {
      const updated = await actions.recover(mission.id);
      setConfirm(null);
      setSelectedId(updated?.id || mission.id);
    });
    const runRevise = (event) => {
      event?.preventDefault?.();
      if (!feedback.trim()) return;
      void perform(async () => {
        const updated = await actions.revise(mission.id, { feedback, max_turns: maxTurns, max_hours: maxHours });
        setFeedback("");
        storage.write("feedback", "");
        setConfirm(null);
        setSelectedId(updated?.id || mission.id);
      });
    };
    const openSession = (storedId) => {
      if (storedId && typeof sdk2.host?.openSession === "function") void sdk2.host.openSession(storedId);
    };
    const status = mission?.status;
    const history = missions.length > 0 && h(
      "aside",
      { style: panel },
      h("h2", null, t("mission.myMissions")),
      h("div", { style: stack }, ...missions.map((item) => h(Button2, {
        key: item.id,
        type: "button",
        variant: item.id === selectedId ? "secondary" : "ghost",
        style: { justifyContent: "flex-start", minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" },
        onClick: () => setSelectedId(item.id)
      }, `${item.proposal?.name || item.transcript?.[0]?.text || item.id} \xB7 ${t(`mission.statuses.${item.status}`)}`)))
    );
    const queryError = (missionsQuery.error || detailQuery.error) && h("p", { role: "alert" }, t("mission.queryError"));
    const renderLimits = () => h(
      "div",
      { style: row },
      field(t("mission.turnsLimit"), h(Input, { type: "number", min: 1, max: 200, value: maxTurns, disabled: busy, onChange: (e) => setMaxTurns(Number(valueOf(e))) })),
      field(t("mission.hoursLimit"), h(Input, { type: "number", min: 1, max: 168, value: maxHours, disabled: busy, onChange: (e) => setMaxHours(Number(valueOf(e))) }))
    );
    const renderTranscript = () => h(
      "section",
      { style: panel },
      h("h2", null, t("mission.interview")),
      h("p", { style: muted }, t("mission.interviewDescription")),
      h("div", { style: stack }, ...(mission.transcript || []).map((entry, index) => h("article", { key: `${entry.role}-${index}`, style: { padding: 12, borderRadius: 8, background: "var(--ui-bg-quaternary)", minWidth: 0 } }, h("strong", null, entry.role === "assistant" ? t("mission.altronQuestion") : t("mission.yourAnswer")), paragraph(entry.text)))),
      ["waiting", "awaiting_approval"].includes(status) && h("form", { onSubmit: answerMission, style: stack }, field(status === "awaiting_approval" ? t("mission.reviseProposal") : t("mission.answerQuestion"), h(Textarea, { value: answer, disabled: busy, onChange: edit("answer", setAnswer), placeholder: t("mission.answerPlaceholder") })), h(Button2, { type: "submit", disabled: busy || !answer.trim() }, t("mission.saveAnswer")))
    );
    const renderProposal = () => {
      const proposal = mission.proposal;
      if (!proposal) return null;
      return h(
        "section",
        { style: panel },
        h("h2", { style: { overflowWrap: "anywhere" } }, proposal.name),
        h("p", { style: muted }, t("mission.proposalDescription")),
        h("h3", null, t("mission.goal")),
        paragraph(proposal.goal),
        h("h3", null, t("mission.requirements")),
        itemList(proposal.requirements, t),
        h("h3", null, t("mission.outOfScope")),
        itemList(proposal.out_of_scope, t),
        h("h3", null, t("mission.plan")),
        paragraph(proposal.plan),
        h("h3", null, t("mission.deliverables")),
        itemList(proposal.deliverables, t),
        h("h3", null, t("mission.checks")),
        h("div", { style: stack }, ...(proposal.checks || []).map(checkItem)),
        h("p", { style: muted }, t("mission.connection", mission.connection?.model || t("common.notSpecified"), mission.connection?.provider || t("common.notSpecified"))),
        h(
          "form",
          { onSubmit: approveMission, style: stack },
          field(t("mission.projectFolder"), h(Input, { value: directory, disabled: busy, placeholder: t("mission.folderPlaceholder"), onChange: edit("directory", setDirectory) })),
          h(FolderPicker, { directory, onChoose: (path) => {
            setDirectory(path);
            storage.write("directory", path);
          }, busy }),
          h("div", { style: row }, field(t("mission.turnsLimit"), h(Input, { type: "number", min: 1, max: 200, value: maxTurns, disabled: busy, onChange: (e) => setMaxTurns(Number(valueOf(e))) })), field(t("mission.hoursLimit"), h(Input, { type: "number", min: 1, max: 168, value: maxHours, disabled: busy, onChange: (e) => setMaxHours(Number(valueOf(e))) }))),
          h("p", { style: muted }, t("mission.limitsDescription")),
          h(Button2, { type: "submit", disabled: busy || !directory.trim() || !proposal }, t("mission.approve"))
        )
      );
    };
    const checkItem = (check) => h("article", { key: check.id, style: { padding: 10, border: "1px solid var(--ui-stroke-secondary)", borderRadius: 8, minWidth: 0 } }, h("strong", null, check.label), h("p", { style: muted }, check.kind === "file" ? check.contains?.length ? t("mission.fileContentCheck", check.path) : t("mission.fileExistenceCheck", check.path) : t("mission.commandCheck", check.command)));
    const renderRuns = () => h(
      "section",
      { style: panel },
      h("h2", null, t("mission.runs")),
      mission.checkpoint && h(Fragment, null, h("h3", null, t("mission.checkpoint")), paragraph(mission.checkpoint)),
      h("div", { style: stack }, ...(mission.turns || []).map((turn, index) => h("article", { key: turn.id, style: { padding: 10, border: "1px solid var(--ui-stroke-secondary)", borderRadius: 8, minWidth: 0 } }, h("div", { style: row }, h("strong", null, t("mission.turn", index + 1)), h("span", { style: muted }, `${t(`mission.phases.${turn.phase}`)} \xB7 ${t(`mission.statuses.${turn.status}`)}`)), h("p", { style: muted }, t("mission.created", turn.created_at || t("common.unknownTime"))), turn.terminal_status && h("p", { style: muted }, t("mission.terminal", turn.terminal_status, turn.settled ? t("common.yes") : t("common.no"))), turn.stored_id && h(Button2, { type: "button", variant: "outline", disabled: busy, onClick: () => openSession(turn.stored_id) }, t("mission.openHistory"))))),
      status === "cancel_requested" && h("p", { role: "status" }, t("mission.stopRequested")),
      status === "unknown" && h("p", { role: "alert", tabIndex: -1 }, t("mission.stateUnknown")),
      (status === "blocked" || mission.blocker === "permission_pending") && h("p", { role: "alert" }, `${status === "blocked" ? t("mission.blocked") : ""}${errorText(mission.blocker || t("mission.reasonMissing"), t)}`),
      ["running", "bound", "creating", "queued", "prepared"].includes(status) && h("div", { style: row }, h(Button2, { type: "button", variant: "destructive", disabled: busy, onClick: () => setConfirm("cancel") }, t("mission.stop"))),
      ["prepared", "queued"].includes(status) && h(Button2, { type: "button", disabled: busy, onClick: () => void perform(() => actions.resume(mission.id)) }, t("mission.resume")),
      ["unknown", "blocked", "cancelled"].includes(status) && h(Button2, { type: "button", variant: "outline", disabled: busy, onClick: () => setConfirm("recover") }, t("mission.recover"))
    );
    const renderResult = () => h(
      "section",
      { style: panel },
      h("h2", null, t("mission.result")),
      h("p", { role: "status" }, status === "ready" ? t("mission.resultReady") : t("mission.resultNotReady")),
      h("h3", null, t("mission.files")),
      h("div", { style: stack }, ...(mission.artifacts || []).map((artifact) => h(
        "article",
        { key: artifact.path, style: { minWidth: 0 } },
        h("strong", { style: { overflowWrap: "anywhere" } }, artifact.path),
        h("p", { style: muted }, `${t("mission.artifactSize", artifact.bytes)} \xB7 SHA-256: ${artifact.sha256}`)
      ))),
      h("h3", null, t("mission.verifications")),
      h("div", { style: stack }, ...(mission.verification || []).map((check) => h(
        "article",
        { key: check.id, style: { minWidth: 0 } },
        h("strong", null, `${check.passed ? t("mission.passed") : t("mission.failed")}: ${check.label}`),
        h("p", { style: muted }, `${check.kind === "file" ? t("mission.fileCheck") : t("mission.commandVerification")} \xB7 ${t("mission.source", check.source || t("common.notSpecified"))}`)
      ))),
      h("h3", null, t("mission.instructions")),
      paragraph(mission.instructions),
      mission.approval?.directory && h(Button2, { type: "button", variant: "outline", disabled: busy, onClick: () => void ctx.os?.revealPath?.(mission.approval.directory) }, t("mission.showFolder")),
      h(
        "form",
        { onSubmit: (event) => {
          event.preventDefault();
          if (feedback.trim()) setConfirm("revise");
        }, style: stack },
        field(t("mission.optionalRevision"), h(Textarea, { value: feedback, disabled: busy, onChange: edit("feedback", setFeedback), placeholder: t("mission.revisionPlaceholder") })),
        renderLimits(),
        h("p", { style: muted }, t("mission.revisionLimits", maxTurns, maxHours)),
        h(Button2, { type: "submit", disabled: busy || !feedback.trim() }, t("mission.confirmRevision"))
      )
    );
    const confirmation = confirm && ConfirmDialog && h(ConfirmDialog, {
      open: true,
      onClose: () => setConfirm(null),
      onConfirm: confirm === "cancel" ? runCancel : confirm === "recover" ? runRecover : runRevise,
      title: confirm === "cancel" ? t("mission.stopTitle") : confirm === "recover" ? t("mission.recoverTitle") : t("mission.reviseTitle"),
      description: confirm === "cancel" ? t("mission.stopDescription") : confirm === "recover" ? t("mission.recoverDescription") : t("mission.reviseDescription", maxTurns, maxHours),
      confirmLabel: confirm === "cancel" ? t("mission.stopLabel") : confirm === "recover" ? t("mission.recoverLabel") : t("mission.reviseLabel"),
      destructive: confirm === "cancel"
    });
    if (!mission) return h(
      "section",
      { style: stack },
      queryError,
      history,
      h(
        "section",
        { style: { ...panel, borderColor: "var(--ui-accent)" } },
        h("p", { style: muted }, t("mission.flow")),
        h("h2", null, t("mission.startTitle")),
        h("p", null, t("mission.startDescription")),
        h(
          "form",
          { onSubmit: startInterview, style: stack },
          field(t("mission.desiredResult"), h(Textarea, {
            value: intro,
            rows: 5,
            maxLength: 16e3,
            disabled: busy,
            placeholder: t("mission.desiredPlaceholder"),
            onChange: edit("intro", setIntro)
          })),
          h(
            "div",
            { style: row },
            h(Button2, { type: "button", variant: "outline", disabled: busy, onClick: () => chooseExample(t("mission.reportExampleText")) }, t("mission.reportExample")),
            h(Button2, { type: "button", variant: "outline", disabled: busy, onClick: () => chooseExample(t("mission.pageExampleText")) }, t("mission.pageExample"))
          ),
          h("p", { style: muted }, t("mission.examplesDescription")),
          h(Button2, { type: "submit", disabled: busy || gateway !== "open" || !intro.trim() || !model?.trim() || !provider?.trim() }, busy ? t("mission.savingInterview") : t("mission.startInterview"))
        )
      ),
      error && h("div", { ref: errorRef, role: "alert", tabIndex: -1, style: panel }, error)
    );
    const stage = status === "ready" ? 2 : mission.approval ? 1 : 0;
    return h(
      "section",
      { style: stack, "data-mission-id": mission.id },
      queryError,
      h(
        "header",
        { style: row },
        h(
          "div",
          { style: { flex: "1 1 300px", minWidth: 0 } },
          h("h2", { style: { overflowWrap: "anywhere" } }, mission.proposal?.name || t("mission.autonomousMission")),
          h("p", { role: "status", style: muted }, t(`mission.statuses.${status}`))
        ),
        h(Button2, { type: "button", variant: "outline", disabled: busy, onClick: () => setSelectedId(null) }, t("mission.newInterview"))
      ),
      h(
        "ol",
        { style: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, padding: 0, listStyle: "none" } },
        ...[t("mission.interview"), t("mission.work"), t("mission.result")].map((label, index) => h("li", {
          key: label,
          "aria-current": index === stage ? "step" : void 0,
          style: { padding: 12, borderRadius: 8, border: `1px solid var(${index === stage ? "--ui-accent" : "--ui-stroke-secondary"})`, overflowWrap: "anywhere" }
        }, `${index + 1}. ${label}`))
      ),
      h("p", { style: muted }, t("mission.closeDescription")),
      renderTranscript(),
      status === "awaiting_approval" && renderProposal(),
      renderRuns(),
      ["ready", "blocked", "cancelled"].includes(status) && mission.approval && renderResult(),
      error && h("div", { ref: errorRef, role: "alert", tabIndex: -1, style: panel }, error),
      history,
      confirmation
    );
  }
  return MissionView;
}

// altron/ui/team-view.mjs
var stack2 = { display: "grid", gap: 10 };
var row2 = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" };
var panel2 = { ...stack2, padding: 12, border: "1px solid var(--ui-stroke-secondary)", borderRadius: 8 };
var selectStyle = { color: "inherit", background: "var(--ui-background)", padding: 8 };
function createTeamViews(React2, sdk2, ctx, coordinator, localizer = defaultLocalizer) {
  const { createElement: h, useEffect, useState } = React2;
  const { Button: Button2, Input, Textarea } = sdk2;
  const field = (name, control) => h("label", { style: stack2 }, h("span", null, name), React2.cloneElement(control, { "aria-label": name }));
  function TeamSettings({ project, perform, busy, model, provider, catalog }) {
    const { t } = localizer.useI18n();
    const roleLabel = (role) => t(`team.roles.${role}`);
    const saved = JSON.stringify(project.team || {});
    const [routes, setRoutes] = useState(() => JSON.parse(saved));
    useEffect(() => setRoutes(JSON.parse(saved)), [saved]);
    const change = (role, key, value) => setRoutes((previous) => ({ ...previous, [role]: { ...previous[role], [key]: value } }));
    const assignments = Object.fromEntries(Object.entries(routes).filter(([, route]) => route.model || route.provider || route.specialist).map(([role, route]) => [role, { model: route.model || "", provider: route.provider || "", specialist: route.specialist || null }]));
    const valid = Object.values(assignments).every((route) => route.model.trim() && route.provider.trim());
    return h(
      "details",
      { style: panel2 },
      h("summary", null, t("team.setup")),
      h("p", null, t("team.setupDescription")),
      h(Button2, { disabled: busy || !model || !provider, onClick: () => setRoutes((previous) => ({ ...previous, ...Object.fromEntries(["altron", "technical", "business", "memory"].map((role) => [role, { ...previous[role], model, provider }])) })) }, t("team.assignAll")),
      ...["altron", "technical", "business", "memory", "reviewer"].map((role) => h(
        "section",
        { key: role, style: panel2 },
        h("strong", null, roleLabel(role)),
        field(t("team.modelFor", roleLabel(role)), h(Input, { value: routes[role]?.model || "", maxLength: 300, disabled: busy, onChange: (e) => change(role, "model", e.target.value) })),
        field(t("team.providerFor", roleLabel(role)), h(Input, { value: routes[role]?.provider || "", maxLength: 100, disabled: busy, onChange: (e) => change(role, "provider", e.target.value) })),
        field(t("team.instructionsFor", roleLabel(role)), h(
          "select",
          { "aria-label": t("team.instructionsFor", roleLabel(role)), value: routes[role]?.specialist || "", disabled: busy, style: selectStyle, onChange: (e) => change(role, "specialist", e.target.value) },
          h("option", { value: "" }, t("team.baseRole")),
          ...(catalog?.specialists || []).filter((s) => s.role === role).map((s) => h("option", { key: s.id, value: s.id }, s.name))
        )),
        routes[role]?.specialist && h("p", null, t("team.adaptedInstructions")),
        h(Button2, { disabled: busy, onClick: () => setRoutes((previous) => {
          const next = { ...previous };
          delete next[role];
          return next;
        }) }, t("team.removeAssignment", roleLabel(role)))
      )),
      !valid && h("p", { role: "status" }, t("team.assignmentIncomplete")),
      h(Button2, { disabled: busy || !valid, onClick: () => perform(() => ctx.rest(`/projects/${project.id}/team`, { method: "POST", body: { assignments } })) }, t("team.save")),
      catalog?.source_commit && h("p", { style: { overflowWrap: "anywhere" } }, t("team.source", catalog.source_commit))
    );
  }
  function TaskTeam({ task, project, plan, steps, setSteps, perform, busy }) {
    const { t } = localizer.useI18n();
    const roleLabel = (role) => t(`team.roles.${role}`);
    const stateLabel = (state) => t(`team.states.${state}`);
    const routeText = (route) => route?.model && route?.provider ? `${route.provider} / ${route.model}${route.specialist?.name ? ` \xB7 ${route.specialist.name}` : ""}` : t("team.noRoute");
    const [confirm, setConfirm] = useState(false);
    const ids = { projectId: project.id, taskId: task.id };
    const path = `/projects/${project.id}/tasks/${task.id}/team`;
    if (!task.team && task.status !== "draft") return null;
    const update = (index, key, value) => setSteps((previous) => previous.map((step, i) => i === index ? { ...step, [key]: value } : step));
    if (task.status === "draft") return h(
      "details",
      { style: panel2, open: steps.length > 0 },
      h("summary", null, t("team.sequence")),
      h("p", null, t("team.sequenceDescription")),
      ...steps.map((step, index) => h(
        "section",
        { key: index, style: panel2 },
        field(t("team.stepRole", index + 1), h(
          "select",
          { "aria-label": t("team.stepRole", index + 1), value: step.role, disabled: busy, style: selectStyle, onChange: (e) => update(index, "role", e.target.value) },
          ...["technical", "business", "memory"].map((role) => h("option", { key: role, value: role }, roleLabel(role)))
        )),
        h("p", null, routeText(project.team?.[step.role])),
        field(t("team.stepResult", index + 1), h(Textarea, { value: step.goal, maxLength: 16e3, disabled: busy, onChange: (e) => update(index, "goal", e.target.value) })),
        field(t("team.stepAcceptance", index + 1), h(Textarea, { value: step.acceptance, maxLength: 16e3, disabled: busy, onChange: (e) => update(index, "acceptance", e.target.value) })),
        h(Button2, { disabled: busy, onClick: () => setSteps((previous) => previous.filter((_, i) => i !== index)) }, t("team.removeStep", index + 1))
      )),
      h(Button2, { disabled: busy || steps.length >= 8, onClick: () => setSteps((previous) => [...previous, { role: "technical", goal: "", acceptance: "" }]) }, t("team.addStep")),
      steps.length > 0 && h(Button2, { disabled: busy || !plan.trim() || steps.some((step) => !step.goal.trim() || !step.acceptance.trim() || !project.team?.[step.role]), onClick: () => perform(() => ctx.rest(`${path}/approve`, { method: "POST", body: { plan, steps } })) }, t("team.approvePlan"))
    );
    const team = task.team;
    if (!team) return null;
    const resumable = ["ready", "paused"].includes(team.status) && team.steps.every((step) => !step.run_id || step.status === "complete");
    return h(
      "section",
      { style: panel2 },
      h("strong", null, t("team.approvedTeam", stateLabel(team.status))),
      team.note && h("p", { role: "status" }, team.note),
      ...team.steps.map((step, index) => h(
        "div",
        { key: index, style: stack2 },
        h("strong", null, `${index + 1}. ${roleLabel(step.role)} \u2014 ${step.goal}`),
        h("span", null, t("team.criteria", step.acceptance)),
        h("span", null, routeText(step)),
        h("span", null, stateLabel(step.status))
      )),
      h("p", null, t("team.separateReviewer")),
      resumable && h(Button2, { disabled: busy || !coordinator, onClick: () => setConfirm(true) }, team.status === "ready" ? t("team.start") : t("team.resume")),
      team.status === "running" && h(Button2, { disabled: busy || !coordinator, onClick: () => perform(() => coordinator.pause(ids)) }, t("team.pause")),
      confirm && h(
        "section",
        { role: "dialog", "aria-label": t("team.startDialog"), style: panel2 },
        h("strong", null, t("team.project", project.name)),
        h("p", null, project.directory),
        h("p", null, t("team.startDescription")),
        h(
          "div",
          { style: row2 },
          h(Button2, { disabled: busy, onClick: () => perform(async () => {
            setConfirm(false);
            await coordinator.start(ids);
          }) }, t("team.confirmStart")),
          h(Button2, { disabled: busy, onClick: () => setConfirm(false) }, t("team.doNotStart"))
        )
      )
    );
  }
  return { TeamSettings, TaskTeam };
}

// altron/ui/maintenance-view.mjs
var errorCodes = ["active_operations", "archive_checksum_mismatch", "invalid_archive_path", "lock_exists", "code_changed", "backup_invalid", "database_incompatible", "recovery_required"];
function createMaintenanceView(React2, sdk2, ctx, localizer = defaultLocalizer) {
  const { createElement: h, useState, useEffect, useRef } = React2;
  const { Button: Button2, Input, useQuery, useQueryClient } = sdk2;
  const grid = { display: "grid", gap: 10 };
  return function Maintenance({ queryKey, gateway }) {
    const { t } = localizer.useI18n();
    const [archive, setArchive] = useState("");
    const [sha256, setSha256] = useState("");
    const [stage, setStage] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const live = useRef(true);
    useEffect(() => {
      live.current = true;
      return () => {
        live.current = false;
      };
    }, []);
    const cache = useQueryClient();
    const state = useQuery({ queryKey: [...queryKey, "maintenance"], queryFn: () => ctx.rest("/maintenance"), enabled: gateway === "open", retry: false, refetchInterval: 5e3 });
    const perform = async (route, body) => {
      if (busy || !live.current) return;
      setBusy(true);
      setError("");
      setConfirm(null);
      try {
        const result = await ctx.rest(`/maintenance/${route}`, { method: "POST", body, timeoutMs: 6e4 });
        if (live.current) {
          setStage(route === "stage" ? result : null);
          if (result.requires_restart) sdk2.host.notify({ kind: "info", message: t("maintenance.restartNotice") });
        }
      } catch (failure2) {
        if (live.current) {
          const code = errorCodes.find((value) => String(failure2?.message).includes(value));
          setError(code ? t(`maintenance.errors.${code}`) : t("maintenance.genericError"));
        }
      } finally {
        if (live.current) {
          setBusy(false);
          await cache.invalidateQueries({ queryKey });
        }
      }
    };
    const field = (label, value, change) => h("label", { style: grid }, h("span", null, label), h(Input, { "aria-label": label, value, disabled: busy, onChange: (e) => {
      change(e.target.value);
      setStage(null);
    }, maxLength: 4096 }));
    const blocked = busy || gateway !== "open" || !state.data || state.data.requires_restart || state.data.status === "recovery_required";
    return h(
      "details",
      { style: { ...grid, padding: 16, border: "1px solid var(--ui-stroke-secondary)", borderRadius: 10 } },
      h("summary", null, t("maintenance.title")),
      h("p", null, t("maintenance.description")),
      h("p", null, t("maintenance.scopeDescription")),
      state.data && h("p", { role: "status" }, t(`maintenance.states.${state.data.status}`) || t("maintenance.stateUnknown")),
      state.error && h("p", { role: "alert" }, t("maintenance.unavailable")),
      state.data?.requires_restart && h("p", { role: "alert" }, t("maintenance.restartRequired")),
      error && h("p", { role: "alert" }, error),
      field(t("maintenance.archivePath"), archive, setArchive),
      field(t("maintenance.checksum"), sha256, setSha256),
      h(Button2, { disabled: blocked || !archive.trim() || !/^[0-9a-f]{64}$/.test(sha256), onClick: () => perform("stage", { archive_path: archive, sha256 }) }, t("maintenance.verifyPackage")),
      stage && h("section", { style: grid }, h("strong", null, t("maintenance.packageVerified", stage.version)), h("p", null, t("maintenance.codeFiles", stage.files.length)), h(Button2, { disabled: blocked, onClick: () => setConfirm("apply") }, t("maintenance.install"))),
      state.data?.backup_id && h(Button2, { disabled: busy || gateway !== "open", onClick: () => setConfirm("rollback") }, t("maintenance.rollback")),
      confirm && h(
        "section",
        { role: "dialog", "aria-label": t("maintenance.confirmDialog"), style: grid },
        h("p", null, confirm === "apply" ? t("maintenance.installQuestion") : t("maintenance.rollbackQuestion")),
        h(Button2, { disabled: busy, onClick: () => perform(confirm, confirm === "apply" ? { stage_id: stage.id, confirm: true } : { confirm: true }) }, t("maintenance.confirm")),
        h(Button2, { disabled: busy, onClick: () => setConfirm(null) }, t("maintenance.cancel"))
      )
    );
  };
}

// altron/ui/task-controls.mjs
var runUnsettled = (run) => !run.terminal_status && !(run.status === "failed" && !run.runtime_id);
function createTaskControls(React2, { Button: Button2, Textarea }, ctx, localizer = defaultLocalizer) {
  const { createElement: h, useState } = React2;
  const stack4 = { display: "grid", gap: 10 };
  const panel4 = { ...stack4, padding: 12, border: "1px solid var(--ui-stroke-secondary)", borderRadius: 8 };
  return function TaskControls({ task, runs, path, perform, busy }) {
    const { t } = localizer.useI18n();
    const [action, setAction] = useState(null);
    const [feedback, setFeedback] = useState("");
    const unsettled = runs.some(runUnsettled);
    const revise = ["review", "done", "failed", "interrupted", "cancelled"].includes(task.status);
    const cancel = ["draft", "approved", "failed", "interrupted", "team_waiting", "unknown"].includes(task.status);
    const archive = ["done", "cancelled", "failed", "interrupted"].includes(task.status);
    const submit = () => perform(async () => {
      await ctx.rest(`${path}/${action}`, { method: "POST", body: action === "recover" ? { confirm: true } : action === "revise" ? { feedback, confirm: true } : { reason: feedback, confirm: true } });
      setAction(null);
      setFeedback("");
    });
    return h(
      "section",
      { style: stack4 },
      h("small", null, t("taskControls.attempt", task.attempt || 1, Boolean(task.archived))),
      task.feedback && h("p", { style: { whiteSpace: "pre-wrap" } }, t("taskControls.revisionFeedback", task.feedback)),
      task.cancellation && h("p", null, t("taskControls.cancellationReason", task.cancellation.reason)),
      unsettled && h("p", { role: "status" }, t("taskControls.unsettled")),
      !task.archived && h(
        "div",
        { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
        cancel && h(Button2, { disabled: busy || unsettled, onClick: () => setAction("cancel") }, t("taskControls.cancel")),
        revise && h(Button2, { disabled: busy || unsettled, onClick: () => setAction("revise") }, t("taskControls.revise")),
        (unsettled || ["unknown", "team_waiting"].includes(task.status)) && h(Button2, { disabled: busy, onClick: () => setAction("recover") }, t("taskControls.recover"))
      ),
      archive && h(Button2, { disabled: busy || unsettled, onClick: () => perform(() => ctx.rest(`${path}/archive`, { method: "POST", body: { archived: !task.archived } })) }, task.archived ? t("taskControls.restoreArchive") : t("taskControls.archive")),
      action && h(
        "section",
        { role: "dialog", "aria-label": t("taskControls.dialogLabel"), style: panel4 },
        h("p", null, action === "recover" ? t("taskControls.recoverDescription") : action === "revise" ? t("taskControls.reviseDescription") : t("taskControls.cancelDescription")),
        action !== "recover" && h(
          "label",
          { style: stack4 },
          h("span", null, action === "revise" ? t("taskControls.whatToFix") : t("taskControls.cancelReason")),
          h(Textarea, { "aria-label": action === "revise" ? t("taskControls.whatToFix") : t("taskControls.cancelReason"), value: feedback, rows: 3, maxLength: action === "revise" ? 16e3 : 2e3, disabled: busy, onChange: (e) => setFeedback(e.target.value) })
        ),
        h(Button2, { disabled: busy || action !== "recover" && !feedback.trim(), onClick: submit }, t("taskControls.confirmChange")),
        h(Button2, { disabled: busy, onClick: () => setAction(null) }, t("taskControls.leaveUnchanged"))
      ),
      task.recovery && h("p", { role: "status" }, task.recovery.active_runs.length ? t("taskControls.recoveryActive") : t("taskControls.recoveryDone")),
      task.attempts?.length > 0 && h(
        "details",
        { style: panel4 },
        h("summary", null, t("taskControls.attemptHistory")),
        h("p", null, t("taskControls.historyDescription")),
        ...task.attempts.map((previous) => h(
          "section",
          { key: previous.attempt, style: panel4 },
          h("strong", null, t("taskControls.previousAttempt", previous.attempt)),
          ...["plan", "feedback", "summary"].filter((key) => previous[key]).map((key) => h("p", { key, style: { whiteSpace: "pre-wrap" } }, previous[key])),
          previous.acceptance_review && h("p", null, t("taskControls.acceptance", previous.acceptance_review.text)),
          ...(previous.artifacts || []).map((file) => h("code", { key: file.path, style: { overflowWrap: "anywhere" } }, `${file.path} \xB7 ${file.sha256}`))
        ))
      )
    );
  };
}

// altron/ui/view.mjs
var errorCodes2 = [
  "runtime_state_changed",
  "runtime_unavailable",
  "runtime_scope_mismatch",
  "runtime_state_unconfirmed",
  "run_budget_exhausted",
  "task_archived",
  "scope_changed",
  "model_mismatch",
  "model_and_provider_required",
  "project_overlap",
  "directory_not_found",
  "directory_must_be_absolute",
  "directory_too_broad",
  "artifact_changed",
  "artifact_unavailable",
  "run_state_unconfirmed",
  "run_already_starting"
];
var stack3 = { display: "grid", gap: 12, minWidth: 0, overflowWrap: "anywhere" };
var row3 = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" };
var panel3 = { ...stack3, padding: 16, border: "1px solid var(--ui-stroke-secondary)", borderRadius: 10 };
var muted2 = { color: "var(--ui-text-secondary)", fontSize: 13 };
function createView(React2, sdk2, ctx, coordinator, localizer = defaultLocalizer) {
  const { createElement: h, useEffect, useMemo, useRef, useState } = React2;
  const { Button: Button2, Input, Textarea, useValue, useQuery, useQueryClient, host: host2 } = sdk2;
  const field = (label, control) => h("label", { style: { ...stack3, gap: 5 } }, h("span", null, label), React2.cloneElement(control, { "aria-label": label }));
  const paragraph = (value) => h("p", { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 } }, value);
  const Maintenance = createMaintenanceView(React2, sdk2, ctx, localizer);
  const MissionView = createMissionView(React2, sdk2, ctx, localizer);
  const { Connections, FolderPicker, Diagnostics } = createWorkspaceTools(React2, sdk2, ctx, localizer);
  const TaskControls = createTaskControls(React2, sdk2, ctx, localizer);
  const { TeamSettings, TaskTeam } = createTeamViews(React2, sdk2, ctx, coordinator, localizer);
  function Task({ task, project, perform, actions, busy, model, provider }) {
    const { t } = localizer.useI18n();
    const statusLabel = (status) => t(`view.statuses.${status}`);
    const roleLabel = (role2) => t(`view.roles.${role2}`);
    const [plan, setPlan] = useState(task.plan);
    const [review, setReview] = useState("");
    const [checked, setChecked] = useState(false);
    const runs = project.runs.filter((run) => run.task_id === task.id);
    const unsettled = runs.some(runUnsettled);
    const taskBusy = busy || Boolean(task.archived);
    const [role, setRole] = useState("technical");
    const [confirmRole, setConfirmRole] = useState(null);
    const proposed = JSON.stringify(task.proposed_steps || []);
    const [steps, setSteps] = useState(() => JSON.parse(proposed));
    useEffect(() => setSteps(JSON.parse(proposed)), [proposed]);
    const routeFor = (value) => project.team?.[value] || { model, provider };
    const confirmRoute = confirmRole ? routeFor(confirmRole) : null;
    useEffect(() => setPlan(task.plan), [task.plan]);
    const path = `/projects/${project.id}/tasks/${task.id}`;
    const launch = () => perform(async () => {
      const chosen = confirmRole;
      setConfirmRole(null);
      await actions.start({ projectId: project.id, taskId: task.id, role: chosen, ...routeFor(chosen) });
    });
    return h(
      "article",
      { style: panel3, "data-task-id": task.id },
      h("div", { style: row3 }, h("strong", null, task.goal), h("span", { style: muted2 }, statusLabel(task.status))),
      h("div", null, h("strong", null, t("view.readinessCriteria")), paragraph(task.acceptance)),
      h(TaskControls, { key: task.attempt || 1, task, runs, path, perform, busy }),
      h("p", { style: muted2 }, task.archived ? t("view.archivedTask") : task.status === "draft" ? t("view.nextDraft") : task.status === "approved" ? t("view.nextApproved") : task.status === "review" ? t("view.nextReview") : ["failed", "interrupted", "unknown"].includes(task.status) ? t("view.nextStopped") : ""),
      task.status === "draft" && !task.archived ? h(
        "div",
        { style: stack3 },
        field(t("view.planForApproval"), h(Textarea, { value: plan, rows: 4, maxLength: 16e3, onChange: (e) => setPlan(e.target.value), disabled: busy })),
        h(
          "div",
          { style: row3 },
          h(Button2, { onClick: () => setConfirmRole("altron"), disabled: busy || !routeFor("altron").model || !routeFor("altron").provider }, t("view.askPlan")),
          h(Button2, { onClick: () => perform(() => ctx.rest(`${path}/approve`, { method: "POST", body: { plan } })), disabled: busy || !plan.trim() || steps.length > 0 }, t("view.approvePlan"))
        )
      ) : h("div", null, h("strong", null, t("view.approvedPlan")), paragraph(task.plan || t("view.noApprovedPlan"))),
      task.status === "approved" && !task.team && !task.archived && h(
        "div",
        { style: row3 },
        field(t("view.assignee"), h(
          "select",
          { value: role, onChange: (e) => setRole(e.target.value), disabled: busy, style: { color: "inherit", background: "var(--ui-background)", padding: 8 } },
          ...["technical", "business", "memory"].map((value) => h("option", { key: value, value }, roleLabel(value)))
        )),
        h(Button2, { disabled: busy || !routeFor(role).model || !routeFor(role).provider, onClick: () => setConfirmRole(role) }, t("view.startWorker"))
      ),
      h(TaskTeam, { task, project, plan, steps, setSteps, perform, busy: taskBusy }),
      confirmRole && h(
        "section",
        { role: "dialog", "aria-label": t("view.launchDialog"), style: panel3 },
        h("strong", null, t("view.launch", roleLabel(confirmRole))),
        paragraph(t("view.launchSummary", project.name, project.directory, confirmRoute.model, confirmRoute.provider)),
        paragraph(t("view.launchDescription")),
        h("div", { style: row3 }, h(Button2, { disabled: busy, onClick: launch }, t("view.confirmLaunch")), h(Button2, { disabled: busy, onClick: () => setConfirmRole(null) }, t("view.doNotLaunch")))
      ),
      task.summary && h("div", null, h("strong", null, t("view.workerReport")), paragraph(task.summary)),
      task.artifacts.length > 0 && h(
        "div",
        { style: stack3 },
        h("strong", null, t("view.resultFiles")),
        ...task.artifacts.map((file) => h(
          "div",
          { key: file.path, style: stack3 },
          h("code", { style: { overflowWrap: "anywhere" } }, file.path),
          h("small", { style: muted2 }, `${t("view.fileSize", file.bytes)} \xB7 SHA-256 ${file.sha256}`)
        )),
        h(Button2, { disabled: busy, onClick: () => perform(() => ctx.os.revealPath(project.directory)) }, t("view.openResultFolder"))
      ),
      task.specialist_review && h("div", null, h("strong", null, t("view.reviewerConclusion")), paragraph(task.specialist_review.text)),
      task.status === "review" && !task.archived && h(
        "div",
        { style: stack3 },
        h(Button2, { disabled: busy || !routeFor("reviewer").model || !routeFor("reviewer").provider, onClick: () => setConfirmRole("reviewer") }, t("view.orderReview")),
        paragraph(t("view.checksumDescription")),
        field(t("view.reviewField"), h(Textarea, { value: review, rows: 3, maxLength: 16e3, onChange: (e) => setReview(e.target.value), disabled: busy })),
        h("label", { style: row3 }, h("input", { type: "checkbox", checked, disabled: busy || unsettled, onChange: (e) => setChecked(e.target.checked), "aria-label": t("view.reviewCheckbox") }), t("view.reviewCheckbox")),
        h(Button2, { disabled: busy || unsettled || !checked || !review.trim(), onClick: () => perform(() => ctx.rest(`${path}/accept`, { method: "POST", body: { review } })) }, t("view.acceptResult"))
      ),
      task.acceptance_review && paragraph(t("view.userAcceptance", task.acceptance_review.text)),
      ...runs.map((run) => h(
        "section",
        { key: run.id, style: { ...panel3, padding: 10 } },
        h("span", null, `${roleLabel(run.role)} \xB7 ${run.provider} / ${run.model} \xB7 ${statusLabel(run.status)}`),
        h("small", null, t("view.runAttempt", run.attempt || 1, elapsedText(run, Date.now(), t))),
        h("p", { style: muted2 }, usageText(run.usage, t)),
        run.note && paragraph(run.note),
        h(
          "div",
          { style: row3 },
          run.stored_id && h(Button2, { disabled: busy, onClick: () => perform(() => actions.open(run)) }, t("view.openHermes")),
          !task.archived && runUnsettled(run) && run.runtime_id && run.status !== "cancel_requested" && h(Button2, { disabled: busy, onClick: () => perform(() => actions.cancel({ projectId: project.id, run })) }, t("view.requestStop"))
        )
      ))
    );
  }
  function Project({ project, perform, actions, busy, model, provider, catalog }) {
    const { t } = localizer.useI18n();
    const [goal, setGoal] = useState("");
    const [acceptance, setAcceptance] = useState("");
    const [decision, setDecision] = useState("");
    const [search, setSearch] = useState("");
    const [showArchived, setShowArchived] = useState(false);
    const [budget, setBudget] = useState(project.remaining_runs == null ? "" : String(project.remaining_runs));
    const counts = projectSummary(project);
    const addTask = (e) => {
      e.preventDefault();
      perform(async () => {
        await ctx.rest(`/projects/${project.id}/tasks`, { method: "POST", body: { goal, acceptance } });
        setGoal("");
        setAcceptance("");
      });
    };
    return h(
      "section",
      { style: stack3 },
      h("h2", null, project.name),
      h("p", { style: { ...muted2, overflowWrap: "anywhere" } }, project.directory),
      h(
        "section",
        { style: panel3 },
        h("h3", null, t("view.projectNow")),
        paragraph(t("view.projectSummary", counts.active, counts.review, counts.blocked, counts.done, counts.archived)),
        project.decisions.length > 0 && paragraph(t("view.lastDecision", project.decisions.at(-1).text))
      ),
      h(TeamSettings, { project, perform, busy, model, provider, catalog }),
      h(
        "details",
        { style: panel3 },
        h("summary", null, t("view.runLimit")),
        paragraph(t("view.remainingRuns", project.remaining_runs ?? t("view.unlimited"))),
        field(t("view.allowRuns"), h(Input, { type: "number", min: 0, max: 1e4, value: budget, placeholder: t("view.emptyUnlimited"), disabled: busy, onChange: (e) => setBudget(e.target.value) })),
        h(Button2, { disabled: busy || budget !== "" && (!Number.isInteger(Number(budget)) || Number(budget) < 0 || Number(budget) > 1e4), onClick: () => perform(() => ctx.rest(`/projects/${project.id}/budget`, { method: "POST", body: { remaining: budget === "" ? null : Number(budget), confirm: true } })) }, t("view.confirmRunLimit"))
      ),
      h(
        "form",
        { style: panel3, onSubmit: addTask },
        h("h3", null, t("view.newTask")),
        h(Button2, { type: "button", disabled: busy || Boolean(goal || acceptance), onClick: () => {
          const demo = demoTaskFor(t);
          setGoal(demo.goal);
          setAcceptance(demo.acceptance);
        } }, t("view.fillDemo")),
        h("p", { style: muted2 }, t("view.demoDescription")),
        field(t("view.desiredOutcome"), h(Textarea, { required: true, value: goal, rows: 3, maxLength: 16e3, onChange: (e) => setGoal(e.target.value), disabled: busy })),
        field(t("view.readinessCheck"), h(Textarea, { required: true, value: acceptance, rows: 3, maxLength: 16e3, onChange: (e) => setAcceptance(e.target.value), disabled: busy })),
        h(Button2, { type: "submit", disabled: busy || !goal.trim() || !acceptance.trim() }, t("view.createTask"))
      ),
      field(t("view.searchTasks"), h(Input, { value: search, onChange: (e) => setSearch(e.target.value) })),
      h("label", { style: row3 }, h("input", { type: "checkbox", checked: showArchived, onChange: (e) => setShowArchived(e.target.checked), "aria-label": t("view.showArchive") }), t("view.showArchive")),
      ...project.tasks.filter((task) => Boolean(task.archived) === showArchived && `${task.goal} ${task.acceptance}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).slice().reverse().map((task) => h(Task, { key: `${task.id}:${task.attempt || 1}`, task, project, perform, actions, busy, model, provider })),
      h(
        "section",
        { style: panel3 },
        h("h3", null, t("view.projectDecisions")),
        ...project.decisions.map((item) => h("div", { key: item.id }, paragraph(item.text))),
        h(
          "form",
          { style: stack3, onSubmit: (e) => {
            e.preventDefault();
            perform(async () => {
              await ctx.rest(`/projects/${project.id}/decisions`, { method: "POST", body: { text: decision } });
              setDecision("");
            });
          } },
          field(t("view.newDecision"), h(Textarea, { required: true, value: decision, maxLength: 16e3, onChange: (e) => setDecision(e.target.value), disabled: busy })),
          h(Button2, { type: "submit", disabled: busy || !decision.trim() }, t("view.saveDecision"))
        )
      )
    );
  }
  function Workspace({ profile, gateway, epoch, connectionId }) {
    const { t } = localizer.useI18n();
    const LanguageSelector = localizer.LanguageSelector;
    const [mode, setMode] = useState("mission");
    const queryClient = useQueryClient();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [name, setName] = useState("");
    const [directory, setDirectory] = useState("");
    const [model, setModel] = useState(() => typeof host2.state.model.get() === "string" ? host2.state.model.get() : "");
    const [provider, setProvider] = useState("");
    const live = useRef(true);
    const selected = useRef(null);
    useEffect(() => {
      live.current = true;
      return () => {
        live.current = false;
      };
    }, []);
    const queryKey = ["altron", connectionId, profile, epoch];
    const workspace = useQuery({ queryKey: [...queryKey, "workspace"], queryFn: () => ctx.rest("/workspace"), enabled: gateway === "open", retry: false, refetchInterval: 5e3 });
    const catalog = useQuery({ queryKey: [...queryKey, "specialists"], queryFn: () => ctx.rest("/specialists"), enabled: gateway === "open", retry: false });
    const pid = workspace.data?.selected_project_id;
    selected.current = pid;
    const project = useQuery({ queryKey: [...queryKey, "project", pid], queryFn: () => ctx.rest(`/projects/${pid}`), enabled: gateway === "open" && Boolean(pid), retry: false, refetchInterval: 5e3 });
    const actions = useMemo(() => createActions({
      api: (...args) => ctx.rest(...args),
      rpc: (...args) => host2.request(...args),
      openSession: (id) => host2.openSession(id),
      getConnectionId: () => host2.state.connectionId.get(),
      getProfile: () => host2.state.profile.get(),
      onEvent: (...args) => host2.onEvent(...args),
      onDispose: (fn) => ctx.onDispose(fn),
      onTrackingError: () => host2.notify({ kind: "error", message: t("view.trackingError") }),
      t,
      isCurrent: () => live.current && host2.state.profile.get() === profile && host2.state.gateway.get() === "open" && selected.current === pid
    }), [profile, pid, t]);
    const refresh = () => queryClient.invalidateQueries({ queryKey });
    const perform = async (work) => {
      if (busy || !live.current) return;
      setBusy(true);
      setError("");
      try {
        await work();
      } catch (failure2) {
        if (live.current) {
          const code = errorCodes2.find((value) => String(failure2?.message).includes(value));
          setError(code ? t(`view.errors.${code}`) : t("view.genericError"));
        }
      } finally {
        if (live.current) {
          setBusy(false);
          await refresh();
        }
      }
    };
    const addProject = (e) => {
      e.preventDefault();
      perform(async () => {
        const created = await ctx.rest("/projects", { method: "POST", body: { name, directory } });
        if (!live.current) return;
        await ctx.rest(`/projects/${created.id}/select`, { method: "POST" });
        setName("");
        setDirectory("");
      });
    };
    return h(
      "main",
      { style: { ...stack3, padding: 24, maxWidth: 1080, margin: "0 auto", overflow: "auto", height: "100%" } },
      h(
        "header",
        { style: stack3 },
        h("div", { style: { ...row3, justifyContent: "space-between" } }, h("h1", null, "Altron"), LanguageSelector && h(LanguageSelector)),
        h("p", { style: muted2 }, t("view.headerDescription"))
      ),
      gateway !== "open" && h("p", { role: "status" }, t("view.noConnection")),
      workspace.isLoading && h("p", { role: "status" }, t("view.loading")),
      workspace.error && h("p", { role: "alert" }, t("view.apiUnavailable")),
      error && h("p", { role: "alert" }, error),
      h("nav", { style: row3, "aria-label": t("view.modeLabel") }, ...[["mission", t("view.autonomousMode")], ["manual", t("view.manualMode")]].map(([value, label]) => h(Button2, { key: value, variant: mode === value ? "secondary" : "ghost", "aria-pressed": mode === value, onClick: () => setMode(value) }, label))),
      h(Button2, { disabled: busy || gateway !== "open", onClick: refresh }, t("view.refresh")),
      workspace.data && h(Connections, { profile, queryKey, gateway, model, provider, setModel, setProvider, busy }),
      workspace.data && mode === "mission" && h(MissionView, { key: workspace.data.workspace_id, profile, gateway, connectionId, queryKey, workspaceId: workspace.data.workspace_id, model, provider }),
      workspace.data && mode === "manual" && h(
        React2.Fragment,
        null,
        workspace.data.projects.length > 0 && field(t("view.currentProject"), h(
          "select",
          { "aria-label": t("view.currentProject"), value: pid || "", disabled: busy, onChange: (e) => perform(() => ctx.rest(`/projects/${e.target.value}/select`, { method: "POST" })), style: { color: "inherit", background: "var(--ui-background)", padding: 10 } },
          h("option", { value: "", disabled: true }, t("view.chooseProject")),
          ...workspace.data.projects.map((p) => h("option", { key: p.id, value: p.id }, p.name))
        )),
        h(
          "details",
          { open: workspace.data.projects.length === 0, style: panel3 },
          h("summary", null, t("view.addProject")),
          h(
            "form",
            { onSubmit: addProject, style: stack3 },
            field(t("view.projectName"), h(Input, { required: true, value: name, maxLength: 200, onChange: (e) => setName(e.target.value), disabled: busy })),
            field(t("view.projectFolder"), h(Input, { required: true, value: directory, placeholder: t("view.projectFolderPlaceholder"), maxLength: 4096, onChange: (e) => setDirectory(e.target.value), disabled: busy })),
            h(FolderPicker, { directory, onChoose: setDirectory, busy }),
            h("p", { style: muted2 }, t("view.folderWarning")),
            h(Button2, { type: "submit", disabled: busy || !name.trim() || !directory.trim() }, t("view.createProject"))
          )
        ),
        project.error && h("p", { role: "alert" }, t("view.projectUnavailable")),
        pid && project.data?.id === pid && (project.data.autonomy_id ? paragraph(t("view.autonomousProjectNotice")) : h(Project, { key: pid, project: project.data, perform, actions, busy, model, provider, catalog: catalog.data }))
      ),
      h(Maintenance, { queryKey, gateway }),
      h(Diagnostics, { perform, busy: busy || gateway !== "open" })
    );
  }
  return function Altron() {
    const profile = useValue(host2.state.profile);
    const gateway = useValue(host2.state.gateway);
    const connectionId = useValue(host2.state.connectionId);
    const [epoch, setEpoch] = useState(0);
    useEffect(() => {
      let previousEpoch;
      return host2.onEvent("gateway.ready", (event) => {
        const nextEpoch = event.payload?.replay_epoch ?? null;
        if (previousEpoch !== void 0 && (nextEpoch === null || nextEpoch !== previousEpoch)) setEpoch((value) => value + 1);
        previousEpoch = nextEpoch;
      });
    }, [connectionId, profile]);
    return h(Workspace, { key: JSON.stringify([connectionId, profile, epoch]), profile, gateway, epoch, connectionId });
  };
}

// altron/ui/team.mjs
function createCoordinator(options) {
  const { api, rpc, getConnectionId, getProfile, isConnected, onEvent, onScopeChange, onError } = options;
  const jobs = /* @__PURE__ */ new Map();
  let disposed = false;
  const owner = () => JSON.stringify([getConnectionId(), getProfile()]);
  const keyFor = ({ projectId, taskId }) => JSON.stringify([owner(), projectId, taskId]);
  const close = (job) => {
    job.enabled = false;
    for (const stop of job.stops) stop();
    if (jobs.get(job.key) === job) jobs.delete(job.key);
  };
  const check = (source) => {
    if (disposed || !isConnected() || owner() !== source) throw new Error("scope_changed");
  };
  const invalidate = () => {
    for (const job of jobs.values()) close(job);
  };
  const unsubscribe = onScopeChange(invalidate);
  async function pump(job) {
    if (!job.enabled) return;
    if (job.pumping) {
      job.pending = true;
      return;
    }
    job.pumping = true;
    try {
      do {
        job.pending = false;
        check(job.owner);
        const run = await job.actions.start({ ...job.ids, team: true });
        if (!run) close(job);
      } while (job.pending && job.enabled);
    } catch (error) {
      close(job);
      throw error;
    } finally {
      job.pumping = false;
    }
  }
  return {
    async start(ids) {
      const key = keyFor(ids), source = owner();
      check(source);
      if (jobs.has(key)) throw new Error("run_already_starting");
      const job = { key, owner: source, ids, enabled: true, pumping: false, pending: false, stops: [] };
      jobs.set(key, job);
      job.actions = createActions({
        api,
        rpc,
        getConnectionId,
        getProfile,
        onEvent,
        isCurrent: () => job.enabled && !disposed && isConnected(),
        onDispose: (stop) => job.stops.push(stop),
        onTrackingError: (error) => {
          close(job);
          onError(error);
        },
        onTerminal: async ({ status }) => {
          if (status !== "complete" || !job.enabled) {
            close(job);
            return;
          }
          await pump(job);
        }
      });
      try {
        await api(`/projects/${encodeURIComponent(ids.projectId)}/tasks/${encodeURIComponent(ids.taskId)}/team/resume`, { method: "POST" });
        check(source);
        await pump(job);
      } catch (error) {
        close(job);
        throw error;
      }
    },
    async pause(ids) {
      const source = owner();
      check(source);
      const job = jobs.get(keyFor(ids));
      if (job) job.enabled = false;
      const result = await api(`/projects/${encodeURIComponent(ids.projectId)}/tasks/${encodeURIComponent(ids.taskId)}/team/pause`, { method: "POST" });
      check(source);
      if (result.active_run?.runtime_id) await rpc("session.interrupt", { session_id: result.active_run.runtime_id });
      else if (job) close(job);
    },
    dispose() {
      disposed = true;
      unsubscribe();
      invalidate();
    }
  };
}

// altron/ui/main.mjs
var main_default = {
  id: "altron",
  name: "Altron",
  version: "0.5.0-beta.2",
  description: "Projects, approved tasks, specialists, and result verification.",
  defaultEnabled: false,
  register(ctx) {
    const i18n = createI18n(React, sdk, ctx, "altron");
    const coordinator = createCoordinator({
      api: (...args) => ctx.rest(...args),
      rpc: (...args) => sdk.host.request(...args),
      getConnectionId: () => sdk.host.state.connectionId.get(),
      getProfile: () => sdk.host.state.profile.get(),
      isConnected: () => sdk.host.state.gateway.get() === "open",
      onEvent: (...args) => sdk.host.onEvent(...args),
      onScopeChange: (fn) => {
        const stops = [sdk.host.state.connectionId, sdk.host.state.profile, sdk.host.state.gateway].map((atom) => atom.subscribe(fn));
        stops.push(sdk.host.onEvent("gateway.ready", fn));
        return () => {
          for (const stop of stops) stop();
        };
      },
      onError: () => sdk.host.notify({ kind: "error", message: ctx.i18n.t("plugin.teamError") })
    });
    ctx.onDispose(() => coordinator.dispose());
    const View = createView(React, sdk, ctx, coordinator, i18n);
    const App = () => React.createElement(i18n.Provider, null, React.createElement(View));
    if (typeof sdk.host.openWorkspace !== "function") throw new Error("Altron requires Hermes Desktop with the openWorkspace SDK.");
    let close;
    const open = () => {
      if (close) {
        sdk.host.revealPane("plugin-workspace:altron");
        return;
      }
      close = sdk.host.openWorkspace("altron", { title: "Altron", render: () => React.createElement(App), onClose: () => {
        close = null;
      } });
    };
    ctx.onDispose(() => close?.());
    ctx.register({ id: "button", area: "statusBar.left", render: () => React.createElement(sdk.Button, { onClick: open, variant: "ghost", size: "sm" }, "Altron") });
    ctx.register({ id: "open", area: sdk.PALETTE_AREA, data: { id: "altron.open", label: ctx.i18n.t("plugin.open"), keywords: ["altron", "projects", "\u043F\u0440\u043E\u0435\u043A\u0442\u044B"], run: open } });
  }
};
export {
  main_default as default
};
