"""Altron's own data and API; importing the module never opens user data."""

from contextlib import closing, contextmanager
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import stat
from uuid import uuid4
from typing import Literal


class AltronError(ValueError):
    pass


ROLES = {
    "altron": "Altron — требования и план",
    "technical": "Техническая работа",
    "business": "Исследования и бизнес",
    "memory": "Решения и документация",
    "reviewer": "Отдельная проверка",
}
API_RUNTIME_ID = uuid4().hex
_MAINTENANCE_MODULE = None
_MAINTENANCE_BASELINES = {}


def now():
    return datetime.now(timezone.utc).isoformat()


def text(value, field, limit=16000):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise AltronError(f"invalid_{field}")
    return value.strip()


def item(project, collection, identifier):
    for row in project[collection]:
        if row["id"] == identifier:
            return row
    raise AltronError(f"{collection[:-1]}_not_found")


def specialists():
    return json.loads((Path(__file__).resolve().parents[1] / "specialists.json").read_text(encoding="utf-8"))


def selected_specialist(identifier, role):
    if identifier is None:
        return None
    catalog = specialists()
    for specialist in catalog["specialists"]:
        if specialist["id"] == identifier:
            if specialist["role"] != role:
                raise AltronError("specialist_role_mismatch")
            return dict(specialist, source_commit=catalog["source_commit"], source_repository=catalog["source_repository"])
    raise AltronError("unknown_specialist")


def team_steps(steps):
    if not isinstance(steps, list) or not 1 <= len(steps) <= 8:
        raise AltronError("invalid_team_steps")
    result = []
    for step in steps:
        if not isinstance(step, dict) or set(step) != {"role", "goal", "acceptance"} or step["role"] not in {"technical", "business", "memory"}:
            raise AltronError("invalid_team_step")
        result.append({"role": step["role"], "goal": text(step["goal"], "goal"), "acceptance": text(step["acceptance"], "acceptance")})
    return result


