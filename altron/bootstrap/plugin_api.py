import importlib.util
import os
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field


spec = importlib.util.spec_from_file_location("altron_bootstrap_maintenance", Path(__file__).with_name("maintenance.py"))
maintenance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(maintenance)
router = APIRouter()


def get_root():
    from hermes_constants import get_hermes_home
    home = get_hermes_home()
    return home.parent.parent if home.parent.name == "profiles" else home


def targets(root):
    candidates = {"default": root}
    profiles = root / "profiles"
    if profiles.is_dir() and not maintenance._is_linklike(profiles):
        candidates.update({path.name: path for path in profiles.iterdir() if path.is_dir()})
    result = {}
    for name, home in candidates.items():
        try:
            service = maintenance.Maintenance(home, root)
            if (home / "plugins/altron/plugin.yaml").is_file():
                result[name] = service
        except (ValueError, OSError):
            continue
    return result


def get_service(profile: str, root=Depends(get_root)):
    service = targets(root).get(profile)
    if service is None:
        raise HTTPException(status_code=404, detail="altron_profile_not_found")
    return service


def call(function, *args):
    try:
        return function(*args)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=409, detail="maintenance_io_failed") from exc


class StageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    archive_path: str = Field(min_length=1, max_length=4096)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class ConfirmationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm: Literal[True]
    closed_other_windows: Literal[True]


class ApplyInput(ConfirmationInput):
    stage_id: str = Field(pattern=r"^[0-9a-f]{32}$")


@router.get("/targets")
def list_targets(root=Depends(get_root)):
    return {"profiles": sorted(targets(root))}


@router.get("/targets/{profile}/maintenance")
def status(service=Depends(get_service)):
    state = service.status()
    if state["status"] != "recovery_required":
        operation = (service._read_journal().get("operation") or {})
        state["requires_restart"] = operation.get("process_id") == os.getpid()
    return state


class PendingPlanCancellation(ConfirmationInput):
    reason: str = Field(min_length=1, max_length=2000)


@router.get("/targets/{profile}/maintenance/pending-plans")
def pending_plans(service=Depends(get_service)):
    return call(service.pending_plans)


@router.post("/targets/{profile}/maintenance/pending-plans/{project_id}/{task_id}/cancel")
def cancel_pending_plan(project_id: str, task_id: str, body: PendingPlanCancellation, service=Depends(get_service)):
    return call(service.cancel_pending_plan, project_id, task_id, body.reason)


@router.post("/targets/{profile}/maintenance/stage")
def stage(body: StageInput, service=Depends(get_service)):
    archive = Path(body.archive_path)
    try:
        if not archive.is_absolute() or not archive.is_file() or maintenance._is_linklike(archive):
            raise HTTPException(status_code=422, detail="invalid_archive_path")
        with archive.open("rb") as stream:
            content = stream.read(16 * 1024 * 1024 + 1)
    except OSError as exc:
        raise HTTPException(status_code=422, detail="invalid_archive_path") from exc
    return call(service.stage, content, body.sha256)


@router.post("/targets/{profile}/maintenance/apply")
def apply(body: ApplyInput, service=Depends(get_service)):
    return call(service.apply, body.stage_id)


@router.post("/targets/{profile}/maintenance/rollback")
def rollback(body: ConfirmationInput, service=Depends(get_service)):
    return call(service.rollback)
