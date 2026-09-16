// altron/ui/main.mjs
import React from "react";
import * as sdk from "@hermes/plugin-sdk";

// altron/ui/actions.mjs
function createActions({ api, rpc, isCurrent, getConnectionId, getProfile, onEvent, onDispose, onTrackingError, onTerminal, openSession }) {
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
              note: submitted ? "\u041E\u0442\u0432\u0435\u0442 \u043D\u0430 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0443 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u0430 \u043D\u0435\u0442." : "\u0417\u0430\u043F\u0443\u0441\u043A \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D \u0434\u043E \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u0437\u0430\u0434\u0430\u043D\u0438\u044F. \u041C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u043F\u043E\u0434\u043C\u0435\u043D\u044F\u043B\u0430\u0441\u044C."
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
        note: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u0437\u0430\u043F\u0440\u043E\u0441\u0438\u043B \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0443. \u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435 \u0435\u0449\u0451 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E."
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

// altron/ui/team-view.mjs
var roles = { altron: "Altron \u2014 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u043F\u043B\u0430\u043D", technical: "\u0422\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0440\u0430\u0431\u043E\u0442\u0430", business: "\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u0431\u0438\u0437\u043D\u0435\u0441", memory: "\u0420\u0435\u0448\u0435\u043D\u0438\u044F \u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044F", reviewer: "\u041E\u0442\u0434\u0435\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430" };
var states = { blocked: "\u0428\u0430\u0433 \u043D\u0435 \u043D\u0430\u0447\u0430\u0442: \u0444\u0430\u0439\u043B\u044B \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0433\u043E \u0448\u0430\u0433\u0430 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B", ready: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u0437\u0430\u043F\u0443\u0441\u043A\u0430", running: "\u041A\u043E\u043C\u0430\u043D\u0434\u0430 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442", paused: "\u041D\u0430 \u043F\u0430\u0443\u0437\u0435", unknown: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E \u2014 \u043F\u043E\u0432\u0442\u043E\u0440 \u0437\u0430\u043F\u0440\u0435\u0449\u0451\u043D", failed: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E \u0441 \u043E\u0448\u0438\u0431\u043A\u043E\u0439", review: "\u0412\u0441\u0435 \u0448\u0430\u0433\u0438 \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u044B \u2014 \u043D\u0443\u0436\u043D\u0430 \u043F\u0440\u0438\u0451\u043C\u043A\u0430", done: "\u041F\u0440\u0438\u043D\u044F\u0442\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C", pending: "\u0415\u0449\u0451 \u043D\u0435 \u043D\u0430\u0447\u0430\u0442", prepared: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D", reported: "\u0424\u0430\u0439\u043B\u044B \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u044B, \u043E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435", complete: "\u0428\u0430\u0433 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D", cancel_requested: "\u0417\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u0430 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430" };
var stack = { display: "grid", gap: 10 };
var row = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" };
var panel = { ...stack, padding: 12, border: "1px solid var(--ui-stroke-secondary)", borderRadius: 8 };
var selectStyle = { color: "inherit", background: "var(--ui-background)", padding: 8 };
function createTeamViews(React2, sdk2, ctx, coordinator) {
  const { createElement: h, useEffect, useState } = React2;
  const { Button: Button2, Input, Textarea } = sdk2;
  const field = (name, control) => h("label", { style: stack }, h("span", null, name), React2.cloneElement(control, { "aria-label": name }));
  const routeText = (route) => route?.model && route?.provider ? `${route.provider} / ${route.model}${route.specialist?.name ? ` \xB7 ${route.specialist.name}` : ""}` : "\u041C\u043E\u0434\u0435\u043B\u044C \u0434\u043B\u044F \u0440\u043E\u043B\u0438 \u043D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0430";
  function TeamSettings({ project, perform, busy, model, provider, catalog }) {
    const saved = JSON.stringify(project.team || {});
    const [routes, setRoutes] = useState(() => JSON.parse(saved));
    useEffect(() => setRoutes(JSON.parse(saved)), [saved]);
    const change = (role, key, value) => setRoutes((previous) => ({ ...previous, [role]: { ...previous[role], [key]: value } }));
    const assignments = Object.fromEntries(Object.entries(routes).filter(([, route]) => route.model || route.provider || route.specialist).map(([role, route]) => [role, { model: route.model || "", provider: route.provider || "", specialist: route.specialist || null }]));
    const valid = Object.values(assignments).every((route) => route.model.trim() && route.provider.trim());
    return h(
      "details",
      { style: panel },
      h("summary", null, "\u0421\u043E\u0441\u0442\u0430\u0432 \u043A\u043E\u043C\u0430\u043D\u0434\u044B"),
      h("p", null, "\u0420\u043E\u043B\u0438 \u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430. \u041F\u0443\u0441\u0442\u044B\u0435 \u0440\u043E\u043B\u0438 \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u044E\u0442\u0441\u044F. \u0417\u0434\u0435\u0441\u044C \u043D\u0435\u0442 \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0449\u0438\u0445 \u043A\u0440\u0443\u0433\u043B\u043E\u0441\u0443\u0442\u043E\u0447\u043D\u043E \u043C\u043E\u0434\u0435\u043B\u0435\u0439. \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u0441\u043E\u0441\u0442\u0430\u0432\u0430 \u043D\u0435 \u043C\u0435\u043D\u044F\u0435\u0442 \u0443\u0436\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u043F\u043B\u0430\u043D\u044B."),
      h(Button2, { disabled: busy || !model || !provider, onClick: () => setRoutes((previous) => ({ ...previous, ...Object.fromEntries(["altron", "technical", "business", "memory"].map((role) => [role, { ...previous[role], model, provider }])) })) }, "\u041D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0432\u0441\u0435\u043C \u0440\u043E\u043B\u044F\u043C, \u043A\u0440\u043E\u043C\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0449\u0435\u0433\u043E"),
      ...Object.entries(roles).map(([role, label]) => h(
        "section",
        { key: role, style: panel },
        h("strong", null, label),
        field(`\u041C\u043E\u0434\u0435\u043B\u044C \u2014 ${label}`, h(Input, { value: routes[role]?.model || "", maxLength: 300, disabled: busy, onChange: (e) => change(role, "model", e.target.value) })),
        field(`\u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440 \u2014 ${label}`, h(Input, { value: routes[role]?.provider || "", maxLength: 100, disabled: busy, onChange: (e) => change(role, "provider", e.target.value) })),
        field(`\u0418\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u0438 \u2014 ${label}`, h(
          "select",
          { "aria-label": `\u0418\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u0438 \u2014 ${label}`, value: routes[role]?.specialist || "", disabled: busy, style: selectStyle, onChange: (e) => change(role, "specialist", e.target.value) },
          h("option", { value: "" }, "\u041E\u0441\u043D\u043E\u0432\u043D\u0430\u044F \u0440\u043E\u043B\u044C Altron"),
          ...(catalog?.specialists || []).filter((s) => s.role === role).map((s) => h("option", { key: s.id, value: s.id }, s.name))
        )),
        routes[role]?.specialist && h("p", null, "\u0412\u044B\u0431\u0440\u0430\u043D\u044B \u0430\u0434\u0430\u043F\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0438\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u0438 agency-agents. \u041E\u043D\u0438 \u043D\u0435 \u0434\u0430\u044E\u0442 \u043D\u043E\u0432\u044B\u0445 \u0434\u043E\u0441\u0442\u0443\u043F\u043E\u0432 \u0438 \u043D\u0435 \u0437\u0430\u043C\u0435\u043D\u044F\u044E\u0442 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u0438\u0435."),
        h(Button2, { disabled: busy, onClick: () => setRoutes((previous) => {
          const next = { ...previous };
          delete next[role];
          return next;
        }) }, `\u0423\u0431\u0440\u0430\u0442\u044C \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u2014 ${label}`)
      )),
      !valid && h("p", { role: "status" }, "\u0414\u043B\u044F \u043A\u0430\u0436\u0434\u043E\u0439 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u043E\u0439 \u0440\u043E\u043B\u0438 \u043D\u0443\u0436\u043D\u044B \u0438 \u043C\u043E\u0434\u0435\u043B\u044C, \u0438 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440."),
      h(Button2, { disabled: busy || !valid, onClick: () => perform(() => ctx.rest(`/projects/${project.id}/team`, { method: "POST", body: { assignments } })) }, "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0441\u043E\u0441\u0442\u0430\u0432 \u043A\u043E\u043C\u0430\u043D\u0434\u044B"),
      catalog?.source_commit && h("p", { style: { overflowWrap: "anywhere" } }, `\u0418\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u0438 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u044B: ${catalog.source_commit}. \u041B\u0438\u0446\u0435\u043D\u0437\u0438\u044F MIT; \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438 \u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u2014 \u0432 THIRD_PARTY_NOTICES.md.`)
    );
  }
  function TaskTeam({ task, project, plan, steps, setSteps, perform, busy }) {
    const [confirm, setConfirm] = useState(false);
    const ids = { projectId: project.id, taskId: task.id };
    const path = `/projects/${project.id}/tasks/${task.id}/team`;
    if (!task.team && task.status !== "draft") return null;
    const update = (index, key, value) => setSteps((previous) => previous.map((step, i) => i === index ? { ...step, [key]: value } : step));
    if (task.status === "draft") return h(
      "details",
      { style: panel, open: steps.length > 0 },
      h("summary", null, "\u041F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0441\u0442\u043E\u0432"),
      h("p", null, "\u041D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E: \u0440\u0430\u0437\u0431\u0435\u0439\u0442\u0435 \u043F\u043B\u0430\u043D \u043D\u0430 \u0448\u0430\u0433\u0438. Altron \u043F\u0435\u0440\u0435\u0434\u0430\u0441\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u043C\u0443 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044E \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0433\u043E. \u041F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0449\u0438\u0439 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E."),
      ...steps.map((step, index) => h(
        "section",
        { key: index, style: panel },
        field(`\u0420\u043E\u043B\u044C \u0448\u0430\u0433\u0430 ${index + 1}`, h(
          "select",
          { "aria-label": `\u0420\u043E\u043B\u044C \u0448\u0430\u0433\u0430 ${index + 1}`, value: step.role, disabled: busy, style: selectStyle, onChange: (e) => update(index, "role", e.target.value) },
          ...["technical", "business", "memory"].map((role) => h("option", { key: role, value: role }, roles[role]))
        )),
        h("p", null, routeText(project.team?.[step.role])),
        field(`\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0448\u0430\u0433\u0430 ${index + 1}`, h(Textarea, { value: step.goal, maxLength: 16e3, disabled: busy, onChange: (e) => update(index, "goal", e.target.value) })),
        field(`\u041A\u0440\u0438\u0442\u0435\u0440\u0438\u0438 \u0448\u0430\u0433\u0430 ${index + 1}`, h(Textarea, { value: step.acceptance, maxLength: 16e3, disabled: busy, onChange: (e) => update(index, "acceptance", e.target.value) })),
        h(Button2, { disabled: busy, onClick: () => setSteps((previous) => previous.filter((_, i) => i !== index)) }, `\u0423\u0431\u0440\u0430\u0442\u044C \u0448\u0430\u0433 ${index + 1}`)
      )),
      h(Button2, { disabled: busy || steps.length >= 8, onClick: () => setSteps((previous) => [...previous, { role: "technical", goal: "", acceptance: "" }]) }, "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0448\u0430\u0433"),
      steps.length > 0 && h(Button2, { disabled: busy || !plan.trim() || steps.some((step) => !step.goal.trim() || !step.acceptance.trim() || !project.team?.[step.role]), onClick: () => perform(() => ctx.rest(`${path}/approve`, { method: "POST", body: { plan, steps } })) }, "\u0421\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u0442\u044C \u043A\u043E\u043C\u0430\u043D\u0434\u043D\u044B\u0439 \u043F\u043B\u0430\u043D")
    );
    const team = task.team;
    if (!team) return null;
    const resumable = ["ready", "paused"].includes(team.status) && team.steps.every((step) => !step.run_id || step.status === "complete");
    return h(
      "section",
      { style: panel },
      h("strong", null, `\u0421\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u0430\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u0430: ${states[team.status] || team.status}`),
      team.note && h("p", { role: "status" }, team.note),
      ...team.steps.map((step, index) => h(
        "div",
        { key: index, style: stack },
        h("strong", null, `${index + 1}. ${roles[step.role]} \u2014 ${step.goal}`),
        h("span", null, `\u041A\u0440\u0438\u0442\u0435\u0440\u0438\u0438: ${step.acceptance}`),
        h("span", null, routeText(step)),
        h("span", null, states[step.status] || step.status)
      )),
      h("p", null, "\u041F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0449\u0438\u0439 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u043C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435\u043C. \u0418\u0442\u043E\u0433\u043E\u0432\u0443\u044E \u0440\u0430\u0431\u043E\u0442\u0443 \u043F\u0440\u0438\u043D\u0438\u043C\u0430\u0435\u0442 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C, \u0430 \u043D\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u0430."),
      resumable && h(Button2, { disabled: busy || !coordinator, onClick: () => setConfirm(true) }, team.status === "ready" ? "\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u0443\u044E \u043A\u043E\u043C\u0430\u043D\u0434\u0443" : "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u043F\u043E\u0441\u043B\u0435 \u043F\u0430\u0443\u0437\u044B"),
      team.status === "running" && h(Button2, { disabled: busy || !coordinator, onClick: () => perform(() => coordinator.pause(ids)) }, "\u041F\u0440\u0438\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043A\u043E\u043C\u0430\u043D\u0434\u0443 \u0438 \u0437\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0443"),
      confirm && h(
        "section",
        { role: "dialog", "aria-label": "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u043A\u043E\u043C\u0430\u043D\u0434\u044B", style: panel },
        h("strong", null, `\u041F\u0440\u043E\u0435\u043A\u0442: ${project.name}`),
        h("p", null, project.directory),
        h("p", null, "\u0411\u0443\u0434\u0443\u0442 \u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0435 \u0432\u044B\u0448\u0435 \u0448\u0430\u0433\u0438 \u043D\u0430 \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0445 \u043C\u043E\u0434\u0435\u043B\u044F\u0445. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u044B \u0440\u0430\u0441\u0445\u043E\u0434\u044B \u0432\u0430\u0448\u0435\u0433\u043E \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430. \u041F\u0440\u0438 \u043E\u0448\u0438\u0431\u043A\u0435 \u0438\u043B\u0438 \u0441\u043C\u0435\u043D\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044F \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F; \u0441\u043A\u0440\u044B\u0442\u044B\u0445 \u043F\u043E\u0432\u0442\u043E\u0440\u043E\u0432 \u043D\u0435\u0442."),
        h(
          "div",
          { style: row },
          h(Button2, { disabled: busy, onClick: () => perform(async () => {
            setConfirm(false);
            await coordinator.start(ids);
          }) }, "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u0437\u0430\u043F\u0443\u0441\u043A \u043A\u043E\u043C\u0430\u043D\u0434\u044B"),
          h(Button2, { disabled: busy, onClick: () => setConfirm(false) }, "\u041D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0442\u044C")
        )
      )
    );
  }
  return { TeamSettings, TaskTeam };
}

// altron/ui/maintenance-view.mjs
var messages = {
  active_operations: "\u0415\u0441\u0442\u044C \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0449\u0438\u0435, \u043F\u0440\u0438\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u0435 \u0438\u043B\u0438 \u043D\u0435\u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0438. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u0438\u0445; \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043D\u0435 \u043D\u0430\u0447\u0430\u043B\u043E\u0441\u044C.",
  archive_checksum_mismatch: "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u0430\u044F \u0441\u0443\u043C\u043C\u0430 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u043B\u0430. \u0421\u043A\u0430\u0447\u0430\u0439\u0442\u0435 \u0430\u0440\u0445\u0438\u0432 \u0438 SHA256SUMS.txt \u0438\u0437 \u043E\u0434\u043D\u043E\u0433\u043E \u0432\u044B\u043F\u0443\u0441\u043A\u0430.",
  invalid_archive_path: "\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u043E\u0431\u044B\u0447\u043D\u044B\u0439 \u0444\u0430\u0439\u043B \u0430\u0440\u0445\u0438\u0432\u0430 \u043F\u043E \u043F\u043E\u043B\u043D\u043E\u043C\u0443 \u043F\u0443\u0442\u0438 \u043D\u0430 \u044D\u0442\u043E\u043C \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0435.",
  lock_exists: "\u041E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0434\u0440\u0443\u0433\u043E\u0439 \u0438\u043B\u0438 \u043F\u0440\u0435\u0440\u0432\u0430\u043D\u043D\u043E\u0439 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0435\u0439. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u0441\u043D\u044F\u0442\u0438\u044F \u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u043A\u0438 \u043D\u0435\u0442.",
  code_changed: "\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u044B \u043F\u043E\u0441\u043B\u0435 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F. \u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D, \u0432\u0430\u0448\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043D\u0435 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0438\u0441\u0430\u043D\u044B.",
  backup_invalid: "\u0420\u0435\u0437\u0435\u0440\u0432\u043D\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u043F\u043E\u0432\u0440\u0435\u0436\u0434\u0435\u043D\u0430. \u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D.",
  recovery_required: "\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0430\u044F \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u043D\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430. \u041D\u043E\u0432\u044B\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u044F \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D\u044B \u0434\u043E \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F."
};
var states2 = { idle: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0439 \u0435\u0449\u0451 \u043D\u0435 \u0431\u044B\u043B\u043E", staged: "\u041F\u0430\u043A\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D", applied: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E", rolled_back: "\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u0439 \u043A\u043E\u0434 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D", recovery_required: "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435" };
function createMaintenanceView(React2, sdk2, ctx) {
  const { createElement: h, useState, useEffect, useRef } = React2;
  const { Button: Button2, Input, useQuery, useQueryClient } = sdk2;
  const grid = { display: "grid", gap: 10 };
  return function Maintenance({ queryKey, gateway }) {
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
          if (result.requires_restart) sdk2.host.notify({ kind: "info", message: "Altron: \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u0437\u0430\u043A\u0440\u043E\u0439\u0442\u0435 Hermes Desktop \u0438 \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0441\u043D\u043E\u0432\u0430. \u0414\u043E \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u043D\u043E\u0432\u044B\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u044F \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u044B." });
        }
      } catch (failure) {
        if (live.current) {
          const code = Object.keys(messages).find((value) => String(failure?.message).includes(value));
          setError(code ? messages[code] : "\u041F\u0430\u043A\u0435\u0442 \u0438\u043B\u0438 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u043D\u0435 \u043F\u0440\u043E\u0448\u043B\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443. \u0424\u0430\u0439\u043B\u044B \u043D\u0435 \u0441\u0447\u0438\u0442\u0430\u044E\u0442\u0441\u044F \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D\u043D\u044B\u043C\u0438. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0430\u0440\u0445\u0438\u0432 \u0432\u044B\u043F\u0443\u0441\u043A\u0430 \u0438 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u044F.");
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
      h("summary", null, "\u041E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0435 Altron"),
      h("p", null, "\u0421\u043A\u0430\u0447\u0430\u0439\u0442\u0435 \u0430\u0440\u0445\u0438\u0432 Altron \u0438 SHA256SUMS.txt \u0438\u0437 \u043E\u0434\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0433\u043E \u0432\u044B\u043F\u0443\u0441\u043A\u0430 GitHub. \u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043C\u0435\u043D\u044F\u0435\u0442 \u043A\u043E\u0434 Altron, \u043D\u043E \u043D\u0435 \u0432\u0430\u0448\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u044B, \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438. \u041A\u043E\u043F\u0438\u044F \u0431\u0430\u0437\u044B \u0438 \u0441\u0442\u0430\u0440\u043E\u0433\u043E \u043A\u043E\u0434\u0430 \u0441\u043E\u0437\u0434\u0430\u0451\u0442\u0441\u044F \u0434\u043E \u0437\u0430\u043C\u0435\u043D\u044B."),
      h("p", null, "\u041E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u0441\u0435\u0440\u0432\u0435\u0440 Hermes. \u0414\u043B\u044F \u043E\u0431\u044B\u0447\u043D\u043E\u0439 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u044D\u0442\u043E \u0432\u0430\u0448 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440. \u041A\u043E\u0434 \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430 \u043E\u0431\u0449\u0438\u0439 \u0434\u043B\u044F \u0435\u0433\u043E \u043F\u0440\u043E\u0444\u0438\u043B\u0435\u0439. \u041F\u0435\u0440\u0435\u0434 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435\u043C \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u0440\u0430\u0431\u043E\u0442\u0443 \u0432\u043E \u0432\u0441\u0435\u0445 \u043E\u043A\u043D\u0430\u0445 Altron."),
      state.data && h("p", { role: "status" }, states2[state.data.status] || "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E"),
      state.error && h("p", { role: "alert" }, "\u041E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0432 \u044D\u0442\u043E\u043C \u043F\u0440\u043E\u0444\u0438\u043B\u0435. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0443 \u043F\u0430\u043A\u0435\u0442\u0430 Altron."),
      state.data?.requires_restart && h("p", { role: "alert" }, "\u041F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u0437\u0430\u043A\u0440\u043E\u0439\u0442\u0435 Hermes Desktop \u0438 \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0441\u043D\u043E\u0432\u0430. \u041D\u043E\u0432\u044B\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u044F \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u044B \u0434\u043E \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u043A\u0430."),
      error && h("p", { role: "alert" }, error),
      field("\u041F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A \u0430\u0440\u0445\u0438\u0432\u0443 Altron", archive, setArchive),
      field("\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u0430\u044F \u0441\u0443\u043C\u043C\u0430 SHA-256", sha256, setSha256),
      h(Button2, { disabled: blocked || !archive.trim() || !/^[0-9a-f]{64}$/.test(sha256), onClick: () => perform("stage", { archive_path: archive, sha256 }) }, "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u0430\u043A\u0435\u0442"),
      stage && h("section", { style: grid }, h("strong", null, `\u041F\u0440\u043E\u0432\u0435\u0440\u0435\u043D \u043F\u0430\u043A\u0435\u0442 ${stage.version}`), h("p", null, `${stage.files.length} \u0444\u0430\u0439\u043B\u043E\u0432 \u043A\u043E\u0434\u0430. \u0414\u043E \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u043E\u043D\u0438 \u043D\u0435 \u0437\u0430\u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F.`), h(Button2, { disabled: blocked, onClick: () => setConfirm("apply") }, "\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u043F\u0430\u043A\u0435\u0442")),
      state.data?.backup_id && h(Button2, { disabled: busy || gateway !== "open", onClick: () => setConfirm("rollback") }, "\u0412\u0435\u0440\u043D\u0443\u0442\u044C \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u0439 \u043A\u043E\u0434"),
      confirm && h(
        "section",
        { role: "dialog", "aria-label": "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u044F", style: grid },
        h("p", null, confirm === "apply" ? "\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u043F\u0430\u043A\u0435\u0442? \u041F\u043E\u0441\u043B\u0435 \u0437\u0430\u043C\u0435\u043D\u044B \u043F\u043E\u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u043A Hermes Desktop." : "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u0439 \u043A\u043E\u0434? \u0422\u0435\u043A\u0443\u0449\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u044B \u0438 \u0431\u0430\u0437\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F. \u041F\u043E\u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u043A Hermes Desktop."),
        h(Button2, { disabled: busy, onClick: () => perform(confirm, confirm === "apply" ? { stage_id: stage.id, confirm: true } : { confirm: true }) }, "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u043E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0435"),
        h(Button2, { disabled: busy, onClick: () => setConfirm(null) }, "\u041E\u0442\u043C\u0435\u043D\u0430")
      )
    );
  };
}