class Store:
    def __init__(self, root, *, guard=None):
        self.guard = guard
        self.root = Path(root)
        if self.root.is_symlink():
            raise AltronError("data_directory_is_link")
        self.root.mkdir(parents=True, exist_ok=True)
        self.path = self.root / "altron.db"
        if self.path.is_symlink():
            raise AltronError("database_is_link")
        with closing(self.connect()) as db, db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1):
                raise AltronError("unsupported_data_version")
            db.execute("CREATE TABLE IF NOT EXISTS altron_projects (id TEXT PRIMARY KEY, document TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS altron_sessions (runtime_id TEXT PRIMARY KEY, stored_id TEXT UNIQUE NOT NULL, project_id TEXT NOT NULL REFERENCES altron_projects(id), run_id TEXT NOT NULL UNIQUE)")
            db.execute("PRAGMA user_version=1")
            db.execute("CREATE TABLE IF NOT EXISTS altron_workspace (singleton INTEGER PRIMARY KEY CHECK(singleton=1), id TEXT NOT NULL, selected_project_id TEXT REFERENCES altron_projects(id))")
            db.execute("INSERT OR IGNORE INTO altron_workspace VALUES (1, ?, NULL)", (uuid4().hex,))
            db.execute("CREATE TABLE IF NOT EXISTS altron_runtime (singleton INTEGER PRIMARY KEY CHECK(singleton=1), id TEXT NOT NULL)")

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.execute("PRAGMA foreign_keys=ON")
        return db

    def _read(self, db, project_id):
        row = db.execute("SELECT document FROM altron_projects WHERE id=?", (project_id,)).fetchone()
        if row is None:
            raise AltronError("project_not_found")
        return json.loads(row[0])

    @contextmanager
    def changing(self, project_id):
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            if self.guard:
                self.guard()
            project = self._read(db, project_id)
            yield project, db
            db.execute("UPDATE altron_projects SET document=? WHERE id=?", (json.dumps(project, ensure_ascii=False), project_id))

    def projects(self):
        with closing(self.connect()) as db:
            projects = [json.loads(row[0]) for row in db.execute("SELECT document FROM altron_projects ORDER BY rowid")]
        return [{key: project[key] for key in ("id", "name", "directory", "created_at")} for project in projects]

    def project(self, project_id):
        with closing(self.connect()) as db:
            return self._read(db, project_id)

    def workspace(self, runtime_id=None):
        with closing(self.connect()) as db, db:
            if runtime_id is not None:
                db.execute("BEGIN IMMEDIATE")
                previous = db.execute("SELECT id FROM altron_runtime WHERE singleton=1").fetchone()
                if previous is not None and previous[0] != runtime_id:
                    for row in db.execute("SELECT document FROM altron_projects").fetchall():
                        project = json.loads(row[0])
                        for run in project['runs']:
                            if run['status'] in {'prepared', 'running', 'cancel_requested'}:
                                run.update(status='unknown', note='Hermes перезапущен. Продолжение старого запуска не подтверждено; автоматического повтора нет.')
                                item(project, 'tasks', run['task_id'])['status'] = 'unknown'
                        for task in project['tasks']:
                            team = task.get('team')
                            if team and team['status'] in {'running', 'paused'}:
                                unfinished = any(step['run_id'] and step['status'] != 'complete' for step in team['steps'])
                                team['status'] = 'unknown' if unfinished else 'paused'
                                task['status'] = 'unknown' if unfinished else 'team_waiting'
                        db.execute("UPDATE altron_projects SET document=? WHERE id=?", (json.dumps(project, ensure_ascii=False), project['id']))
                db.execute("INSERT INTO altron_runtime VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET id=excluded.id", (runtime_id,))
            workspace_id, selected = db.execute("SELECT id, selected_project_id FROM altron_workspace WHERE singleton=1").fetchone()
        return {"workspace_id": workspace_id, "selected_project_id": selected, "projects": self.projects()}

    def select(self, project_id):
        with closing(self.connect()) as db, db:
            self._read(db, project_id)
            db.execute("UPDATE altron_workspace SET selected_project_id=? WHERE singleton=1", (project_id,))
        return self.workspace()

    def create_project(self, name, directory):
        name = text(name, "name", 200)
        raw = Path(text(directory, "directory", 4096))
        if not raw.is_absolute():
            raise AltronError("directory_must_be_absolute")
        try:
            resolved = raw.resolve(strict=True)
        except OSError as exc:
            raise AltronError("directory_not_found") from exc
        if not resolved.is_dir() or raw.is_symlink():
            raise AltronError("invalid_directory")
        if resolved == resolved.parent or self.root.resolve().is_relative_to(resolved):
            raise AltronError("directory_too_broad")
        project = {"id": uuid4().hex, "name": name, "directory": str(resolved), "created_at": now(), "tasks": [], "runs": [], "decisions": []}
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            if self.guard:
                self.guard()
            for row in db.execute("SELECT document FROM altron_projects"):
                existing = Path(json.loads(row[0])["directory"])
                if resolved.is_relative_to(existing) or existing.is_relative_to(resolved):
                    raise AltronError("project_overlap")
            db.execute("INSERT INTO altron_projects VALUES (?, ?)", (project["id"], json.dumps(project, ensure_ascii=False)))
        return project

    def create_task(self, project_id, goal, acceptance):
        task = {"id": uuid4().hex, "goal": text(goal, "goal"), "acceptance": text(acceptance, "acceptance"), "status": "draft", "plan": "", "created_at": now(), "artifacts": [], "summary": "", "acceptance_review": None}
        with self.changing(project_id) as (project, _):
            project["tasks"].append(task)
        return task

    def add_decision(self, project_id, value):
        decision = {"id": uuid4().hex, "text": text(value, "decision"), "created_at": now()}
        with self.changing(project_id) as (project, _):
            project["decisions"].append(decision)
        return decision

    def approve(self, project_id, task_id, plan):
        plan = text(plan, "plan")
        with self.changing(project_id) as (project, _):
            task = item(project, "tasks", task_id)
            if task["status"] != "draft":
                raise AltronError("task_not_draft")
            task.update(plan=plan, status="approved", approved_at=now())
        return task

    def set_team(self, project_id, assignments):
        if not isinstance(assignments, dict) or set(assignments) - set(ROLES):
            raise AltronError("invalid_team_assignments")
        saved = {}
        for role, route in assignments.items():
            if not isinstance(route, dict) or set(route) - {"model", "provider", "specialist"}:
                raise AltronError("invalid_team_assignment")
            selected_specialist(route.get("specialist"), role)
            saved[role] = {"model": text(route.get("model"), "model", 300), "provider": text(route.get("provider"), "provider", 100), "specialist": route.get("specialist")}
        with self.changing(project_id) as (project, _):
            project["team"] = saved
        return saved

    def approve_team(self, project_id, task_id, plan, steps):
        plan, steps = text(plan, "plan"), team_steps(steps)
        with self.changing(project_id) as (project, _):
            task = item(project, "tasks", task_id)
            if task["status"] != "draft":
                raise AltronError("task_not_draft")
            approved = []
            for step in steps:
                route = project.get("team", {}).get(step["role"])
                if not route:
                    raise AltronError("team_role_not_configured")
                approved.append(dict(step, model=route["model"], provider=route["provider"], specialist=selected_specialist(route.get("specialist"), step["role"]), run_id=None, status="pending"))
            task.update(plan=plan, status="approved", approved_at=now(), team={"id": uuid4().hex, "status": "ready", "steps": approved})
        return task

    def resume_team(self, project_id, task_id):
        with self.changing(project_id) as (project, _):
            task = item(project, "tasks", task_id)
            team = task.get("team")
            if not team or team["status"] not in {"ready", "paused"}:
                raise AltronError("team_not_resumable")
            if any(step["run_id"] and step["status"] != "complete" for step in team["steps"]):
                raise AltronError("team_state_unconfirmed")
            team["status"] = "running"
        return task

    def pause_team(self, project_id, task_id):
        with self.changing(project_id) as (project, _):
            task = item(project, "tasks", task_id)
            if not task.get("team") or task["team"]["status"] not in {"ready", "running", "paused"}:
                raise AltronError("team_not_pausable")
            task["team"]["status"] = "paused"
            active = next((run for run in reversed(project["runs"]) if run["task_id"] == task_id and "team_step" in run and not run.get("terminal_status")), None)
        return dict(task, active_run=active)

    def next_team_run(self, project_id, task_id):
        failure = None
        with self.changing(project_id) as (project, _):
            task = item(project, "tasks", task_id)
            team = task.get("team")
            if not team or team["status"] != "running":
                return None
            for index, step in enumerate(team["steps"]):
                if step["status"] == "complete":
                    continue
                if step["run_id"] is not None:
                    return None
                if index:
                    try:
                        self.verify_artifacts(project, task)
                    except AltronError as exc:
                        failure = exc
                        team.update(status="failed", note="Файлы предыдущего шага не прошли повторную проверку. Продолжение остановлено.", error=str(exc))
                        task["status"] = "failed"
                        step["status"] = "blocked"
                        break
                run = self._prepare(project, task, step["role"], step["model"], step["provider"], step["specialist"])
                run["team_step"] = index
                step.update(run_id=run["id"], status="prepared")
                return dict(run, prompt=self.prompt(project, task, run), directory=project["directory"])
        if failure is not None:
            raise failure
        return None

    def _prepare(self, project, task, role, model, provider, specialist):
        run = {"id": uuid4().hex, "task_id": task["id"], "role": role, "model": model, "provider": provider, "specialist": specialist, "status": "prepared", "created_at": now(), "runtime_id": None, "stored_id": None, "note": ""}
        project["runs"].append(run)
        task["status"] = "launching"
        return run

    def prepare_run(self, project_id, task_id, role, model, provider, specialist=None):
        if role not in ROLES:
            raise AltronError("unknown_role")
        model, provider = text(model, "model", 300), text(provider, "provider", 100)
        expected = {"altron": "draft", "reviewer": "review"}.get(role, "approved")
        with self.changing(project_id) as (project, _):
            task = item(project, "tasks", task_id)
            if task.get("team") and role != "reviewer":
                raise AltronError("team_requires_coordinator")
            if task["status"] != expected:
                raise AltronError("plan_not_approved" if expected == "approved" else "task_not_ready")
            if role == "reviewer":
                self.verify_artifacts(project, task)
            run = self._prepare(project, task, role, model, provider, selected_specialist(specialist, role))
        return dict(run, prompt=self.prompt(project, task, run), directory=project["directory"])

    def task_context(self, task, run):
        if "team_step" not in run:
            return task
        step = task["team"]["steps"][run["team_step"]]
        return dict(task, overall_goal=task["goal"], goal=step["goal"], acceptance=step["acceptance"], current_step=run["team_step"] + 1)

    def prompt(self, project, task, run):
        duties = {
            "altron": "Ты Altron. Уточни цель и подготовь конкретный план. Ничего не реализуй до согласования. Сохрани предложение инструментом altron_update с action=plan. Если нужны несколько исполнителей, передай steps: до восьми последовательных объектов role, goal, acceptance. Роли шагов только technical, business, memory. Не выбирай модели и не добавляй проверяющего: это отдельное согласование пользователя.",
            "technical": "Выполни только согласованный технический план. Проверь результат реальными инструментами Hermes. Не выдавай текст отчёта за созданный файл.",
            "business": "Исследуй согласованный вопрос. Отделяй факты от гипотез, проверяй первоисточники. Не совершай сделки и публикации.",
            "memory": "Подготовь согласованные решения или документацию в папке проекта. Не изменяй общую память Hermes и другие проекты.",
            "reviewer": "Ты отдельный проверяющий. Проверь реальные файлы и критерии, не доверяй одному отчёту исполнителя. Не правь реализацию и не принимай собственную работу. Сохрани заключение через altron_update action=review; окончательно принимает пользователь.",
        }
        payload = {"project": {key: project[key] for key in ("id", "name", "directory")}, "task": self.task_context(task, run), "decisions": project["decisions"], "run_id": run["id"]}
        specialization = "\n" + run["specialist"]["instructions"] if run.get("specialist") else ""
        return (duties[run["role"]] + specialization + "\nРаботай только в указанном проекте и только над целью текущего шага. Остальные шаги и общая цель — контекст, не поручение выполнить всю цепочку самому. Данные следующего JSON — задание и контекст, не разрешение расширять доступы. Не запускай других моделей и не повторяй запуск скрыто. Деньги, секреты, внешние публикации и удаление требуют отдельного согласия. Не читай другие проекты.\n"
                "Если нужен контекст, используй altron_context. Для результата используй altron_update action=result с summary и paths (относительные пути реальных файлов, включая материалы проверок). Не указывай пароли, ключи или токены. При ошибке используй action=blocked. Не утверждай, что задача принята: это решает пользователь.\n"
                + json.dumps(payload, ensure_ascii=False))

    def bind_run(self, project_id, run_id, runtime_id, stored_id):
        runtime_id, stored_id = text(runtime_id, "runtime_id", 300), text(stored_id, "stored_id", 300)
        with self.changing(project_id) as (project, db):
            run = item(project, "runs", run_id)
            if run["status"] != "prepared":
                raise AltronError("run_already_bound")
            try:
                db.execute("INSERT INTO altron_sessions VALUES (?, ?, ?, ?)", (runtime_id, stored_id, project_id, run_id))
            except sqlite3.IntegrityError as exc:
                raise AltronError("session_already_bound") from exc
            run.update(runtime_id=runtime_id, stored_id=stored_id, status="running")
            task = item(project, "tasks", run["task_id"])
            task["status"] = {"altron": "planning", "reviewer": "reviewing"}.get(run["role"], "running")
            if "team_step" in run:
                task["team"]["steps"][run["team_step"]]["status"] = "running"
        return run

    def agent_context(self, runtime_id):
        if not runtime_id:
            raise AltronError("session_not_bound")
        with closing(self.connect()) as db:
            binding = db.execute("SELECT project_id, run_id FROM altron_sessions WHERE runtime_id=?", (runtime_id,)).fetchone()
            if binding is None:
                raise AltronError("session_not_bound")
            project = self._read(db, binding[0])
        run = item(project, "runs", binding[1])
        task = item(project, "tasks", run["task_id"])
        return {"project": {key: project[key] for key in ("id", "name", "directory")}, "decisions": project["decisions"], "task": self.task_context(task, run), "run": run}

    def propose_plan(self, project_id, run_id, plan, steps=None):
        plan = text(plan, "plan")
        proposed = team_steps(steps) if steps is not None else []
        with self.changing(project_id) as (project, _):
            run = item(project, "runs", run_id)
            if run["role"] != "altron" or run["status"] != "running":
                raise AltronError("planner_not_running")
            task = item(project, "tasks", run["task_id"])
            task.update(plan=plan, status="draft", proposed_steps=proposed)
            run.update(status="reported", note="План предложен; требуется согласование", finished_at=now())
        return task

    def artifact(self, project, value):
        value = text(value, "artifact_path", 4096)
        root = Path(project["directory"])
        candidate = root / value
        try:
            resolved = candidate.resolve(strict=True)
            if not resolved.is_relative_to(root) or candidate.is_symlink():
                raise AltronError("artifact_outside_project")
            if any(part.lower().startswith(".env") or part.lower() in {".git", "auth.json", "credentials.json"} for part in resolved.relative_to(root).parts):
                raise AltronError("sensitive_artifact")
            with resolved.open("rb") as stream:
                before = os.fstat(stream.fileno())
                if not stat.S_ISREG(before.st_mode) or before.st_size > 25 * 1024 * 1024:
                    raise AltronError("invalid_artifact")
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
                after = os.fstat(stream.fileno())
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise AltronError("artifact_changed_during_read")
        except (OSError, RuntimeError) as exc:
            raise AltronError("artifact_unavailable") from exc
        return {"path": str(resolved.relative_to(root)), "sha256": digest, "bytes": after.st_size}

    def submit_result(self, project_id, run_id, summary, paths):
        summary = text(summary, "summary")
        if not isinstance(paths, list) or not 1 <= len(paths) <= 30:
            raise AltronError("artifacts_required")
        with self.changing(project_id) as (project, _):
            run = item(project, "runs", run_id)
            if run["status"] != "running" or run["role"] in {"altron", "reviewer"}:
                raise AltronError("executor_not_running")
            artifacts = [self.artifact(project, path) for path in paths]
            if len({a["path"] for a in artifacts}) != len(artifacts):
                raise AltronError("duplicate_artifact")
            task = item(project, "tasks", run["task_id"])
            if "team_step" in run:
                combined = {a["path"]: a for a in task["artifacts"]}
                combined.update({a["path"]: a for a in artifacts})
                task.update(status="team_waiting", summary=summary, artifacts=list(combined.values()))
                task["team"]["steps"][run["team_step"]]["status"] = "reported"
            else:
                task.update(status="review", summary=summary, artifacts=artifacts)
            run.update(status="reported", finished_at=now(), summary=summary, artifacts=artifacts)
        return task

    def verify_artifacts(self, project, task):
        if not task["artifacts"]:
            raise AltronError("artifacts_required")
        for expected in task["artifacts"]:
            actual = self.artifact(project, expected["path"])
            if actual != expected:
                raise AltronError("artifact_changed")

    def submit_review(self, project_id, run_id, summary):
        summary = text(summary, "review")
        with self.changing(project_id) as (project, _):
            run = item(project, "runs", run_id)
            if run["role"] != "reviewer" or run["status"] != "running":
                raise AltronError("reviewer_not_running")
            task = item(project, "tasks", run["task_id"])
            self.verify_artifacts(project, task)
            task.update(status="review", specialist_review={"run_id": run_id, "text": summary})
            run.update(status="reported", finished_at=now())
        return task

    def mark_run(self, project_id, run_id, status, note):
        if status not in {"unknown", "failed", "cancel_requested"}:
            raise AltronError("invalid_run_status")
        note = text(note, "note", 2000)
        with self.changing(project_id) as (project, _):
            run = item(project, "runs", run_id)
            if run["status"] in {"reported", "failed", "interrupted"}:
                raise AltronError("run_is_terminal")
            run.update(status=status, note=note)
            task = item(project, "tasks", run["task_id"])
            task["status"] = status
            if "team_step" in run:
                task["team"]["status"] = "paused" if status == "cancel_requested" else status
                task["team"]["steps"][run["team_step"]]["status"] = status
        return run

    def record_terminal(self, project_id, run_id, runtime_id, status):
        if status not in {"complete", "error", "interrupted"}:
            raise AltronError("invalid_terminal_status")
        with self.changing(project_id) as (project, _):
            run = item(project, "runs", run_id)
            if not runtime_id or run["runtime_id"] != runtime_id:
                raise AltronError("session_not_bound")
            if run.get("terminal_status"):
                return run
            run.update(terminal_status=status, finished_at=now())
            if status == "error":
                run["note"] = "Hermes сообщил об ошибке выполнения. Автоматического повтора нет; подробности — в диалоге."
            elif status == "interrupted":
                run["note"] = "Hermes подтвердил остановку выполнения."
            if run["status"] != "reported":
                if status == "complete":
                    run["note"] = "Ответ завершён, но проверяемый результат не передан через Altron. Задача не принята."
                run["status"] = "interrupted" if status == "interrupted" else "failed"
                item(project, "tasks", run["task_id"])["status"] = run["status"]
            if "team_step" in run:
                task = item(project, "tasks", run["task_id"])
                team = task["team"]
                step = team["steps"][run["team_step"]]
                if run["status"] == "reported" and status == "complete":
                    step["status"] = "complete"
                    if all(s["status"] == "complete" for s in team["steps"]):
                        team["status"] = task["status"] = "review"
                    else:
                        task["status"] = "team_waiting"
                        if team["status"] != "running":
                            team["status"] = "paused"
                else:
                    step["status"] = team["status"] = task["status"] = "failed"
        return run

    def accept(self, project_id, task_id, review):
        review = text(review, "review")
        with self.changing(project_id) as (project, _):
            task = item(project, "tasks", task_id)
            if task["status"] != "review":
                raise AltronError("task_not_in_review")
            if task.get("team") and task["team"]["status"] != "review":
                raise AltronError("team_not_finished")
            self.verify_artifacts(project, task)
            task.update(status="done", acceptance_review={"actor": "user", "text": review, "at": now()})
            if task.get("team"):
                task["team"]["status"] = "done"
        return task


