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

// altron/ui/workspace-tools.mjs
var demoTask = {
  goal: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0432 \u043F\u0430\u043F\u043A\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0430\u0432\u0442\u043E\u043D\u043E\u043C\u043D\u0443\u044E \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 index.html: \u043F\u043E\u043D\u044F\u0442\u043D\u044B\u0439 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A, \u0441\u043F\u0438\u0441\u043E\u043A \u0442\u0440\u0451\u0445 \u0443\u0441\u043B\u0443\u0433 \u0438 \u043A\u043D\u043E\u043F\u043A\u0443, \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u044E\u0449\u0443\u044E \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u043D\u0443\u044E \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044E. \u0411\u0435\u0437 \u0432\u043D\u0435\u0448\u043D\u0438\u0445 \u0431\u0438\u0431\u043B\u0438\u043E\u0442\u0435\u043A, \u0441\u0435\u0442\u0438 \u0438 \u043F\u0443\u0431\u043B\u0438\u043A\u0430\u0446\u0438\u0438.",
  acceptance: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C index.html \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435. \u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A, \u0442\u0440\u0438 \u0443\u0441\u043B\u0443\u0433\u0438, \u043D\u0430\u0436\u0430\u0442\u0438\u0435 \u043A\u043D\u043E\u043F\u043A\u0438 \u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043E\u0448\u0438\u0431\u043E\u043A \u0432 \u043A\u043E\u043D\u0441\u043E\u043B\u0438. \u041E\u043F\u0438\u0441\u0430\u0442\u044C \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u044B\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u0438 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F \u0432 CHECKS.md."
};
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
function usageText(usage = {}) {
  const tokens = Number.isFinite(usage.input) && Number.isFinite(usage.output) ? `\u0422\u043E\u043A\u0435\u043D\u044B (\u0447\u0430\u0441\u0442\u0438 \u0442\u0435\u043A\u0441\u0442\u0430): ${usage.input} \u0432\u0445\u043E\u0434 / ${usage.output} \u0432\u044B\u0445\u043E\u0434. ` : "";
  if (!Number.isFinite(usage.cost_usd) || !["known", "estimated"].includes(usage.cost_status)) return `${tokens}\u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C \u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430: Hermes \u043D\u0435 \u043F\u0440\u0435\u0434\u043E\u0441\u0442\u0430\u0432\u0438\u043B \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u0443\u044E \u0441\u0443\u043C\u043C\u0443.`;
  return `${tokens}\u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C: $${usage.cost_usd.toFixed(4)}${usage.cost_status === "estimated" ? " \u2014 \u043E\u0446\u0435\u043D\u043A\u0430 Hermes, \u043D\u0435 \u0441\u0447\u0451\u0442 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430" : " \u2014 \u043F\u043E \u0434\u0430\u043D\u043D\u044B\u043C Hermes"}.`;
}
function elapsedText(run, now = Date.now()) {
  const end = run.finished_at ? Date.parse(run.finished_at) : now;
  const seconds = Math.max(0, Math.floor((end - Date.parse(run.created_at)) / 1e3));
  return Number.isFinite(seconds) ? `${Math.floor(seconds / 60)} \u043C\u0438\u043D ${seconds % 60} \u0441` : "\u0412\u0440\u0435\u043C\u044F \u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E";
}
function createWorkspaceTools(React2, sdk2, ctx) {
  const { createElement: h, useEffect, useRef, useState } = React2;
  const { Button: Button2, Input, useQuery, host: host2 } = sdk2;
  const stack4 = { display: "grid", gap: 10 };
  const panel4 = { ...stack4, padding: 12, border: "1px solid var(--ui-stroke-secondary)", borderRadius: 8 };
  const selectStyle2 = { color: "inherit", background: "var(--ui-background)", padding: 8 };
  const field = (label, input) => h("label", { style: stack4 }, h("span", null, label), React2.cloneElement(input, { "aria-label": label }));
  function Connections({ profile, queryKey, gateway, model, provider, setModel, setProvider, busy }) {
    const query = useQuery({ queryKey: [...queryKey, "connections"], queryFn: () => loadConnections((...args) => host2.request(...args), profile), enabled: gateway === "open", retry: false });
    const providers = query.data?.providers || [];
    const selected = providers.find((p) => p.id === provider);
    const current = query.data?.current;
    return h(
      "section",
      { style: panel4 },
      h("h3", null, "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0418\u0418 \u0434\u043B\u044F \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0433\u043E \u0437\u0430\u043F\u0443\u0441\u043A\u0430"),
      h("p", null, "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E\u0442\u0441\u044F \u0432\u0430\u0448\u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F Hermes. \u041A\u043B\u044E\u0447\u0438 \u0438 \u043F\u0430\u0440\u043E\u043B\u0438 \u0441\u044E\u0434\u0430 \u043D\u0435 \u0432\u0432\u043E\u0434\u044F\u0442\u0441\u044F. \u0412\u044B\u0431\u043E\u0440 \u0437\u0434\u0435\u0441\u044C \u043D\u0435 \u043C\u0435\u043D\u044F\u0435\u0442 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0434\u0440\u0443\u0433\u0438\u0445 \u0434\u0438\u0430\u043B\u043E\u0433\u043E\u0432."),
      query.error && h("p", { role: "status" }, "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u043A\u0430\u0442\u0430\u043B\u043E\u0433. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 Hermes \u0438\u043B\u0438 \u0437\u0430\u0434\u0430\u0439\u0442\u0435 \u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0435 \u0432\u0430\u043C \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F \u0432\u0440\u0443\u0447\u043D\u0443\u044E."),
      field("\u041D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u043D\u043E\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435", h(
        "select",
        { value: selected ? provider : "", disabled: busy, style: selectStyle2, onChange: (e) => {
          setProvider(e.target.value);
          setModel("");
        } },
        h("option", { value: "" }, "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435"),
        ...providers.map((p) => h("option", { key: p.id, value: p.id, disabled: !p.authenticated }, `${p.label}${p.authenticated ? "" : " \u2014 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0432\u0445\u043E\u0434 \u0432 Hermes"}`))
      )),
      field("\u041C\u043E\u0434\u0435\u043B\u044C \u0438\u0437 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430", h(
        "select",
        { value: selected?.models.includes(model) ? model : "", disabled: busy || !selected?.authenticated, style: selectStyle2, onChange: (e) => setModel(e.target.value) },
        h("option", { value: "" }, "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u043E\u0434\u0435\u043B\u044C"),
        ...(selected?.models || []).map((name) => h("option", { key: name, value: name }, name))
      )),
      h(Button2, { disabled: busy || !current?.model || !providers.some((p) => p.id === current?.provider && p.authenticated), onClick: () => {
        setModel(current.model);
        setProvider(current.provider);
      } }, "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0435\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 Hermes"),
      h("p", { role: "status" }, selected?.authenticated && model ? "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0432\u044B\u0431\u0440\u0430\u043D\u044B. \u0417\u0430\u043F\u0440\u043E\u0441 \u043A \u043C\u043E\u0434\u0435\u043B\u0438 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u043B\u0441\u044F; \u0440\u0430\u0431\u043E\u0442\u043E\u0441\u043F\u043E\u0441\u043E\u0431\u043D\u043E\u0441\u0442\u044C \u043E\u0442\u0432\u0435\u0442\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u0441\u044F \u043F\u0440\u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E\u043C \u0437\u0430\u043F\u0443\u0441\u043A\u0435." : "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438 \u043C\u043E\u0434\u0435\u043B\u044C. \u0415\u0441\u043B\u0438 \u0432\u0445\u043E\u0434 \u0435\u0449\u0451 \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D: Settings \u2192 Model \u0432 Hermes. \u0417\u0430\u043F\u0440\u043E\u0441 \u043A \u043C\u043E\u0434\u0435\u043B\u0438 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u043B\u0441\u044F."),
      h(
        "details",
        null,
        h("summary", null, "\u0420\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u043D\u044B\u0439 \u0440\u0443\u0447\u043D\u043E\u0439 \u0432\u0432\u043E\u0434"),
        field("\u041C\u043E\u0434\u0435\u043B\u044C", h(Input, { value: model, maxLength: 300, disabled: busy, onChange: (e) => setModel(e.target.value) })),
        field("\u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440", h(Input, { value: provider, maxLength: 100, disabled: busy, onChange: (e) => setProvider(e.target.value) }))
      ),
      h(Button2, { disabled: busy || gateway !== "open", onClick: () => query.refetch?.() }, "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F")
    );
  }
  function FolderPicker({ directory, onChoose, busy }) {
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
        if (live.current) setError("\u041F\u0430\u043F\u043A\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430. \u041C\u043E\u0436\u043D\u043E \u0443\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u0432 \u043F\u043E\u043B\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430.");
      } finally {
        if (live.current) setLoading(false);
      }
    };
    return h(
      "div",
      { style: stack4 },
      h(Button2, { type: "button", disabled: busy || loading, onClick: () => browse(directory) }, "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u043F\u0430\u043F\u043A\u0443"),
      error && h("p", { role: "alert" }, error),
      listing && h(
        "section",
        { role: "dialog", "aria-label": "\u0412\u044B\u0431\u043E\u0440 \u043F\u0430\u043F\u043A\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u0430", style: panel4 },
        h("strong", null, listing.path),
        h("p", null, "\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0430\u043F\u043A\u0438 \u043D\u0430 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0435, \u0433\u0434\u0435 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 Hermes; \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435 \u0444\u0430\u0439\u043B\u043E\u0432 \u043D\u0435 \u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044F."),
        h(Button2, { type: "button", disabled: loading || !listing.parent, onClick: () => browse(listing.parent) }, "\u041D\u0430 \u0443\u0440\u043E\u0432\u0435\u043D\u044C \u0432\u044B\u0448\u0435"),
        h("div", { style: { ...stack4, maxHeight: 250, overflow: "auto" } }, ...listing.directories.map((entry) => h(Button2, { key: entry.path, type: "button", disabled: loading, onClick: () => browse(entry.path) }, entry.name))),
        field("\u0418\u043C\u044F \u043D\u043E\u0432\u043E\u0439 \u043F\u0430\u043F\u043A\u0438", h(Input, { value: name, maxLength: 120, disabled: loading, onChange: (e) => setName(e.target.value) })),
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
            if (live.current) setError("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u0430\u043F\u043A\u0443. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0438\u043C\u044F, \u043F\u0440\u0430\u0432\u0430 \u0438 \u043D\u0430\u043B\u0438\u0447\u0438\u0435 \u043F\u0430\u043F\u043A\u0438 \u0441 \u0442\u0430\u043A\u0438\u043C \u0438\u043C\u0435\u043D\u0435\u043C.");
          } finally {
            if (live.current) setLoading(false);
          }
        } }, "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0438 \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u043F\u0430\u043F\u043A\u0443"),
        h(Button2, { type: "button", disabled: loading, onClick: () => {
          onChoose(listing.path);
          setListing(null);
        } }, "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u044D\u0442\u0443 \u043F\u0430\u043F\u043A\u0443"),
        h(Button2, { type: "button", disabled: loading, onClick: () => setListing(null) }, "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0432\u044B\u0431\u043E\u0440 \u043F\u0430\u043F\u043A\u0438")
      )
    );
  }
  function Diagnostics({ perform = (work) => work(), busy = false }) {
    const [report, setReport] = useState(null);
    return h(
      "details",
      { style: panel4 },
      h("summary", null, "\u041F\u043E\u043C\u043E\u0449\u044C \u0438 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u0430\u044F \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430"),
      h("p", null, "\u041E\u0442\u0447\u0451\u0442 \u0431\u0435\u0437 \u043F\u0443\u0442\u0435\u0439 \u0438 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0433\u043E \u0437\u0430\u0434\u0430\u0447: \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u0435\u0440\u0441\u0438\u0438, \u0441\u0438\u0441\u0442\u0435\u043C\u0430 \u0438 \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0439. \u041E\u043D \u043D\u0438\u043A\u0443\u0434\u0430 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438."),
      h(Button2, { disabled: busy, onClick: () => perform(async () => setReport(await ctx.rest("/diagnostics"))) }, "\u0421\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043E\u0442\u0447\u0451\u0442"),
      report && h(
        React2.Fragment,
        null,
        h("pre", { style: { whiteSpace: "pre-wrap" } }, JSON.stringify(report, null, 2)),
        h(Button2, { disabled: busy, onClick: () => perform(() => ctx.os.writeClipboard(JSON.stringify(report, null, 2))) }, "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u043E\u0442\u0447\u0451\u0442")
      ),
      h("a", { href: "https://github.com/VibeSan7/altron-desktop/issues/new?template=bug_report.yml", target: "_blank", rel: "noreferrer" }, "\u0421\u043E\u043E\u0431\u0449\u0438\u0442\u044C \u043E \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u0435 \u043D\u0430 GitHub")
    );
  }
  return { Connections, FolderPicker, Diagnostics };
}