// altron/ui/view.mjs
var statuses = { team_waiting: "\u041F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u043C\u0435\u0436\u0434\u0443 \u0448\u0430\u0433\u0430\u043C\u0438 \u043A\u043E\u043C\u0430\u043D\u0434\u044B", interrupted: "\u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E", draft: "\u041D\u0443\u0436\u0435\u043D \u043F\u043B\u0430\u043D", approved: "\u041F\u043B\u0430\u043D \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D", launching: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u0437\u0430\u043F\u0443\u0441\u043A\u0430", planning: "Altron \u0441\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 \u043F\u043B\u0430\u043D", running: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435", reviewing: "\u0418\u0434\u0451\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430", review: "\u041D\u0443\u0436\u043D\u0430 \u043F\u0440\u0438\u0451\u043C\u043A\u0430", done: "\u041F\u0440\u0438\u043D\u044F\u0442\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C", failed: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E \u0441 \u043E\u0448\u0438\u0431\u043A\u043E\u0439", unknown: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E", cancel_requested: "\u0417\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u0430 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430", reported: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u0435\u0440\u0435\u0434\u0430\u043D", prepared: "\u0417\u0430\u043F\u0443\u0441\u043A \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D" };
var roles2 = { technical: "\u0422\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0440\u0430\u0431\u043E\u0442\u0430", business: "\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u0431\u0438\u0437\u043D\u0435\u0441", memory: "\u0420\u0435\u0448\u0435\u043D\u0438\u044F \u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044F", altron: "Altron \u2014 \u0441\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043F\u043B\u0430\u043D", reviewer: "\u041E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0449\u0438\u0439" };
var errors = { scope_changed: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0438\u043B\u0438 \u043F\u0440\u043E\u0435\u043A\u0442 \u0441\u043C\u0435\u043D\u0438\u043B\u0441\u044F. \u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E.", model_mismatch: "Hermes \u0432\u0435\u0440\u043D\u0443\u043B \u0434\u0440\u0443\u0433\u0443\u044E \u043C\u043E\u0434\u0435\u043B\u044C \u0438\u043B\u0438 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430. \u0417\u0430\u0434\u0430\u043D\u0438\u0435 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E.", model_and_provider_required: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u043E\u0434\u0435\u043B\u044C \u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u0435\u0451 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430.", project_overlap: "\u042D\u0442\u0430 \u043F\u0430\u043F\u043A\u0430 \u0443\u0436\u0435 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043A \u0434\u0440\u0443\u0433\u043E\u043C\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0443. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0443\u044E \u043F\u0430\u043F\u043A\u0443.", directory_not_found: "\u041F\u0430\u043F\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430. \u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0435\u0451 \u0432 \u041F\u0440\u043E\u0432\u043E\u0434\u043D\u0438\u043A\u0435 \u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C.", directory_must_be_absolute: "\u041D\u0443\u0436\u0435\u043D \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0439 \u043F\u0430\u043F\u043A\u0435.", directory_too_broad: "\u041D\u0443\u0436\u043D\u0430 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0430\u044F \u043F\u0430\u043F\u043A\u0430 \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u043D\u0435 \u0432\u0435\u0441\u044C \u0434\u0438\u0441\u043A \u0438\u043B\u0438 \u043F\u0440\u043E\u0444\u0438\u043B\u044C Hermes.", artifact_changed: "\u0424\u0430\u0439\u043B \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430. \u041F\u0440\u0438\u0451\u043C\u043A\u0430 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u0430.", artifact_unavailable: "\u041E\u0434\u0438\u043D \u0438\u0437 \u0444\u0430\u0439\u043B\u043E\u0432 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u041F\u0440\u0438\u0451\u043C\u043A\u0430 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u0430.", run_state_unconfirmed: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430. \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0439 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u043D\u0435\u0442.", run_already_starting: "\u042D\u0442\u043E\u0442 \u0437\u0430\u043F\u0443\u0441\u043A \u0443\u0436\u0435 \u043E\u0431\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u0435\u0442\u0441\u044F." };
var stack2 = { display: "grid", gap: 12 };
var row2 = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" };
var panel2 = { ...stack2, padding: 16, border: "1px solid var(--ui-stroke-secondary)", borderRadius: 10 };
var muted = { color: "var(--ui-text-secondary)", fontSize: 13 };
function createView(React2, sdk2, ctx, coordinator) {
  const { createElement: h, useEffect, useMemo, useRef, useState } = React2;
  const { Button: Button2, Input, Textarea, useValue, useQuery, useQueryClient, host: host2 } = sdk2;
  const field = (label, control) => h("label", { style: { ...stack2, gap: 5 } }, h("span", null, label), React2.cloneElement(control, { "aria-label": label }));
  const paragraph = (value) => h("p", { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 } }, value);
  const Maintenance = createMaintenanceView(React2, sdk2, ctx);
  const { TeamSettings, TaskTeam } = createTeamViews(React2, sdk2, ctx, coordinator);
  function Task({ task, project, perform, actions, busy, model, provider }) {
    const [plan, setPlan] = useState(task.plan);
    const [review, setReview] = useState("");
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
      { style: panel2, "data-task-id": task.id },
      h("div", { style: row2 }, h("strong", null, task.goal), h("span", { style: muted }, statuses[task.status] || task.status)),
      h("div", null, h("strong", null, "\u041A\u0440\u0438\u0442\u0435\u0440\u0438\u0438 \u0433\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u0438"), paragraph(task.acceptance)),
      task.status === "draft" ? h(
        "div",
        { style: stack2 },
        field("\u041F\u043B\u0430\u043D \u0434\u043B\u044F \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u0438\u044F", h(Textarea, { value: plan, rows: 4, maxLength: 16e3, onChange: (e) => setPlan(e.target.value), disabled: busy })),
        h(
          "div",
          { style: row2 },
          h(Button2, { onClick: () => setConfirmRole("altron"), disabled: busy || !routeFor("altron").model || !routeFor("altron").provider }, "\u041F\u043E\u043F\u0440\u043E\u0441\u0438\u0442\u044C Altron \u0441\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043F\u043B\u0430\u043D"),
          h(Button2, { onClick: () => perform(() => ctx.rest(`${path}/approve`, { method: "POST", body: { plan } })), disabled: busy || !plan.trim() || steps.length > 0 }, "\u0421\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u0442\u044C \u043F\u043B\u0430\u043D")
        )
      ) : h("div", null, h("strong", null, "\u0421\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u043F\u043B\u0430\u043D"), paragraph(task.plan || "\u041F\u043B\u0430\u043D \u0435\u0449\u0451 \u043D\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D.")),
      task.status === "approved" && !task.team && h(
        "div",
        { style: row2 },
        field("\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C", h(
          "select",
          { value: role, onChange: (e) => setRole(e.target.value), disabled: busy, style: { color: "inherit", background: "var(--ui-background)", padding: 8 } },
          ...["technical", "business", "memory"].map((value) => h("option", { key: value, value }, roles2[value]))
        )),
        h(Button2, { disabled: busy || !routeFor(role).model || !routeFor(role).provider, onClick: () => setConfirmRole(role) }, "\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F")
      ),
      h(TaskTeam, { task, project, plan, steps, setSteps, perform, busy }),
      confirmRole && h(
        "section",
        { role: "dialog", "aria-label": "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430", style: panel2 },
        h("strong", null, `\u0417\u0430\u043F\u0443\u0441\u043A: ${roles2[confirmRole]}`),
        paragraph(`\u041F\u0440\u043E\u0435\u043A\u0442: ${project.name}
\u041F\u0430\u043F\u043A\u0430: ${project.directory}
\u041C\u043E\u0434\u0435\u043B\u044C: ${confirmRoute.model}
\u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440: ${confirmRoute.provider}`),
        paragraph("\u042D\u0442\u043E \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A \u0432 \u0432\u0430\u0448\u0435\u043C Hermes. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u044B \u0440\u0430\u0441\u0445\u043E\u0434\u044B \u0432\u0430\u0448\u0435\u0433\u043E \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0437\u0430\u043C\u0435\u043D\u044B \u043C\u043E\u0434\u0435\u043B\u0438 \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0439 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 Altron \u043D\u0435 \u0434\u0435\u043B\u0430\u0435\u0442."),
        h("div", { style: row2 }, h(Button2, { disabled: busy, onClick: launch }, "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u0437\u0430\u043F\u0443\u0441\u043A"), h(Button2, { disabled: busy, onClick: () => setConfirmRole(null) }, "\u041D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0442\u044C"))
      ),
      task.summary && h("div", null, h("strong", null, "\u041E\u0442\u0447\u0451\u0442 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F \u2014 \u0435\u0449\u0451 \u043D\u0435 \u043F\u0440\u0438\u0451\u043C\u043A\u0430"), paragraph(task.summary)),
      task.artifacts.length > 0 && h(
        "div",
        { style: stack2 },
        h("strong", null, "\u0420\u0435\u0430\u043B\u044C\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430"),
        ...task.artifacts.map((file) => h(
          "div",
          { key: file.path, style: stack2 },
          h("code", { style: { overflowWrap: "anywhere" } }, file.path),
          h("small", { style: muted }, `${file.bytes} \u0431\u0430\u0439\u0442 \xB7 SHA-256 ${file.sha256}`)
        )),
        h(Button2, { disabled: busy, onClick: () => perform(() => ctx.os.revealPath(project.directory)) }, "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0430\u043F\u043A\u0443 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430")
      ),
      task.specialist_review && h("div", null, h("strong", null, "\u0417\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0449\u0435\u0433\u043E"), paragraph(task.specialist_review.text)),
      task.status === "review" && h(
        "div",
        { style: stack2 },
        h(Button2, { disabled: busy || !routeFor("reviewer").model || !routeFor("reviewer").provider, onClick: () => setConfirmRole("reviewer") }, "\u0417\u0430\u043A\u0430\u0437\u0430\u0442\u044C \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0443\u044E \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443"),
        paragraph("\u041C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0444\u0430\u0439\u043B\u044B \u0441\u0430\u043C\u043E\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u043D\u043E. \u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u0430\u044F \u0441\u0443\u043C\u043C\u0430 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u043D\u0435\u0438\u0437\u043C\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u0444\u0430\u0439\u043B\u0430, \u0430 \u043D\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0435\u0433\u043E \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u044F."),
        field("\u0427\u0442\u043E \u0432\u044B \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u043B\u0438 \u043F\u043E \u043A\u0440\u0438\u0442\u0435\u0440\u0438\u044F\u043C \u0437\u0430\u0434\u0430\u0447\u0438", h(Textarea, { value: review, rows: 3, maxLength: 16e3, onChange: (e) => setReview(e.target.value), disabled: busy })),
        h(Button2, { disabled: busy || !review.trim(), onClick: () => perform(() => ctx.rest(`${path}/accept`, { method: "POST", body: { review } })) }, "\u042F \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u043B \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u2014 \u043F\u0440\u0438\u043D\u044F\u0442\u044C")
      ),
      task.acceptance_review && paragraph(`\u041F\u0440\u0438\u0451\u043C\u043A\u0430 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F: ${task.acceptance_review.text}`),
      ...project.runs.filter((run) => run.task_id === task.id).map((run) => h(
        "section",
        { key: run.id, style: { ...panel2, padding: 10 } },
        h("span", null, `${roles2[run.role]} \xB7 ${run.provider} / ${run.model} \xB7 ${statuses[run.status] || run.status}`),
        run.note && paragraph(run.note),
        h(
          "div",
          { style: row2 },
          run.stored_id && h(Button2, { disabled: busy, onClick: () => perform(() => actions.open(run)) }, "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u0438\u0430\u043B\u043E\u0433 \u0432 Hermes"),
          !task.team && !["reported", "failed", "interrupted", "cancel_requested"].includes(run.status) && h(Button2, { disabled: busy, onClick: () => perform(() => actions.cancel({ projectId: project.id, run })) }, "\u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0443")
        )
      ))
    );
  }
  function Project({ project, perform, actions, busy, model, provider, catalog }) {
    const [goal, setGoal] = useState("");
    const [acceptance, setAcceptance] = useState("");
    const [decision, setDecision] = useState("");
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
      { style: stack2 },
      h("h2", null, project.name),
      h("p", { style: { ...muted, overflowWrap: "anywhere" } }, project.directory),
      h(TeamSettings, { project, perform, busy, model, provider, catalog }),
      h(
        "form",
        { style: panel2, onSubmit: addTask },
        h("h3", null, "\u041D\u043E\u0432\u0430\u044F \u0437\u0430\u0434\u0430\u0447\u0430"),
        field("\u041A\u0430\u043A\u043E\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043D\u0443\u0436\u0435\u043D", h(Textarea, { required: true, value: goal, rows: 3, maxLength: 16e3, onChange: (e) => setGoal(e.target.value), disabled: busy })),
        field("\u041A\u0430\u043A \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0433\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u044C", h(Textarea, { required: true, value: acceptance, rows: 3, maxLength: 16e3, onChange: (e) => setAcceptance(e.target.value), disabled: busy })),
        h(Button2, { type: "submit", disabled: busy || !goal.trim() || !acceptance.trim() }, "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443")
      ),
      ...project.tasks.slice().reverse().map((task) => h(Task, { key: task.id, task, project, perform, actions, busy, model, provider })),
      h(
        "section",
        { style: panel2 },
        h("h3", null, "\u0420\u0435\u0448\u0435\u043D\u0438\u044F \u043F\u0440\u043E\u0435\u043A\u0442\u0430"),
        ...project.decisions.map((item) => h("div", { key: item.id }, paragraph(item.text))),
        h(
          "form",
          { style: stack2, onSubmit: (e) => {
            e.preventDefault();
            perform(async () => {
              await ctx.rest(`/projects/${project.id}/decisions`, { method: "POST", body: { text: decision } });
              setDecision("");
            });
          } },
          field("\u041D\u043E\u0432\u043E\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u0435", h(Textarea, { required: true, value: decision, maxLength: 16e3, onChange: (e) => setDecision(e.target.value), disabled: busy })),
          h(Button2, { type: "submit", disabled: busy || !decision.trim() }, "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0440\u0435\u0448\u0435\u043D\u0438\u0435")
        )
      )
    );
  }
  function Workspace({ profile, gateway, epoch, connectionId }) {
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
      onTrackingError: () => host2.notify({ kind: "error", message: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438\u0442\u043E\u0433 \u0437\u0430\u043F\u0443\u0441\u043A\u0430 Altron. \u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E; \u043F\u043E\u0432\u0442\u043E\u0440 \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u043B\u0441\u044F." }),
      isCurrent: () => live.current && host2.state.profile.get() === profile && host2.state.gateway.get() === "open" && selected.current === pid
    }), [profile, pid]);
    const refresh = () => queryClient.invalidateQueries({ queryKey });
    const perform = async (work) => {
      if (busy || !live.current) return;
      setBusy(true);
      setError("");
      try {
        await work();
      } catch (failure) {
        if (live.current) {
          const code = Object.keys(errors).find((value) => String(failure?.message).includes(value));
          setError(code ? errors[code] : "\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 Hermes; \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u0430 \u043D\u0435\u0442.");
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
      { style: { ...stack2, padding: 24, maxWidth: 1080, margin: "0 auto", overflow: "auto", height: "100%" } },
      h("header", null, h("h1", null, "Altron"), h("p", { style: muted }, "\u041F\u0440\u043E\u0435\u043A\u0442 \u2192 \u0437\u0430\u0434\u0430\u0447\u0430 \u2192 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u043F\u043B\u0430\u043D \u2192 \u0440\u0430\u0431\u043E\u0442\u0430 \u2192 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430.")),
      gateway !== "open" && h("p", { role: "status" }, "\u041D\u0435\u0442 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u043A Hermes. \u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0441 \u0437\u0430\u0434\u0430\u0447\u0430\u043C\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B."),
      workspace.isLoading && h("p", { role: "status" }, "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 Altron\u2026"),
      workspace.error && h("p", { role: "alert" }, "API Altron \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435, \u0447\u0442\u043E Python-\u0447\u0430\u0441\u0442\u044C \u043F\u0430\u043A\u0435\u0442\u0430 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0430 \u0432 \u044D\u0442\u043E\u043C \u043F\u0440\u043E\u0444\u0438\u043B\u0435 Hermes."),
      error && h("p", { role: "alert" }, error),
      h(Maintenance, { queryKey, gateway }),
      h(Button2, { disabled: busy || gateway !== "open", onClick: refresh }, "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435"),
      workspace.data && h(
        React2.Fragment,
        null,
        workspace.data.projects.length > 0 && field("\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u043F\u0440\u043E\u0435\u043A\u0442", h(
          "select",
          { "aria-label": "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u043F\u0440\u043E\u0435\u043A\u0442", value: pid || "", disabled: busy, onChange: (e) => perform(() => ctx.rest(`/projects/${e.target.value}/select`, { method: "POST" })), style: { color: "inherit", background: "var(--ui-background)", padding: 10 } },
          h("option", { value: "", disabled: true }, "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0435\u043A\u0442"),
          ...workspace.data.projects.map((p) => h("option", { key: p.id, value: p.id }, p.name))
        )),
        h(
          "details",
          { open: workspace.data.projects.length === 0, style: panel2 },
          h("summary", null, "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442"),
          h(
            "form",
            { onSubmit: addProject, style: stack2 },
            field("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430", h(Input, { required: true, value: name, maxLength: 200, onChange: (e) => setName(e.target.value), disabled: busy })),
            field("\u041F\u0430\u043F\u043A\u0430 \u043F\u0440\u043E\u0435\u043A\u0442\u0430", h(Input, { required: true, value: directory, placeholder: "\u041F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0439 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0439 \u043F\u0430\u043F\u043A\u0435", maxLength: 4096, onChange: (e) => setDirectory(e.target.value), disabled: busy })),
            h("p", { style: muted }, "\u041D\u0435 \u0432\u044B\u0431\u0438\u0440\u0430\u0439\u0442\u0435 \u0432\u0435\u0441\u044C \u0434\u0438\u0441\u043A \u0438\u043B\u0438 \u043F\u0430\u043F\u043A\u0443 Hermes. Altron \u043D\u0435 \u043A\u043E\u043F\u0438\u0440\u0443\u0435\u0442 \u0441\u0442\u0430\u0440\u044B\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u044B \u0438 \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u0451\u0442 \u0437\u0430\u0434\u0430\u0447\u0438 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438."),
            h(Button2, { type: "submit", disabled: busy || !name.trim() || !directory.trim() }, "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442")
          )
        ),
        h(
          "details",
          { style: panel2 },
          h("summary", null, "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0418\u0418 \u0434\u043B\u044F \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0433\u043E \u0437\u0430\u043F\u0443\u0441\u043A\u0430"),
          h("p", { style: muted }, "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E\u0442\u0441\u044F \u0432\u0430\u0448\u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0432 Hermes. \u041A\u043B\u044E\u0447\u0438 \u0438 \u043F\u0430\u0440\u043E\u043B\u0438 \u0441\u044E\u0434\u0430 \u043D\u0435 \u0432\u0432\u043E\u0434\u044F\u0442\u0441\u044F. \u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440 \u2014 \u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0438\u0437 \u0448\u0442\u0430\u0442\u043D\u044B\u0445 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A \u043C\u043E\u0434\u0435\u043B\u0435\u0439, \u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440 openai-codex."),
          field("\u041C\u043E\u0434\u0435\u043B\u044C", h(Input, { value: model, maxLength: 300, onChange: (e) => setModel(e.target.value), disabled: busy })),
          field("\u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440", h(Input, { value: provider, maxLength: 100, onChange: (e) => setProvider(e.target.value), disabled: busy }))
        ),
        project.error && h("p", { role: "alert" }, "\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u0427\u0443\u0436\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043D\u0435 \u043F\u043E\u0434\u0441\u0442\u0430\u0432\u043B\u044F\u044E\u0442\u0441\u044F."),
        pid && project.data?.id === pid && h(Project, { key: pid, project: project.data, perform, actions, busy, model, provider, catalog: catalog.data })
      )
    );
  }
  return function Altron() {
    const profile = useValue(host2.state.profile);
    const gateway = useValue(host2.state.gateway);
    const connectionId = useValue(host2.state.connectionId);
    const [epoch, setEpoch] = useState(0);
    useEffect(() => host2.onEvent("gateway.ready", () => setEpoch((value) => value + 1)), []);
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
  version: "0.3.0-beta.1",
  description: "\u041F\u0440\u043E\u0435\u043A\u0442\u044B, \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438, \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0441\u0442\u044B \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u0432.",
  defaultEnabled: false,
  register(ctx) {
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
      onError: () => sdk.host.notify({ kind: "error", message: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u044B Altron \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E: \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0438\u043B\u0438 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u0430 \u043D\u0435\u0442." })
    });
    ctx.onDispose(() => coordinator.dispose());
    const View = createView(React, sdk, ctx, coordinator);
    if (typeof sdk.host.openWorkspace !== "function") throw new Error("Altron requires Hermes Desktop with the openWorkspace SDK.");
    let close;
    const open = () => {
      if (close) {
        sdk.host.revealPane("plugin-workspace:altron");
        return;
      }
      close = sdk.host.openWorkspace("altron", { title: "Altron", render: () => React.createElement(View), onClose: () => {
        close = null;
      } });
    };
    ctx.onDispose(() => close?.());
    ctx.register({ id: "button", area: "statusBar.left", render: () => React.createElement(sdk.Button, { onClick: open, variant: "ghost", size: "sm" }, "Altron") });
    ctx.register({ id: "open", area: sdk.PALETTE_AREA, data: { id: "altron.open", label: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C Altron", keywords: ["altron", "\u043F\u0440\u043E\u0435\u043A\u0442\u044B"], run: open } });
  }
};
export {
  main_default as default
};