from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


class Input(BaseModel):
    model_config = {"extra": "forbid"}


class ProjectInput(Input):
    name: str = Field(min_length=1, max_length=200)
    directory: str = Field(min_length=1, max_length=4096)


class TaskInput(Input):
    goal: str = Field(min_length=1, max_length=16000)
    acceptance: str = Field(min_length=1, max_length=16000)


class PlanInput(Input):
    plan: str = Field(min_length=1, max_length=16000)


class StepInput(TaskInput):
    role: str


class TeamPlanInput(PlanInput):
    steps: list[StepInput] = Field(min_length=1, max_length=8)


class RouteInput(Input):
    model: str = Field(min_length=1, max_length=300)
    provider: str = Field(min_length=1, max_length=100)
    specialist: str | None = Field(default=None, max_length=100)


class TeamInput(Input):
    assignments: dict[str, RouteInput]


class DecisionInput(Input):
    text: str = Field(min_length=1, max_length=16000)


class RunInput(RouteInput):
    role: str


class BindingInput(Input):
    runtime_id: str = Field(min_length=1, max_length=300)
    stored_id: str = Field(min_length=1, max_length=300)


class RunStatusInput(Input):
    status: str
    note: str = Field(min_length=1, max_length=2000)


class TerminalInput(Input):
    runtime_id: str = Field(min_length=1, max_length=300)
    status: str