// altron/ui/mission-view.mjs
var DEFAULT_LIMITS = { max_turns: 12, max_hours: 168 };
var LIMITS = { max_turns: [1, 200], max_hours: [1, 168] };
var statuses = {
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
};
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
function createMissionActions({ api, rpc, getConnectionId, getProfile, isCurrent }) {
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
      title: mission.phase === "interview" ? "Altron \u2014 \u0438\u043D\u0442\u0435\u0440\u0432\u044C\u044E" : "Altron \u2014 \u0440\u0430\u0431\u043E\u0442\u0430"
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
function errorText(error) {
  const message = String(error?.message || error || "");
  const known = {
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
  };
  return Object.entries(known).find(([code]) => message.includes(code))?.[1] || message || "\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043C\u0438\u0441\u0441\u0438\u0438 \u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 Hermes.";
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
function createMissionView(React2, sdk2, ctx) {
  const { createElement: h, Fragment, useEffect, useMemo, useRef, useState } = React2;
  const { Button: Button2, ConfirmDialog, Input, Textarea, useQuery, useQueryClient } = sdk2;
  const { FolderPicker } = createWorkspaceTools(React2, sdk2, ctx);
  const field = (label, control) => h("label", { style: stack }, h("span", null, label), React2.cloneElement(control, { "aria-label": label }));
  const paragraph = (value) => h("p", { style: textBlock }, value || "");
  const itemList = (items, empty = "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445.") => items?.length ? h("ul", { style: { ...stack, gap: 6, paddingLeft: 20 } }, ...items.map((item, index) => h("li", { key: `${item?.path || item?.id || index}`, style: { overflowWrap: "anywhere" } }, typeof item === "string" ? item : item.path ? `${item.path}${item.purpose ? ` \u2014 ${item.purpose}` : ""}` : JSON.stringify(item)))) : h("p", { style: muted }, empty);
  function MissionView({ profile, connectionId, gateway, queryKey = [], workspaceId, model, provider, mission: suppliedMission }) {
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
      isCurrent: () => live.current && (sdk2.host?.state?.gateway?.get?.() ?? gateway) === "open"
    }), [connectionId, gateway, profile, sdk2.host, ctx.rest]);
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
        setError(errorText(failureValue));
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
        setError(errorText(failure("directory_required")));
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
      h("h2", null, "\u041C\u043E\u0438 \u043C\u0438\u0441\u0441\u0438\u0438"),
      h("div", { style: stack }, ...missions.map((item) => h(Button2, {
        key: item.id,
        type: "button",
        variant: item.id === selectedId ? "secondary" : "ghost",
        style: { justifyContent: "flex-start", minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" },
        onClick: () => setSelectedId(item.id)
      }, `${item.proposal?.name || item.transcript?.[0]?.text || item.id} \xB7 ${statuses[item.status] || item.status}`)))
    );
    const queryError = (missionsQuery.error || detailQuery.error) && h("p", { role: "alert" }, "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u043C\u0438\u0441\u0441\u0438\u0438. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435; \u043D\u043E\u0432\u044B\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u043B\u0438\u0441\u044C.");
    const renderLimits = () => h(
      "div",
      { style: row },
      field("\u0420\u0430\u0431\u043E\u0447\u0438\u0435 \u0445\u043E\u0434\u044B (1\u2013200)", h(Input, { type: "number", min: 1, max: 200, value: maxTurns, disabled: busy, onChange: (e) => setMaxTurns(Number(valueOf(e))) })),
      field("\u0427\u0430\u0441\u044B (1\u2013168)", h(Input, { type: "number", min: 1, max: 168, value: maxHours, disabled: busy, onChange: (e) => setMaxHours(Number(valueOf(e))) }))
    );
    const renderTranscript = () => h(
      "section",
      { style: panel },
      h("h2", null, "\u0418\u043D\u0442\u0435\u0440\u0432\u044C\u044E"),
      h("p", { style: muted }, "\u0412\u043E\u043F\u0440\u043E\u0441\u044B \u0438 \u043E\u0442\u0432\u0435\u0442\u044B \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F \u0432 \u043C\u0438\u0441\u0441\u0438\u0438. \u0422\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0435 \u0437\u0430\u0440\u0430\u043D\u0435\u0435 \u043F\u0438\u0441\u0430\u0442\u044C \u043D\u0435 \u043D\u0443\u0436\u043D\u043E."),
      h("div", { style: stack }, ...(mission.transcript || []).map((entry, index) => h("article", { key: `${entry.role}-${index}`, style: { padding: 12, borderRadius: 8, background: "var(--ui-bg-quaternary)", minWidth: 0 } }, h("strong", null, entry.role === "assistant" ? "\u0412\u043E\u043F\u0440\u043E\u0441 Altron" : "\u0412\u0430\u0448 \u043E\u0442\u0432\u0435\u0442"), paragraph(entry.text)))),
      ["waiting", "awaiting_approval"].includes(status) && h("form", { onSubmit: answerMission, style: stack }, field(status === "awaiting_approval" ? "\u0418\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0438\u043B\u0438 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435" : "\u041E\u0442\u0432\u0435\u0442 \u043D\u0430 \u0432\u043E\u043F\u0440\u043E\u0441", h(Textarea, { value: answer, disabled: busy, onChange: edit("answer", setAnswer), placeholder: "\u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0432\u0430\u0436\u043D\u044B\u0439 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u2026" })), h(Button2, { type: "submit", disabled: busy || !answer.trim() }, "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442"))
    );
    const renderProposal = () => {
      const proposal = mission.proposal;
      if (!proposal) return null;
      return h(
        "section",
        { style: panel },
        h("h2", { style: { overflowWrap: "anywhere" } }, proposal.name),
        h("p", { style: muted }, "\u041F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u043C\u043E\u0436\u043D\u043E \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442\u043E\u043C \u0432\u044B\u0448\u0435. \u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043D\u0438\u0436\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442 \u043F\u0440\u043E\u0435\u043A\u0442. \u041E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0435 \u0437\u0430\u043F\u0440\u043E\u0441\u044B \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0441\u0442\u0438 Hermes \u043C\u043E\u0433\u0443\u0442 \u043F\u043E\u0442\u0440\u0435\u0431\u043E\u0432\u0430\u0442\u044C \u0432\u0430\u0448\u0435\u0433\u043E \u0440\u0435\u0448\u0435\u043D\u0438\u044F."),
        h("h3", null, "\u0426\u0435\u043B\u044C"),
        paragraph(proposal.goal),
        h("h3", null, "\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F"),
        itemList(proposal.requirements),
        h("h3", null, "\u0417\u0430 \u043F\u0440\u0435\u0434\u0435\u043B\u0430\u043C\u0438 \u0437\u0430\u0434\u0430\u0447\u0438"),
        itemList(proposal.out_of_scope),
        h("h3", null, "\u041F\u043B\u0430\u043D"),
        paragraph(proposal.plan),
        h("h3", null, "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B"),
        itemList(proposal.deliverables),
        h("h3", null, "\u041A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438"),
        h("div", { style: stack }, ...(proposal.checks || []).map(checkItem)),
        h("p", { style: muted }, `\u041C\u043E\u0434\u0435\u043B\u044C: ${mission.connection?.model || "\u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u0430"} \xB7 \u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440: ${mission.connection?.provider || "\u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D"}`),
        h(
          "form",
          { onSubmit: approveMission, style: stack },
          field("\u041F\u0430\u043F\u043A\u0430 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u2014 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u044F\u0432\u043D\u043E", h(Input, { value: directory, disabled: busy, placeholder: "\u041F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0439 \u043F\u0430\u043F\u043A\u0435", onChange: edit("directory", setDirectory) })),
          h(FolderPicker, { directory, onChoose: (path) => {
            setDirectory(path);
            storage.write("directory", path);
          }, busy }),
          h("div", { style: row }, field("\u0420\u0430\u0431\u043E\u0447\u0438\u0435 \u0445\u043E\u0434\u044B (1\u2013200)", h(Input, { type: "number", min: 1, max: 200, value: maxTurns, disabled: busy, onChange: (e) => setMaxTurns(Number(valueOf(e))) })), field("\u0427\u0430\u0441\u044B (1\u2013168)", h(Input, { type: "number", min: 1, max: 168, value: maxHours, disabled: busy, onChange: (e) => setMaxHours(Number(valueOf(e))) }))),
          h("p", { style: muted }, "\u042D\u0442\u043E \u043B\u0438\u043C\u0438\u0442\u044B \u0440\u0430\u0431\u043E\u0447\u0438\u0445 \u0445\u043E\u0434\u043E\u0432 \u0438 \u0432\u0440\u0435\u043C\u0435\u043D\u0438, \u0430 \u043D\u0435 \u0447\u0438\u0441\u043B\u043E \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u0432\u044B\u0437\u043E\u0432\u043E\u0432 \u043C\u043E\u0434\u0435\u043B\u0438 \u0438 \u043D\u0435 \u0434\u0435\u043D\u0435\u0436\u043D\u044B\u0439 \u043B\u0438\u043C\u0438\u0442."),
          h(Button2, { type: "submit", disabled: busy || !directory.trim() || !proposal }, "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0438 \u043D\u0430\u0447\u0430\u0442\u044C")
        )
      );
    };
    const checkItem = (check) => h("article", { key: check.id, style: { padding: 10, border: "1px solid var(--ui-stroke-secondary)", borderRadius: 8, minWidth: 0 } }, h("strong", null, check.label), h("p", { style: muted }, check.kind === "file" ? check.contains?.length ? `\u0424\u0430\u0439\u043B ${check.path}: \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442\u0441\u044F \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435` : `\u0424\u0430\u0439\u043B ${check.path}: \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442\u0441\u044F \u043D\u0430\u043B\u0438\u0447\u0438\u0435` : `\u041A\u043E\u043C\u0430\u043D\u0434\u0430: ${check.command}`));
    const renderRuns = () => h(
      "section",
      { style: panel },
      h("h2", null, "\u0425\u043E\u0434\u044B \u0438 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435"),
      mission.checkpoint && h(Fragment, null, h("h3", null, "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u0430\u044F \u0442\u043E\u0447\u043A\u0430"), paragraph(mission.checkpoint)),
      h("div", { style: stack }, ...(mission.turns || []).map((turn, index) => h("article", { key: turn.id, style: { padding: 10, border: "1px solid var(--ui-stroke-secondary)", borderRadius: 8, minWidth: 0 } }, h("div", { style: row }, h("strong", null, `\u0425\u043E\u0434 ${index + 1}`), h("span", { style: muted }, `${turn.phase} \xB7 ${statuses[turn.status] || turn.status}`)), h("p", { style: muted }, `\u0421\u043E\u0437\u0434\u0430\u043D: ${turn.created_at || "\u0432\u0440\u0435\u043C\u044F \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E"}`), turn.terminal_status && h("p", { style: muted }, `\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435: ${turn.terminal_status}; settled: ${turn.settled ? "\u0434\u0430" : "\u043D\u0435\u0442"}`), turn.stored_id && h(Button2, { type: "button", variant: "outline", disabled: busy, onClick: () => openSession(turn.stored_id) }, "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u044E Hermes")))),
      status === "cancel_requested" && h("p", { role: "status" }, "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430 \u0437\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u0430. \u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E\u0439 \u043E\u0442\u043C\u0435\u043D\u043E\u0439 \u043E\u043D\u0430 \u0441\u0442\u0430\u043D\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0441\u043B\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u0444\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438."),
      status === "unknown" && h("p", { role: "alert", tabIndex: -1 }, "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E. \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438; \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043D\u0443\u0436\u043D\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0438 \u044F\u0432\u043D\u043E\u0435 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435."),
      (status === "blocked" || mission.blocker === "permission_pending") && h("p", { role: "alert" }, `${status === "blocked" ? "\u0411\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u043A\u0430: " : ""}${errorText(mission.blocker || "\u043F\u0440\u0438\u0447\u0438\u043D\u0430 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u0430")}`),
      ["running", "bound", "creating", "queued", "prepared"].includes(status) && h("div", { style: row }, h(Button2, { type: "button", variant: "destructive", disabled: busy, onClick: () => setConfirm("cancel") }, "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435")),
      ["prepared", "queued"].includes(status) && h(Button2, { type: "button", disabled: busy, onClick: () => void perform(() => actions.resume(mission.id)) }, "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u0443\u044E \u043C\u0438\u0441\u0441\u0438\u044E"),
      ["unknown", "blocked", "cancelled"].includes(status) && h(Button2, { type: "button", variant: "outline", disabled: busy, onClick: () => setConfirm("recover") }, "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C")
    );
    const renderResult = () => h("section", { style: panel }, h("h2", null, "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442"), h("p", { role: "status" }, status === "ready" ? "\u0413\u043E\u0442\u043E\u0432\u043E \u043F\u043E \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u043C \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430\u043C. \u042D\u0442\u043E \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442, \u0447\u0442\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u0443\u0436\u0435 \u043F\u0440\u0438\u043D\u044F\u043B \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442." : "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0435\u0449\u0451 \u043D\u0435 \u043F\u0440\u043E\u0448\u0451\u043B \u0432\u0441\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438."), h("h3", null, "\u0424\u0430\u0439\u043B\u044B"), h("div", { style: stack }, ...(mission.artifacts || []).map((artifact) => h("article", { key: artifact.path, style: { minWidth: 0 } }, h("strong", { style: { overflowWrap: "anywhere" } }, artifact.path), h("p", { style: muted }, `${artifact.bytes} \u0431\u0430\u0439\u0442 \xB7 SHA-256: ${artifact.sha256}`)))), h("h3", null, "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0438"), h("div", { style: stack }, ...(mission.verification || []).map((check) => h("article", { key: check.id, style: { minWidth: 0 } }, h("strong", null, `${check.passed ? "\u041F\u0440\u043E\u0439\u0434\u0435\u043D\u0430" : "\u041D\u0435 \u043F\u0440\u043E\u0439\u0434\u0435\u043D\u0430"}: ${check.label}`), h("p", { style: muted }, `${check.kind === "file" ? "\u0424\u0430\u0439\u043B\u043E\u0432\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430" : "\u041A\u043E\u043C\u0430\u043D\u0434\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430"} \xB7 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A: ${check.source || "\u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D"}`)))), h("h3", null, "\u0418\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F"), paragraph(mission.instructions), mission.approval?.directory && h(Button2, { type: "button", variant: "outline", disabled: busy, onClick: () => void ctx.os?.revealPath?.(mission.approval.directory) }, "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u0430\u043F\u043A\u0443 \u0432 \u041F\u0440\u043E\u0432\u043E\u0434\u043D\u0438\u043A\u0435"), h("form", { onSubmit: (event) => {
      event.preventDefault();
      if (feedback.trim()) setConfirm("revise");
    }, style: stack }, field("\u041D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0440\u0435\u0432\u0438\u0437\u0438\u044F", h(Textarea, { value: feedback, disabled: busy, onChange: edit("feedback", setFeedback), placeholder: "\u041E\u043F\u0438\u0448\u0438\u0442\u0435, \u0447\u0442\u043E \u043D\u0443\u0436\u043D\u043E \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C\u2026" })), renderLimits(), h("p", { style: muted }, `\u041D\u043E\u0432\u0430\u044F \u0440\u0435\u0432\u0438\u0437\u0438\u044F \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u0442\u043E\u0442 \u0436\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442 \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438. \u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u043C\u044B\u0435 \u043B\u0438\u043C\u0438\u0442\u044B: ${maxTurns} \u0445\u043E\u0434\u043E\u0432 \u0438 ${maxHours} \u0447\u0430\u0441\u043E\u0432.`), h(Button2, { type: "submit", disabled: busy || !feedback.trim() }, "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0440\u0435\u0432\u0438\u0437\u0438\u044E")));
    const confirmation = confirm && ConfirmDialog && h(ConfirmDialog, { open: true, onClose: () => setConfirm(null), onConfirm: confirm === "cancel" ? runCancel : confirm === "recover" ? runRecover : runRevise, title: confirm === "cancel" ? "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043C\u0438\u0441\u0441\u0438\u044E?" : confirm === "recover" ? "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043C\u0438\u0441\u0441\u0438\u044E?" : "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0440\u0435\u0432\u0438\u0437\u0438\u044E?", description: confirm === "cancel" ? "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430 \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0435\u0442\u0441\u044F, \u0430 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E\u0439 \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 Hermes." : confirm === "recover" ? "\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u0431\u0443\u0434\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E \u043F\u0435\u0440\u0432\u044B\u043C. \u0421\u043B\u0435\u043F\u043E\u0433\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u0430 \u043D\u0435 \u0431\u0443\u0434\u0435\u0442." : `\u0421\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F. \u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u0434\u043E ${maxTurns} \u0440\u0430\u0431\u043E\u0447\u0438\u0445 \u0445\u043E\u0434\u043E\u0432 \u0438 ${maxHours} \u0447\u0430\u0441\u043E\u0432 \u043D\u0430 \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u043A\u0443?`, confirmLabel: confirm === "cancel" ? "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C" : confirm === "recover" ? "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C" : "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0440\u0435\u0432\u0438\u0437\u0438\u044E", destructive: confirm === "cancel" });
    if (!mission) return h(
      "section",
      { style: stack },
      queryError,
      history,
      h(
        "section",
        { style: { ...panel, borderColor: "var(--ui-accent)" } },
        h("p", { style: muted }, "\u0418\u041D\u0422\u0415\u0420\u0412\u042C\u042E \u2192 \u0420\u0410\u0411\u041E\u0422\u0410 \u2192 \u0420\u0415\u0417\u0423\u041B\u042C\u0422\u0410\u0422"),
        h("h2", null, "\u041D\u0430\u0447\u043D\u0451\u043C \u0441 \u0432\u0430\u0448\u0435\u0439 \u0438\u0434\u0435\u0438"),
        h("p", null, "\u0412\u0430\u043C \u043D\u0435 \u043D\u0443\u0436\u043D\u043E \u0437\u0430\u0440\u0430\u043D\u0435\u0435 \u043F\u0438\u0441\u0430\u0442\u044C \u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0435. Altron \u0437\u0430\u0434\u0430\u0441\u0442 \u0432\u043E\u043F\u0440\u043E\u0441\u044B, \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0438\u0442 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0439 \u043F\u043B\u0430\u043D \u0438 \u043F\u043E\u043F\u0440\u043E\u0441\u0438\u0442 \u043E\u0434\u043D\u043E \u0444\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043F\u0435\u0440\u0435\u0434 \u0440\u0430\u0431\u043E\u0442\u043E\u0439."),
        h(
          "form",
          { onSubmit: startInterview, style: stack },
          field("\u0427\u0442\u043E \u0432\u044B \u0445\u043E\u0442\u0438\u0442\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C?", h(Textarea, {
            value: intro,
            rows: 5,
            maxLength: 16e3,
            disabled: busy,
            placeholder: "\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u0443 \u0438\u043B\u0438 \u0436\u0435\u043B\u0430\u0435\u043C\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0441\u0432\u043E\u0438\u043C\u0438 \u0441\u043B\u043E\u0432\u0430\u043C\u0438\u2026",
            onChange: edit("intro", setIntro)
          })),
          h(
            "div",
            { style: row },
            h(Button2, { type: "button", variant: "outline", disabled: busy, onClick: () => chooseExample("\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u044C\u0442\u0435 \u043A\u0440\u0430\u0442\u043A\u0438\u0439 \u043E\u0442\u0447\u0451\u0442 \u043E \u0442\u0435\u043A\u0443\u0449\u0435\u043C \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435 \u0434\u043B\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u044B.") }, "\u041F\u0440\u0438\u043C\u0435\u0440 \u043E\u0442\u0447\u0451\u0442\u0430"),
            h(Button2, { type: "button", variant: "outline", disabled: busy, onClick: () => chooseExample("\u0421\u0434\u0435\u043B\u0430\u0439\u0442\u0435 \u043D\u0435\u0431\u043E\u043B\u044C\u0448\u0443\u044E \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 \u0441 \u0438\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u0435\u0439 \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430\u043C\u0438 \u0434\u043B\u044F \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u0439.") }, "\u041F\u0440\u0438\u043C\u0435\u0440 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B")
          ),
          h("p", { style: muted }, "\u041F\u0440\u0438\u043C\u0435\u0440\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u043F\u043E\u043B\u043D\u044F\u044E\u0442 \u043F\u043E\u043B\u0435. \u0418\u043D\u0442\u0435\u0440\u0432\u044C\u044E \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0418\u0418 \u0438 \u043C\u043E\u0436\u0435\u0442 \u0440\u0430\u0441\u0445\u043E\u0434\u043E\u0432\u0430\u0442\u044C \u0435\u0433\u043E \u043B\u0438\u043C\u0438\u0442; \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u043D\u0430\u0447\u043D\u0451\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0441\u043B\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u043F\u043B\u0430\u043D\u0430."),
          h(Button2, { type: "submit", disabled: busy || gateway !== "open" || !intro.trim() || !model?.trim() || !provider?.trim() }, busy ? "\u0421\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u043C \u0438\u043D\u0442\u0435\u0440\u0432\u044C\u044E\u2026" : "\u041D\u0430\u0447\u0430\u0442\u044C \u0438\u043D\u0442\u0435\u0440\u0432\u044C\u044E")
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
          h("h2", { style: { overflowWrap: "anywhere" } }, mission.proposal?.name || "\u0410\u0432\u0442\u043E\u043D\u043E\u043C\u043D\u0430\u044F \u043C\u0438\u0441\u0441\u0438\u044F"),
          h("p", { role: "status", style: muted }, statuses[status] || status)
        ),
        h(Button2, { type: "button", variant: "outline", disabled: busy, onClick: () => setSelectedId(null) }, "\u041D\u043E\u0432\u043E\u0435 \u0438\u043D\u0442\u0435\u0440\u0432\u044C\u044E")
      ),
      h(
        "ol",
        { style: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, padding: 0, listStyle: "none" } },
        ...["\u0418\u043D\u0442\u0435\u0440\u0432\u044C\u044E", "\u0420\u0430\u0431\u043E\u0442\u0430", "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442"].map((label, index) => h("li", {
          key: label,
          "aria-current": index === stage ? "step" : void 0,
          style: { padding: 12, borderRadius: 8, border: `1px solid var(${index === stage ? "--ui-accent" : "--ui-stroke-secondary"})`, overflowWrap: "anywhere" }
        }, `${index + 1}. ${label}`))
      ),
      h("p", { style: muted }, "\u041C\u043E\u0436\u043D\u043E \u0437\u0430\u043A\u0440\u044B\u0442\u044C \u0432\u043A\u043B\u0430\u0434\u043A\u0443 Altron \u2014 \u0440\u0430\u0431\u043E\u0442\u0430 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u0441\u044F, \u043F\u043E\u043A\u0430 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 Hermes Desktop. \u041F\u043E\u043B\u043D\u043E\u0435 \u0437\u0430\u043A\u0440\u044B\u0442\u0438\u0435 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u044B \u0438\u043B\u0438 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0430 \u043F\u043E\u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0433\u043E \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F."),
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
var roles = { altron: "Altron \u2014 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u043F\u043B\u0430\u043D", technical: "\u0422\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0440\u0430\u0431\u043E\u0442\u0430", business: "\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u0431\u0438\u0437\u043D\u0435\u0441", memory: "\u0420\u0435\u0448\u0435\u043D\u0438\u044F \u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044F", reviewer: "\u041E\u0442\u0434\u0435\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430" };
var states = { cancelled: "\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u0430 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C", interrupted: "\u0428\u0430\u0433 \u043F\u0440\u0435\u0440\u0432\u0430\u043D", blocked: "\u0428\u0430\u0433 \u043D\u0435 \u043D\u0430\u0447\u0430\u0442: \u0444\u0430\u0439\u043B\u044B \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0433\u043E \u0448\u0430\u0433\u0430 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B", ready: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u0437\u0430\u043F\u0443\u0441\u043A\u0430", running: "\u041A\u043E\u043C\u0430\u043D\u0434\u0430 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442", paused: "\u041D\u0430 \u043F\u0430\u0443\u0437\u0435", unknown: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E \u2014 \u043F\u043E\u0432\u0442\u043E\u0440 \u0437\u0430\u043F\u0440\u0435\u0449\u0451\u043D", failed: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E \u0441 \u043E\u0448\u0438\u0431\u043A\u043E\u0439", review: "\u0412\u0441\u0435 \u0448\u0430\u0433\u0438 \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u044B \u2014 \u043D\u0443\u0436\u043D\u0430 \u043F\u0440\u0438\u0451\u043C\u043A\u0430", done: "\u041F\u0440\u0438\u043D\u044F\u0442\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C", pending: "\u0415\u0449\u0451 \u043D\u0435 \u043D\u0430\u0447\u0430\u0442", prepared: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D", reported: "\u0424\u0430\u0439\u043B\u044B \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u044B, \u043E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435", complete: "\u0428\u0430\u0433 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D", cancel_requested: "\u0417\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u0430 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430" };
var stack2 = { display: "grid", gap: 10 };
var row2 = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" };
var panel2 = { ...stack2, padding: 12, border: "1px solid var(--ui-stroke-secondary)", borderRadius: 8 };
var selectStyle = { color: "inherit", background: "var(--ui-background)", padding: 8 };
function createTeamViews(React2, sdk2, ctx, coordinator) {
  const { createElement: h, useEffect, useState } = React2;
  const { Button: Button2, Input, Textarea } = sdk2;
  const field = (name, control) => h("label", { style: stack2 }, h("span", null, name), React2.cloneElement(control, { "aria-label": name }));
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
      { style: panel2 },
      h("summary", null, "\u0421\u043E\u0441\u0442\u0430\u0432 \u043A\u043E\u043C\u0430\u043D\u0434\u044B"),
      h("p", null, "\u0420\u043E\u043B\u0438 \u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430. \u041F\u0443\u0441\u0442\u044B\u0435 \u0440\u043E\u043B\u0438 \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u044E\u0442\u0441\u044F. \u0417\u0434\u0435\u0441\u044C \u043D\u0435\u0442 \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0449\u0438\u0445 \u043A\u0440\u0443\u0433\u043B\u043E\u0441\u0443\u0442\u043E\u0447\u043D\u043E \u043C\u043E\u0434\u0435\u043B\u0435\u0439. \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u0441\u043E\u0441\u0442\u0430\u0432\u0430 \u043D\u0435 \u043C\u0435\u043D\u044F\u0435\u0442 \u0443\u0436\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u043F\u043B\u0430\u043D\u044B."),
      h(Button2, { disabled: busy || !model || !provider, onClick: () => setRoutes((previous) => ({ ...previous, ...Object.fromEntries(["altron", "technical", "business", "memory"].map((role) => [role, { ...previous[role], model, provider }])) })) }, "\u041D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0432\u0441\u0435\u043C \u0440\u043E\u043B\u044F\u043C, \u043A\u0440\u043E\u043C\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0449\u0435\u0433\u043E"),
      ...Object.entries(roles).map(([role, label]) => h(
        "section",
        { key: role, style: panel2 },
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
      { style: panel2, open: steps.length > 0 },
      h("summary", null, "\u041F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0441\u0442\u043E\u0432"),
      h("p", null, "\u041D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E: \u0440\u0430\u0437\u0431\u0435\u0439\u0442\u0435 \u043F\u043B\u0430\u043D \u043D\u0430 \u0448\u0430\u0433\u0438. Altron \u043F\u0435\u0440\u0435\u0434\u0430\u0441\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u043C\u0443 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044E \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0433\u043E. \u041F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0449\u0438\u0439 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E."),
      ...steps.map((step, index) => h(
        "section",
        { key: index, style: panel2 },
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
      { style: panel2 },
      h("strong", null, `\u0421\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u0430\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u0430: ${states[team.status] || team.status}`),
      team.note && h("p", { role: "status" }, team.note),
      ...team.steps.map((step, index) => h(
        "div",
        { key: index, style: stack2 },
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
        { role: "dialog", "aria-label": "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u043A\u043E\u043C\u0430\u043D\u0434\u044B", style: panel2 },
        h("strong", null, `\u041F\u0440\u043E\u0435\u043A\u0442: ${project.name}`),
        h("p", null, project.directory),
        h("p", null, "\u0411\u0443\u0434\u0443\u0442 \u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0435 \u0432\u044B\u0448\u0435 \u0448\u0430\u0433\u0438 \u043D\u0430 \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0445 \u043C\u043E\u0434\u0435\u043B\u044F\u0445. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u044B \u0440\u0430\u0441\u0445\u043E\u0434\u044B \u0432\u0430\u0448\u0435\u0433\u043E \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430. \u041F\u0440\u0438 \u043E\u0448\u0438\u0431\u043A\u0435 \u0438\u043B\u0438 \u0441\u043C\u0435\u043D\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044F \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F; \u0441\u043A\u0440\u044B\u0442\u044B\u0445 \u043F\u043E\u0432\u0442\u043E\u0440\u043E\u0432 \u043D\u0435\u0442."),
        h(
          "div",
          { style: row2 },
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
  database_incompatible: "\u0424\u043E\u0440\u043C\u0430\u0442 \u0431\u0430\u0437\u044B \u043D\u0435\u0441\u043E\u0432\u043C\u0435\u0441\u0442\u0438\u043C \u0441 \u044D\u0442\u0438\u043C \u043A\u043E\u0434\u043E\u043C. \u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D \u0431\u0435\u0437 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0444\u0430\u0439\u043B\u043E\u0432. \u041F\u043E\u0441\u043B\u0435 \u043C\u0438\u0433\u0440\u0430\u0446\u0438\u0438 \u043D\u0443\u0436\u0435\u043D \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u0441\u043E\u0432\u043C\u0435\u0441\u0442\u0438\u043C\u044B\u0439 \u0432\u044B\u043F\u0443\u0441\u043A \u0438\u043B\u0438 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0435 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u043E\u043B\u043D\u043E\u0439 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u043E\u0439 \u043A\u043E\u043F\u0438\u0438.",
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
      } catch (failure2) {
        if (live.current) {
          const code = Object.keys(messages).find((value) => String(failure2?.message).includes(value));
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

// altron/ui/task-controls.mjs
var runUnsettled = (run) => !run.terminal_status && !(run.status === "failed" && !run.runtime_id);
function createTaskControls(React2, { Button: Button2, Textarea }, ctx) {
  const { createElement: h, useState } = React2;
  const stack4 = { display: "grid", gap: 10 };
  const panel4 = { ...stack4, padding: 12, border: "1px solid var(--ui-stroke-secondary)", borderRadius: 8 };
  return function TaskControls({ task, runs, path, perform, busy }) {
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
      h("small", null, `\u041F\u043E\u043F\u044B\u0442\u043A\u0430 ${task.attempt || 1}${task.archived ? " \xB7 \u0412 \u0430\u0440\u0445\u0438\u0432\u0435" : ""}`),
      task.feedback && h("p", { style: { whiteSpace: "pre-wrap" } }, `\u0417\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u043A \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u043A\u0435: ${task.feedback}`),
      task.cancellation && h("p", null, `\u041F\u0440\u0438\u0447\u0438\u043D\u0430 \u043E\u0442\u043C\u0435\u043D\u044B: ${task.cancellation.reason}`),
      unsettled && h("p", { role: "status" }, "\u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u0435\u0449\u0451 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E \u043A\u0430\u043A \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D\u043D\u043E\u0435. \u041E\u0442\u043C\u0435\u043D\u0430 \u0437\u0430\u0434\u0430\u0447\u0438, \u043D\u043E\u0432\u0430\u044F \u043F\u043E\u043F\u044B\u0442\u043A\u0430, \u0430\u0440\u0445\u0438\u0432 \u0438 \u043F\u0440\u0438\u0451\u043C\u043A\u0430 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u044B. \u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u0435 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0443 \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0449\u0435\u0433\u043E \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F \u0438\u043B\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043F\u043E\u0441\u043B\u0435 \u0441\u0431\u043E\u044F."),
      !task.archived && h(
        "div",
        { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
        cancel && h(Button2, { disabled: busy || unsettled, onClick: () => setAction("cancel") }, "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443"),
        revise && h(Button2, { disabled: busy || unsettled, onClick: () => setAction("revise") }, "\u0412\u0435\u0440\u043D\u0443\u0442\u044C \u043D\u0430 \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u043A\u0443"),
        (unsettled || ["unknown", "team_waiting"].includes(task.status)) && h(Button2, { disabled: busy, onClick: () => setAction("recover") }, "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435")
      ),
      archive && h(Button2, { disabled: busy || unsettled, onClick: () => perform(() => ctx.rest(`${path}/archive`, { method: "POST", body: { archived: !task.archived } })) }, task.archived ? "\u0412\u0435\u0440\u043D\u0443\u0442\u044C \u0438\u0437 \u0430\u0440\u0445\u0438\u0432\u0430" : "\u0423\u0431\u0440\u0430\u0442\u044C \u0432 \u0430\u0440\u0445\u0438\u0432"),
      action && h(
        "section",
        { role: "dialog", "aria-label": "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0437\u0430\u0434\u0430\u0447\u0438", style: panel4 },
        h("p", null, action === "recover" ? "Altron \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442 \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0449\u0438\u0435 \u0441\u0435\u0430\u043D\u0441\u044B Hermes \u0438 \u0437\u0430\u043A\u0440\u043E\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0435\u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0449\u0438\u0439 \u0441\u0442\u0430\u0440\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A. \u0410\u043A\u0442\u0438\u0432\u043D\u043E\u0433\u043E \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F \u044D\u0442\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043D\u0435 \u043E\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0435\u0442. \u041D\u043E\u0432\u043E\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0435 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F; \u043F\u0440\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E\u0439 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0435 \u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u043A\u0430 \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F." : action === "revise" ? "\u0418\u0441\u0442\u043E\u0440\u0438\u044F, \u043F\u0440\u0435\u0436\u043D\u0438\u0439 \u043E\u0442\u0447\u0451\u0442 \u0438 \u0441\u043F\u0438\u0441\u043E\u043A \u0444\u0430\u0439\u043B\u043E\u0432 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F. \u041D\u043E\u0432\u0430\u044F \u043F\u043E\u043F\u044B\u0442\u043A\u0430 \u043E\u0441\u0442\u0430\u043D\u0435\u0442\u0441\u044F \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A\u043E\u043C \u0434\u043E \u043D\u043E\u0432\u043E\u0433\u043E \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u0437\u0430\u043F\u0443\u0441\u043A\u0430." : "\u041F\u043B\u0430\u043D \u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F. \u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u044D\u0442\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0438 \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435 \u0431\u0443\u0434\u0435\u0442 \u043E\u0436\u0438\u0434\u0430\u0442\u044C\u0441\u044F."),
        action !== "recover" && h(
          "label",
          { style: stack4 },
          h("span", null, action === "revise" ? "\u0427\u0442\u043E \u0438\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C" : "\u041F\u0440\u0438\u0447\u0438\u043D\u0430 \u043E\u0442\u043C\u0435\u043D\u044B"),
          h(Textarea, { "aria-label": action === "revise" ? "\u0427\u0442\u043E \u0438\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C" : "\u041F\u0440\u0438\u0447\u0438\u043D\u0430 \u043E\u0442\u043C\u0435\u043D\u044B", value: feedback, rows: 3, maxLength: action === "revise" ? 16e3 : 2e3, disabled: busy, onChange: (e) => setFeedback(e.target.value) })
        ),
        h(Button2, { disabled: busy || action !== "recover" && !feedback.trim(), onClick: submit }, "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438"),
        h(Button2, { disabled: busy, onClick: () => setAction(null) }, "\u041E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0431\u0435\u0437 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439")
      ),
      task.recovery && h("p", { role: "status" }, task.recovery.active_runs.length ? "Hermes \u0432\u0441\u0451 \u0435\u0449\u0451 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u0440\u0430\u0431\u043E\u0442\u0443. \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u043B\u0441\u044F." : "\u0421\u0432\u0435\u0440\u043A\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u044F \u043D\u0435\u0442; \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0430\u043B\u044C\u043D\u0435\u0439\u0448\u0435\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435."),
      task.attempts?.length > 0 && h(
        "details",
        { style: panel4 },
        h("summary", null, "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u043E\u043F\u044B\u0442\u043E\u043A"),
        h("p", null, "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B \u043F\u0440\u0435\u0436\u043D\u0438\u0435 \u043F\u043B\u0430\u043D\u044B, \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F, \u043E\u0442\u0447\u0451\u0442\u044B \u0438 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u044B\u0435 \u0441\u0443\u043C\u043C\u044B. \u0424\u0430\u0439\u043B\u044B \u0432 \u0440\u0430\u0431\u043E\u0447\u0435\u0439 \u043F\u0430\u043F\u043A\u0435 \u043C\u043E\u0433\u0443\u0442 \u0431\u044B\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u044B \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0439 \u043F\u043E\u043F\u044B\u0442\u043A\u043E\u0439; \u044D\u0442\u043E \u043D\u0435 \u0441\u0438\u0441\u0442\u0435\u043C\u0430 \u0432\u0435\u0440\u0441\u0438\u0439 \u0444\u0430\u0439\u043B\u043E\u0432."),
        ...task.attempts.map((previous) => h(
          "section",
          { key: previous.attempt, style: panel4 },
          h("strong", null, `\u041F\u043E\u043F\u044B\u0442\u043A\u0430 ${previous.attempt}`),
          ...["plan", "feedback", "summary"].filter((key) => previous[key]).map((key) => h("p", { key, style: { whiteSpace: "pre-wrap" } }, previous[key])),
          previous.acceptance_review && h("p", null, `\u041F\u0440\u0438\u0451\u043C\u043A\u0430: ${previous.acceptance_review.text}`),
          ...(previous.artifacts || []).map((file) => h("code", { key: file.path, style: { overflowWrap: "anywhere" } }, `${file.path} \xB7 ${file.sha256}`))
        ))
      )
    );
  };
}

// altron/ui/view.mjs
var statuses2 = { cancelled: "\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C", team_waiting: "\u041F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u043C\u0435\u0436\u0434\u0443 \u0448\u0430\u0433\u0430\u043C\u0438 \u043A\u043E\u043C\u0430\u043D\u0434\u044B", interrupted: "\u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E", draft: "\u041D\u0443\u0436\u0435\u043D \u043F\u043B\u0430\u043D", approved: "\u041F\u043B\u0430\u043D \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D", launching: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u0437\u0430\u043F\u0443\u0441\u043A\u0430", planning: "Altron \u0441\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 \u043F\u043B\u0430\u043D", running: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435", reviewing: "\u0418\u0434\u0451\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430", review: "\u041D\u0443\u0436\u043D\u0430 \u043F\u0440\u0438\u0451\u043C\u043A\u0430", done: "\u041F\u0440\u0438\u043D\u044F\u0442\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C", failed: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E \u0441 \u043E\u0448\u0438\u0431\u043A\u043E\u0439", unknown: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E", cancel_requested: "\u0417\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u0430 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430", reported: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u0435\u0440\u0435\u0434\u0430\u043D", prepared: "\u0417\u0430\u043F\u0443\u0441\u043A \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D" };
var roles2 = { technical: "\u0422\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0440\u0430\u0431\u043E\u0442\u0430", business: "\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u0431\u0438\u0437\u043D\u0435\u0441", memory: "\u0420\u0435\u0448\u0435\u043D\u0438\u044F \u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044F", altron: "Altron \u2014 \u0441\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043F\u043B\u0430\u043D", reviewer: "\u041E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0449\u0438\u0439" };
var errors = { runtime_state_changed: "\u0412\u043E \u0432\u0440\u0435\u043C\u044F \u0441\u0432\u0435\u0440\u043A\u0438 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u043E\u0441\u044C. \u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u043A\u0430\u043B\u043E\u0441\u044C; \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u043D\u043E\u0432\u0430.", runtime_unavailable: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C\u0441\u044F \u043A \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0435 \u0438\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0439 Hermes. \u0411\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430; \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 Hermes \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F, \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A \u0437\u0430\u0434\u0430\u043D\u0438\u044F.", runtime_scope_mismatch: "\u0417\u0430\u043F\u0443\u0441\u043A \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043A \u0434\u0440\u0443\u0433\u043E\u0439 \u043F\u0430\u043F\u043A\u0435 \u0438\u043B\u0438 \u043F\u0440\u043E\u0444\u0438\u043B\u044E. \u041E\u043D \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u0451\u043D.", runtime_state_unconfirmed: "Hermes \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u043B \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435. \u0411\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430.", run_budget_exhausted: "\u0418\u0441\u0447\u0435\u0440\u043F\u0430\u043D \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u044B\u0439 \u043B\u0438\u043C\u0438\u0442 \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u0432 \u043F\u0440\u043E\u0435\u043A\u0442\u0430. \u0418\u0437\u043C\u0435\u043D\u0438\u0442\u0435 \u0435\u0433\u043E \u044F\u0432\u043D\u043E \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0439.", task_archived: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u0435\u0440\u043D\u0438\u0442\u0435 \u0437\u0430\u0434\u0430\u0447\u0443 \u0438\u0437 \u0430\u0440\u0445\u0438\u0432\u0430.", scope_changed: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0438\u043B\u0438 \u043F\u0440\u043E\u0435\u043A\u0442 \u0441\u043C\u0435\u043D\u0438\u043B\u0441\u044F. \u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E.", model_mismatch: "Hermes \u0432\u0435\u0440\u043D\u0443\u043B \u0434\u0440\u0443\u0433\u0443\u044E \u043C\u043E\u0434\u0435\u043B\u044C \u0438\u043B\u0438 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430. \u0417\u0430\u0434\u0430\u043D\u0438\u0435 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E.", model_and_provider_required: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u043E\u0434\u0435\u043B\u044C \u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u0435\u0451 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430.", project_overlap: "\u042D\u0442\u0430 \u043F\u0430\u043F\u043A\u0430 \u0443\u0436\u0435 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043A \u0434\u0440\u0443\u0433\u043E\u043C\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0443. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0443\u044E \u043F\u0430\u043F\u043A\u0443.", directory_not_found: "\u041F\u0430\u043F\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430. \u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0435\u0451 \u0432 \u041F\u0440\u043E\u0432\u043E\u0434\u043D\u0438\u043A\u0435 \u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C.", directory_must_be_absolute: "\u041D\u0443\u0436\u0435\u043D \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0439 \u043F\u0430\u043F\u043A\u0435.", directory_too_broad: "\u041D\u0443\u0436\u043D\u0430 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0430\u044F \u043F\u0430\u043F\u043A\u0430 \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u043D\u0435 \u0432\u0435\u0441\u044C \u0434\u0438\u0441\u043A \u0438\u043B\u0438 \u043F\u0440\u043E\u0444\u0438\u043B\u044C Hermes.", artifact_changed: "\u0424\u0430\u0439\u043B \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430. \u041F\u0440\u0438\u0451\u043C\u043A\u0430 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u0430.", artifact_unavailable: "\u041E\u0434\u0438\u043D \u0438\u0437 \u0444\u0430\u0439\u043B\u043E\u0432 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u041F\u0440\u0438\u0451\u043C\u043A\u0430 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u0430.", run_state_unconfirmed: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430. \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0439 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u043D\u0435\u0442.", run_already_starting: "\u042D\u0442\u043E\u0442 \u0437\u0430\u043F\u0443\u0441\u043A \u0443\u0436\u0435 \u043E\u0431\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u0435\u0442\u0441\u044F." };
var stack3 = { display: "grid", gap: 12, minWidth: 0, overflowWrap: "anywhere" };
var row3 = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" };
var panel3 = { ...stack3, padding: 16, border: "1px solid var(--ui-stroke-secondary)", borderRadius: 10 };
var muted2 = { color: "var(--ui-text-secondary)", fontSize: 13 };
function createView(React2, sdk2, ctx, coordinator) {
  const { createElement: h, useEffect, useMemo, useRef, useState } = React2;
  const { Button: Button2, Input, Textarea, useValue, useQuery, useQueryClient, host: host2 } = sdk2;
  const field = (label, control) => h("label", { style: { ...stack3, gap: 5 } }, h("span", null, label), React2.cloneElement(control, { "aria-label": label }));
  const paragraph = (value) => h("p", { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 } }, value);
  const Maintenance = createMaintenanceView(React2, sdk2, ctx);
  const MissionView = createMissionView(React2, sdk2, ctx);
  const { Connections, FolderPicker, Diagnostics } = createWorkspaceTools(React2, sdk2, ctx);
  const TaskControls = createTaskControls(React2, sdk2, ctx);
  const { TeamSettings, TaskTeam } = createTeamViews(React2, sdk2, ctx, coordinator);
  function Task({ task, project, perform, actions, busy, model, provider }) {
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
      h("div", { style: row3 }, h("strong", null, task.goal), h("span", { style: muted2 }, statuses2[task.status] || task.status)),
      h("div", null, h("strong", null, "\u041A\u0440\u0438\u0442\u0435\u0440\u0438\u0438 \u0433\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u0438"), paragraph(task.acceptance)),
      h(TaskControls, { key: task.attempt || 1, task, runs, path, perform, busy }),
      h("p", { style: muted2 }, task.archived ? "\u0417\u0430\u0434\u0430\u0447\u0430 \u0432 \u0430\u0440\u0445\u0438\u0432\u0435. \u0412\u0435\u0440\u043D\u0438\u0442\u0435 \u0435\u0451, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C." : task.status === "draft" ? "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433: \u0441\u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u043B\u0430\u043D \u0441\u0430\u043C\u0438 \u0438\u043B\u0438 \u043F\u043E\u043F\u0440\u043E\u0441\u0438\u0442\u0435 Altron. \u0414\u043E \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u0438\u044F \u0440\u0430\u0431\u043E\u0442\u0430 \u043D\u0435 \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F." : task.status === "approved" ? "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433: \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0437\u0430\u043F\u0443\u0441\u043A. \u041B\u0438\u0431\u043E \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u0435 \u043F\u043B\u0430\u043D." : task.status === "review" ? "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433: \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0444\u0430\u0439\u043B\u044B, \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043A\u0440\u0438\u0442\u0435\u0440\u0438\u0438 \u0438 \u043F\u0440\u0438\u043C\u0438\u0442\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0438\u043B\u0438 \u0432\u0435\u0440\u043D\u0438\u0442\u0435 \u043D\u0430 \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u043A\u0443." : ["failed", "interrupted", "unknown"].includes(task.status) ? "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433: \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 Hermes. \u041F\u043E\u0441\u043B\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E\u0439 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u043C\u043E\u0436\u043D\u043E \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u044D\u0442\u0443 \u0436\u0435 \u0437\u0430\u0434\u0430\u0447\u0443." : ""),
      task.status === "draft" && !task.archived ? h(
        "div",
        { style: stack3 },
        field("\u041F\u043B\u0430\u043D \u0434\u043B\u044F \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u0438\u044F", h(Textarea, { value: plan, rows: 4, maxLength: 16e3, onChange: (e) => setPlan(e.target.value), disabled: busy })),
        h(
          "div",
          { style: row3 },
          h(Button2, { onClick: () => setConfirmRole("altron"), disabled: busy || !routeFor("altron").model || !routeFor("altron").provider }, "\u041F\u043E\u043F\u0440\u043E\u0441\u0438\u0442\u044C Altron \u0441\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043F\u043B\u0430\u043D"),
          h(Button2, { onClick: () => perform(() => ctx.rest(`${path}/approve`, { method: "POST", body: { plan } })), disabled: busy || !plan.trim() || steps.length > 0 }, "\u0421\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u0442\u044C \u043F\u043B\u0430\u043D")
        )
      ) : h("div", null, h("strong", null, "\u0421\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u043F\u043B\u0430\u043D"), paragraph(task.plan || "\u041F\u043B\u0430\u043D \u0435\u0449\u0451 \u043D\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D.")),
      task.status === "approved" && !task.team && !task.archived && h(
        "div",
        { style: row3 },
        field("\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C", h(
          "select",
          { value: role, onChange: (e) => setRole(e.target.value), disabled: busy, style: { color: "inherit", background: "var(--ui-background)", padding: 8 } },
          ...["technical", "business", "memory"].map((value) => h("option", { key: value, value }, roles2[value]))
        )),
        h(Button2, { disabled: busy || !routeFor(role).model || !routeFor(role).provider, onClick: () => setConfirmRole(role) }, "\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F")
      ),
      h(TaskTeam, { task, project, plan, steps, setSteps, perform, busy: taskBusy }),
      confirmRole && h(
        "section",
        { role: "dialog", "aria-label": "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430", style: panel3 },
        h("strong", null, `\u0417\u0430\u043F\u0443\u0441\u043A: ${roles2[confirmRole]}`),
        paragraph(`\u041F\u0440\u043E\u0435\u043A\u0442: ${project.name}
\u041F\u0430\u043F\u043A\u0430: ${project.directory}
\u041C\u043E\u0434\u0435\u043B\u044C: ${confirmRoute.model}
\u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440: ${confirmRoute.provider}`),
        paragraph("\u042D\u0442\u043E \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A \u0432 \u0432\u0430\u0448\u0435\u043C Hermes. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u044B \u0440\u0430\u0441\u0445\u043E\u0434\u044B \u0432\u0430\u0448\u0435\u0433\u043E \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0437\u0430\u043C\u0435\u043D\u044B \u043C\u043E\u0434\u0435\u043B\u0438 \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0439 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 Altron \u043D\u0435 \u0434\u0435\u043B\u0430\u0435\u0442."),
        h("div", { style: row3 }, h(Button2, { disabled: busy, onClick: launch }, "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u0437\u0430\u043F\u0443\u0441\u043A"), h(Button2, { disabled: busy, onClick: () => setConfirmRole(null) }, "\u041D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0442\u044C"))
      ),
      task.summary && h("div", null, h("strong", null, "\u041E\u0442\u0447\u0451\u0442 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F \u2014 \u0435\u0449\u0451 \u043D\u0435 \u043F\u0440\u0438\u0451\u043C\u043A\u0430"), paragraph(task.summary)),
      task.artifacts.length > 0 && h(
        "div",
        { style: stack3 },
        h("strong", null, "\u0420\u0435\u0430\u043B\u044C\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430"),
        ...task.artifacts.map((file) => h(
          "div",
          { key: file.path, style: stack3 },
          h("code", { style: { overflowWrap: "anywhere" } }, file.path),
          h("small", { style: muted2 }, `${file.bytes} \u0431\u0430\u0439\u0442 \xB7 SHA-256 ${file.sha256}`)
        )),
        h(Button2, { disabled: busy, onClick: () => perform(() => ctx.os.revealPath(project.directory)) }, "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0430\u043F\u043A\u0443 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430")
      ),
      task.specialist_review && h("div", null, h("strong", null, "\u0417\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0449\u0435\u0433\u043E"), paragraph(task.specialist_review.text)),
      task.status === "review" && !task.archived && h(
        "div",
        { style: stack3 },
        h(Button2, { disabled: busy || !routeFor("reviewer").model || !routeFor("reviewer").provider, onClick: () => setConfirmRole("reviewer") }, "\u0417\u0430\u043A\u0430\u0437\u0430\u0442\u044C \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0443\u044E \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443"),
        paragraph("\u041C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0444\u0430\u0439\u043B\u044B \u0441\u0430\u043C\u043E\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u043D\u043E. \u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u0430\u044F \u0441\u0443\u043C\u043C\u0430 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u043D\u0435\u0438\u0437\u043C\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u0444\u0430\u0439\u043B\u0430, \u0430 \u043D\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0435\u0433\u043E \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u044F."),
        field("\u0427\u0442\u043E \u0432\u044B \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u043B\u0438 \u043F\u043E \u043A\u0440\u0438\u0442\u0435\u0440\u0438\u044F\u043C \u0437\u0430\u0434\u0430\u0447\u0438", h(Textarea, { value: review, rows: 3, maxLength: 16e3, onChange: (e) => setReview(e.target.value), disabled: busy })),
        h("label", { style: row3 }, h("input", { type: "checkbox", checked, disabled: busy || unsettled, onChange: (e) => setChecked(e.target.checked), "aria-label": "\u042F \u043E\u0442\u043A\u0440\u044B\u043B \u0444\u0430\u0439\u043B\u044B \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u043B \u043A\u0440\u0438\u0442\u0435\u0440\u0438\u0438" }), "\u042F \u043E\u0442\u043A\u0440\u044B\u043B \u0444\u0430\u0439\u043B\u044B \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u043B \u043A\u0440\u0438\u0442\u0435\u0440\u0438\u0438, \u0430 \u043D\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043B \u043E\u0442\u0447\u0451\u0442."),
        h(Button2, { disabled: busy || unsettled || !checked || !review.trim(), onClick: () => perform(() => ctx.rest(`${path}/accept`, { method: "POST", body: { review } })) }, "\u042F \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u043B \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u2014 \u043F\u0440\u0438\u043D\u044F\u0442\u044C")
      ),
      task.acceptance_review && paragraph(`\u041F\u0440\u0438\u0451\u043C\u043A\u0430 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F: ${task.acceptance_review.text}`),
      ...runs.map((run) => h(
        "section",
        { key: run.id, style: { ...panel3, padding: 10 } },
        h("span", null, `${roles2[run.role]} \xB7 ${run.provider} / ${run.model} \xB7 ${statuses2[run.status] || run.status}`),
        h("small", null, `\u041F\u043E\u043F\u044B\u0442\u043A\u0430 ${run.attempt || 1} \xB7 ${elapsedText(run)}`),
        h("p", { style: muted2 }, usageText(run.usage)),
        run.note && paragraph(run.note),
        h(
          "div",
          { style: row3 },
          run.stored_id && h(Button2, { disabled: busy, onClick: () => perform(() => actions.open(run)) }, "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u0438\u0430\u043B\u043E\u0433 \u0432 Hermes"),
          !task.archived && runUnsettled(run) && run.runtime_id && run.status !== "cancel_requested" && h(Button2, { disabled: busy, onClick: () => perform(() => actions.cancel({ projectId: project.id, run })) }, "\u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0443")
        )
      ))
    );
  }
  function Project({ project, perform, actions, busy, model, provider, catalog }) {
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
        h("h3", null, "\u0421\u0435\u0439\u0447\u0430\u0441 \u0432 \u043F\u0440\u043E\u0435\u043A\u0442\u0435"),
        paragraph(`\u041E\u0442\u043A\u0440\u044B\u0442\u044B\u0445 \u0437\u0430\u0434\u0430\u0447: ${counts.active}. \u041D\u0443\u0436\u043D\u0430 \u043F\u0440\u0438\u0451\u043C\u043A\u0430: ${counts.review}. \u041D\u0443\u0436\u0435\u043D \u0440\u0430\u0437\u0431\u043E\u0440 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438: ${counts.blocked}. \u041F\u0440\u0438\u043D\u044F\u0442\u043E: ${counts.done}. \u0412 \u0430\u0440\u0445\u0438\u0432\u0435: ${counts.archived}.`),
        project.decisions.length > 0 && paragraph(`\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u0435: ${project.decisions.at(-1).text}`)
      ),
      h(TeamSettings, { project, perform, busy, model, provider, catalog }),
      h(
        "details",
        { style: panel3 },
        h("summary", null, "\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0435 \u043D\u043E\u0432\u044B\u0445 \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u0432"),
        paragraph(`\u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u044B\u0445 \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u0432: ${project.remaining_runs ?? "\u0431\u0435\u0437 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F"}. \u0421\u0447\u0438\u0442\u0430\u044E\u0442\u0441\u044F \u0438 \u0441\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u043B\u0430\u043D\u0430, \u0438 \u043A\u0430\u0436\u0434\u044B\u0439 \u0448\u0430\u0433 \u043A\u043E\u043C\u0430\u043D\u0434\u044B, \u0438 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430. \u042D\u0442\u043E \u043D\u0435 \u0434\u0435\u043D\u0435\u0436\u043D\u044B\u0439 \u043B\u0438\u043C\u0438\u0442; \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A \u043D\u0435 \u043F\u0440\u0435\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F.`),
        field("\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u0435\u0449\u0451 \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u0432", h(Input, { type: "number", min: 0, max: 1e4, value: budget, placeholder: "\u041F\u0443\u0441\u0442\u043E \u2014 \u0431\u0435\u0437 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F", disabled: busy, onChange: (e) => setBudget(e.target.value) })),
        h(Button2, { disabled: busy || budget !== "" && (!Number.isInteger(Number(budget)) || Number(budget) < 0 || Number(budget) > 1e4), onClick: () => perform(() => ctx.rest(`/projects/${project.id}/budget`, { method: "POST", body: { remaining: budget === "" ? null : Number(budget), confirm: true } })) }, "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u043B\u0438\u043C\u0438\u0442 \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u0432")
      ),
      h(
        "form",
        { style: panel3, onSubmit: addTask },
        h("h3", null, "\u041D\u043E\u0432\u0430\u044F \u0437\u0430\u0434\u0430\u0447\u0430"),
        h(Button2, { type: "button", disabled: busy || Boolean(goal || acceptance), onClick: () => {
          setGoal(demoTask.goal);
          setAcceptance(demoTask.acceptance);
        } }, "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0443\u0447\u0435\u0431\u043D\u044B\u0439 \u043F\u0440\u0438\u043C\u0435\u0440"),
        h("p", { style: muted2 }, "\u041F\u0440\u0438\u043C\u0435\u0440 \u0442\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u0444\u043E\u0440\u043C\u0443: \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 \u0441 \u043A\u043D\u043E\u043F\u043A\u043E\u0439 \u0438 \u0435\u0451 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443. \u0421\u043E\u0437\u0434\u0430\u043D\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u0438 \u0437\u0430\u043F\u0443\u0441\u043A \u043F\u043E\u0442\u0440\u0435\u0431\u0443\u044E\u0442 \u0432\u0430\u0448\u0438\u0445 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0445 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439."),
        field("\u041A\u0430\u043A\u043E\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043D\u0443\u0436\u0435\u043D", h(Textarea, { required: true, value: goal, rows: 3, maxLength: 16e3, onChange: (e) => setGoal(e.target.value), disabled: busy })),
        field("\u041A\u0430\u043A \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0433\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u044C", h(Textarea, { required: true, value: acceptance, rows: 3, maxLength: 16e3, onChange: (e) => setAcceptance(e.target.value), disabled: busy })),
        h(Button2, { type: "submit", disabled: busy || !goal.trim() || !acceptance.trim() }, "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443")
      ),
      field("\u041F\u043E\u0438\u0441\u043A \u0437\u0430\u0434\u0430\u0447", h(Input, { value: search, onChange: (e) => setSearch(e.target.value) })),
      h("label", { style: row3 }, h("input", { type: "checkbox", checked: showArchived, onChange: (e) => setShowArchived(e.target.checked), "aria-label": "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0430\u0440\u0445\u0438\u0432" }), "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0430\u0440\u0445\u0438\u0432"),
      ...project.tasks.filter((task) => Boolean(task.archived) === showArchived && `${task.goal} ${task.acceptance}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).slice().reverse().map((task) => h(Task, { key: `${task.id}:${task.attempt || 1}`, task, project, perform, actions, busy, model, provider })),
      h(
        "section",
        { style: panel3 },
        h("h3", null, "\u0420\u0435\u0448\u0435\u043D\u0438\u044F \u043F\u0440\u043E\u0435\u043A\u0442\u0430"),
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
          field("\u041D\u043E\u0432\u043E\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u0435", h(Textarea, { required: true, value: decision, maxLength: 16e3, onChange: (e) => setDecision(e.target.value), disabled: busy })),
          h(Button2, { type: "submit", disabled: busy || !decision.trim() }, "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0440\u0435\u0448\u0435\u043D\u0438\u0435")
        )
      )
    );
  }
  function Workspace({ profile, gateway, epoch, connectionId }) {
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
      } catch (failure2) {
        if (live.current) {
          const code = Object.keys(errors).find((value) => String(failure2?.message).includes(value));
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
      { style: { ...stack3, padding: 24, maxWidth: 1080, margin: "0 auto", overflow: "auto", height: "100%" } },
      h("header", null, h("h1", null, "Altron"), h("p", { style: muted2 }, "\u0420\u0430\u0441\u0441\u043A\u0430\u0436\u0438\u0442\u0435 \u043E\u0431 \u0438\u0434\u0435\u0435. Altron \u0443\u0442\u043E\u0447\u043D\u0438\u0442 \u0437\u0430\u0434\u0430\u0447\u0443, \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442 \u0440\u0430\u0431\u043E\u0442\u0443 \u0438 \u043F\u043E\u043A\u0430\u0436\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442.")),
      gateway !== "open" && h("p", { role: "status" }, "\u041D\u0435\u0442 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u043A Hermes. \u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0441 \u0437\u0430\u0434\u0430\u0447\u0430\u043C\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B."),
      workspace.isLoading && h("p", { role: "status" }, "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 Altron\u2026"),
      workspace.error && h("p", { role: "alert" }, "API Altron \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435, \u0447\u0442\u043E Python-\u0447\u0430\u0441\u0442\u044C \u043F\u0430\u043A\u0435\u0442\u0430 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0430 \u0432 \u044D\u0442\u043E\u043C \u043F\u0440\u043E\u0444\u0438\u043B\u0435 Hermes."),
      error && h("p", { role: "alert" }, error),
      h("nav", { style: row3, "aria-label": "\u0420\u0435\u0436\u0438\u043C Altron" }, ...[["mission", "\u0410\u0432\u0442\u043E\u043D\u043E\u043C\u043D\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442"], ["manual", "\u0420\u0443\u0447\u043D\u043E\u0439 \u0440\u0435\u0436\u0438\u043C"]].map(([value, label]) => h(Button2, { key: value, variant: mode === value ? "secondary" : "ghost", "aria-pressed": mode === value, onClick: () => setMode(value) }, label))),
      h(Button2, { disabled: busy || gateway !== "open", onClick: refresh }, "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435"),
      workspace.data && h(Connections, { profile, queryKey, gateway, model, provider, setModel, setProvider, busy }),
      workspace.data && mode === "mission" && h(MissionView, { key: workspace.data.workspace_id, profile, gateway, connectionId, queryKey, workspaceId: workspace.data.workspace_id, model, provider }),
      workspace.data && mode === "manual" && h(
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
          { open: workspace.data.projects.length === 0, style: panel3 },
          h("summary", null, "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442"),
          h(
            "form",
            { onSubmit: addProject, style: stack3 },
            field("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430", h(Input, { required: true, value: name, maxLength: 200, onChange: (e) => setName(e.target.value), disabled: busy })),
            field("\u041F\u0430\u043F\u043A\u0430 \u043F\u0440\u043E\u0435\u043A\u0442\u0430", h(Input, { required: true, value: directory, placeholder: "\u041F\u043E\u043B\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0439 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0439 \u043F\u0430\u043F\u043A\u0435", maxLength: 4096, onChange: (e) => setDirectory(e.target.value), disabled: busy })),
            h(FolderPicker, { directory, onChoose: setDirectory, busy }),
            h("p", { style: muted2 }, "\u041D\u0435 \u0432\u044B\u0431\u0438\u0440\u0430\u0439\u0442\u0435 \u0432\u0435\u0441\u044C \u0434\u0438\u0441\u043A \u0438\u043B\u0438 \u043F\u0430\u043F\u043A\u0443 Hermes. Altron \u043D\u0435 \u043A\u043E\u043F\u0438\u0440\u0443\u0435\u0442 \u0441\u0442\u0430\u0440\u044B\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u044B \u0438 \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u0451\u0442 \u0437\u0430\u0434\u0430\u0447\u0438 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438."),
            h(Button2, { type: "submit", disabled: busy || !name.trim() || !directory.trim() }, "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442")
          )
        ),
        project.error && h("p", { role: "alert" }, "\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u0427\u0443\u0436\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043D\u0435 \u043F\u043E\u0434\u0441\u0442\u0430\u0432\u043B\u044F\u044E\u0442\u0441\u044F."),
        pid && project.data?.id === pid && (project.data.autonomy_id ? paragraph("\u042D\u0442\u043E\u0442 \u043F\u0440\u043E\u0435\u043A\u0442 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u0432 \u0430\u0432\u0442\u043E\u043D\u043E\u043C\u043D\u043E\u043C \u0440\u0435\u0436\u0438\u043C\u0435. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0435\u0433\u043E \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 \xAB\u0410\u0432\u0442\u043E\u043D\u043E\u043C\u043D\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442\xBB.") : h(Project, { key: pid, project: project.data, perform, actions, busy, model, provider, catalog: catalog.data }))
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
