"""Operator endpoints; worker receipts are accepted only by native hooks."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator


class Input(BaseModel):
    model_config = {'extra': 'forbid', 'strict': True}


class Create(Input):
    message: str = Field(min_length=1, max_length=16000)
    model: str = Field(min_length=1, max_length=512)
    provider: str = Field(min_length=1, max_length=200)
    profile: str = Field(min_length=1, max_length=200)


class Answer(Input):
    revision: int = Field(ge=1)
    message: str = Field(min_length=1, max_length=16000)


class Bind(Input):
    turn_id: str = Field(min_length=1, max_length=512)
    runtime_id: str = Field(min_length=1, max_length=512)
    stored_id: str = Field(min_length=1, max_length=512)


class Confirm(Input):
    confirm: bool

    @field_validator('confirm')
    @classmethod
    def confirmed(cls, value):
        if value is not True:
            raise ValueError('confirmation_required')
        return value


class Limits(Confirm):
    max_turns: int = Field(ge=1, le=200)
    max_hours: int = Field(ge=1, le=168)


class Approve(Limits):
    revision: int = Field(ge=1)
    directory: str = Field(min_length=1, max_length=4096)


class Revise(Limits):
    feedback: str = Field(min_length=1, max_length=16000)


def call(function, *args):
    try:
        return function(*args)
    except ValueError as exc:
        code = str(exc)
        raise HTTPException(status_code=404 if code.endswith('_not_found') else 422 if code.startswith('invalid_') else 409, detail=code) from exc
    except OSError as exc:
        raise HTTPException(status_code=409, detail='mission_io_unavailable') from exc


def create_router(get_store, get_missions, get_controller, epoch):
    router = APIRouter(prefix='/missions')

    def read_missions(store):
        missions = get_missions(store)
        missions.reconcile(epoch)
        return missions

    @router.get('')
    def listing(store=Depends(get_store)):
        return call(lambda: read_missions(store).list())

    @router.get('/{mission_id}')
    def detail(mission_id: str, store=Depends(get_store)):
        return call(lambda: read_missions(store).get(mission_id))

    @router.post('')
    def create(body: Create, store=Depends(get_store)):
        return call(lambda: get_missions(store).create(body.message, body.model, body.provider, body.profile))

    @router.post('/{mission_id}/answer')
    def answer(mission_id: str, body: Answer, store=Depends(get_store)):
        return call(lambda: get_missions(store).answer(mission_id, body.revision, body.message))

    @router.post('/{mission_id}/bind')
    def bind(mission_id: str, body: Bind, store=Depends(get_store)):
        def work():
            controller = get_controller(get_missions(store))
            mission = controller.attach(mission_id, body.turn_id, body.runtime_id, body.stored_id)
            controller.wake()
            return mission
        return call(work)

    @router.post('/{mission_id}/approve')
    def approve(mission_id: str, body: Approve, store=Depends(get_store)):
        return call(lambda: get_controller(get_missions(store)).approve(
            mission_id, body.revision, body.directory, body.max_turns, body.max_hours))

    @router.post('/{mission_id}/cancel')
    def cancel(mission_id: str, body: Confirm, store=Depends(get_store)):
        return call(lambda: get_missions(store).cancel(mission_id))

    @router.post('/{mission_id}/resume')
    def resume(mission_id: str, body: Confirm, store=Depends(get_store)):
        return call(lambda: get_controller(get_missions(store)).resume(mission_id))

    @router.post('/{mission_id}/recover')
    def recover(mission_id: str, body: Confirm, store=Depends(get_store)):
        return call(lambda: get_controller(get_missions(store)).recover(mission_id))

    @router.post('/{mission_id}/revise')
    def revise(mission_id: str, body: Revise, store=Depends(get_store)):
        return call(lambda: get_controller(get_missions(store)).revise(mission_id, body.feedback, body.max_turns, body.max_hours))

    return router