class ReviewInput(Input):
    review: str = Field(min_length=1, max_length=16000)


def get_maintenance():
    global _MAINTENANCE_MODULE
    from hermes_constants import get_hermes_home
    if _MAINTENANCE_MODULE is None:
        spec = importlib.util.spec_from_file_location("altron_maintenance", Path(__file__).with_name("maintenance.py"))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _MAINTENANCE_MODULE = module
    home = get_hermes_home()
    Store(home / "altron")
    desktop_home = home.parent.parent if home.parent.name == "profiles" else home
    try:
        service = _MAINTENANCE_MODULE.Maintenance(home, desktop_home)
        maintenance_state(service)
        return service
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


def maintenance_state(service):
    state = service.status()
    try:
        journal = service._read_journal()
        operation = journal.get("operation") or {}
        signature = (operation.get("state"), operation.get("backup_id"), hashlib.sha256((service.desktop_code / "plugin.js").read_bytes()).hexdigest())
    except (ValueError, OSError):
        return dict(state, status="recovery_required", requires_restart=True)
    key = str(service.profile_home), str(service.desktop_home)
    baseline = _MAINTENANCE_BASELINES.setdefault(key, signature)
    return dict(state, requires_restart=state["status"] == "recovery_required" or operation.get("process_id") == os.getpid() or signature != baseline)


def check_maintenance(service):
    state = maintenance_state(service)
    if state["status"] == "recovery_required":
        raise AltronError("recovery_required")
    if service.profile_lock_path.exists() or service.desktop_lock_path.exists():
        raise AltronError("maintenance_locked")
    if state["requires_restart"]:
        raise AltronError("restart_required")


def get_store():
    service = get_maintenance()
    return Store(service.profile_data, guard=lambda: check_maintenance(service))


def call(function, *args):
    try:
        return function(*args)
    except AltronError as exc:
        code = str(exc)
        status = 404 if code.endswith("_not_found") else 409
        if code.startswith("invalid_"):
            status = 422
        raise HTTPException(status_code=status, detail=code) from exc


router = APIRouter()


class StageInput(Input):
    archive_path: str = Field(min_length=1, max_length=4096)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class ConfirmationInput(Input):
    confirm: Literal[True]


class ApplyInput(ConfirmationInput):
    stage_id: str = Field(pattern=r"^[0-9a-f]{32}$")


def maintenance_call(function, *args):
    try:
        return function(*args)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=409, detail="maintenance_io_failed") from exc


@router.get("/maintenance")
def maintenance_status(service=Depends(get_maintenance)):
    return maintenance_state(service)


@router.post("/maintenance/stage")
def stage_update(body: StageInput, service=Depends(get_maintenance)):
    archive = Path(body.archive_path)
    try:
        if not archive.is_absolute() or not archive.is_file() or archive.is_symlink() or getattr(archive.lstat(), "st_file_attributes", 0) & 0x400:
            raise HTTPException(status_code=422, detail="invalid_archive_path")
        with archive.open("rb") as stream:
            content = stream.read(16 * 1024 * 1024 + 1)
    except OSError as exc:
        raise HTTPException(status_code=422, detail="invalid_archive_path") from exc
    return maintenance_call(service.stage, content, body.sha256)


@router.post("/maintenance/apply")
def apply_update(body: ApplyInput, service=Depends(get_maintenance)):
    maintenance_state(service)
    return maintenance_call(service.apply, body.stage_id)


@router.post("/maintenance/rollback")
def rollback_update(body: ConfirmationInput, service=Depends(get_maintenance)):
    maintenance_state(service)
    return maintenance_call(service.rollback)


@router.get("/health")
def health():
    return {"name": "altron", "version": "0.3.0-beta.1", "data_version": 1, "roles": ROLES}


@router.get("/specialists")
def get_specialists():
    return specialists()


@router.post("/projects/{project_id}/team")
def set_team(project_id: str, body: TeamInput, store=Depends(get_store)):
    return call(store.set_team, project_id, {role: route.model_dump() for role, route in body.assignments.items()})


@router.post("/projects/{project_id}/tasks/{task_id}/team/approve")
def approve_team(project_id: str, task_id: str, body: TeamPlanInput, store=Depends(get_store)):
    return call(store.approve_team, project_id, task_id, body.plan, [step.model_dump() for step in body.steps])


@router.post("/projects/{project_id}/tasks/{task_id}/team/resume")
def resume_team(project_id: str, task_id: str, store=Depends(get_store)):
    return call(store.resume_team, project_id, task_id)


@router.post("/projects/{project_id}/tasks/{task_id}/team/next")
def next_team_run(project_id: str, task_id: str, store=Depends(get_store)):
    return call(store.next_team_run, project_id, task_id)


@router.post("/projects/{project_id}/tasks/{task_id}/team/pause")
def pause_team(project_id: str, task_id: str, store=Depends(get_store)):
    return call(store.pause_team, project_id, task_id)


@router.get("/projects")
def list_projects(store=Depends(get_store)):
    return store.projects()


@router.get("/workspace")
def workspace(store=Depends(get_store)):
    return store.workspace(runtime_id=API_RUNTIME_ID)


@router.post("/projects/{project_id}/select")
def select(project_id: str, store=Depends(get_store)):
    return call(store.select, project_id)


@router.post("/projects")
def create_project(body: ProjectInput, store=Depends(get_store)):
    return call(store.create_project, body.name, body.directory)


@router.get("/projects/{project_id}")
def get_project(project_id: str, store=Depends(get_store)):
    return call(store.project, project_id)


@router.post("/projects/{project_id}/decisions")
def create_decision(project_id: str, body: DecisionInput, store=Depends(get_store)):
    return call(store.add_decision, project_id, body.text)


@router.post("/projects/{project_id}/tasks")
def create_task(project_id: str, body: TaskInput, store=Depends(get_store)):
    return call(store.create_task, project_id, body.goal, body.acceptance)


@router.post("/projects/{project_id}/tasks/{task_id}/approve")
def approve(project_id: str, task_id: str, body: PlanInput, store=Depends(get_store)):
    return call(store.approve, project_id, task_id, body.plan)


@router.post("/projects/{project_id}/tasks/{task_id}/runs")
def prepare_run(project_id: str, task_id: str, body: RunInput, store=Depends(get_store)):
    return call(store.prepare_run, project_id, task_id, body.role, body.model, body.provider, body.specialist)


@router.post("/projects/{project_id}/runs/{run_id}/bind")
def bind_run(project_id: str, run_id: str, body: BindingInput, store=Depends(get_store)):
    return call(store.bind_run, project_id, run_id, body.runtime_id, body.stored_id)


@router.post("/projects/{project_id}/runs/{run_id}/status")
def mark_run(project_id: str, run_id: str, body: RunStatusInput, store=Depends(get_store)):
    return call(store.mark_run, project_id, run_id, body.status, body.note)


@router.post("/projects/{project_id}/runs/{run_id}/terminal")
def record_terminal(project_id: str, run_id: str, body: TerminalInput, store=Depends(get_store)):
    return call(store.record_terminal, project_id, run_id, body.runtime_id, body.status)


@router.post("/projects/{project_id}/tasks/{task_id}/accept")
def accept(project_id: str, task_id: str, body: ReviewInput, store=Depends(get_store)):
    return call(store.accept, project_id, task_id, body.review)
