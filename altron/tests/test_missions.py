from concurrent.futures import ThreadPoolExecutor
import importlib
import json
import sqlite3

import pytest

from altron.dashboard.plugin_api import AltronError, Store
from altron.dashboard.missions import MissionError


def mission_store(store):
    spec = importlib.util.find_spec('altron.dashboard.missions')
    assert spec is not None, 'Persistent interview missions have not been implemented'
    return importlib.import_module('altron.dashboard.missions').MissionStore(store)


def test_interview_is_saved_without_inventing_a_project(tmp_path):
    store = Store(tmp_path / 'data')
    missions = mission_store(store)
    mission = missions.create('Help me reduce repeated paperwork', 'org/chosen:beta', 'custom:research', 'altron')
    assert store.projects() == []
    reopened = mission_store(Store(tmp_path / 'data')).get(mission['id'])
    assert reopened['transcript'] == [{'role': 'user', 'text': 'Help me reduce repeated paperwork'}]
    assert reopened['connection'] == {'model': 'org/chosen:beta', 'provider': 'custom:research', 'profile': 'altron'}
    assert reopened['approval'] is None and reopened['project_id'] is None
    assert reopened['status'] == 'prepared' and reopened['phase'] == 'interview'
    assert missions.list()[0]['id'] == mission['id']
    assert not list(store.root.rglob('*.env'))


@pytest.mark.parametrize('field', ['message', 'model', 'provider', 'profile'])
def test_blank_interview_inputs_do_not_create_a_mission(tmp_path, field):
    missions = mission_store(Store(tmp_path / 'data'))
    fields = dict(message='A useful result', model='chosen', provider='explicit', profile='altron')
    fields[field] = ' '
    with pytest.raises(MissionError, match='invalid_'):
        missions.create(**fields)
    assert missions.list() == []


def test_missions_are_profile_local_and_unknown_ids_do_not_create_data(tmp_path):
    first = mission_store(Store(tmp_path / 'first'))
    second = mission_store(Store(tmp_path / 'second'))
    mission = first.create('Write a report', 'chosen', 'explicit', 'first')
    with pytest.raises(MissionError, match='mission_not_found'):
        second.get(mission['id'])
    assert second.list() == []


def test_schema_one_project_survives_mission_migration(tmp_path):
    root = tmp_path / 'data'
    root.mkdir()
    legacy = {'id': 'a' * 32, 'name': 'Existing project', 'directory': str(tmp_path / 'project'),
              'created_at': '2026-01-01T00:00:00+00:00', 'tasks': [], 'runs': [], 'decisions': []}
    with sqlite3.connect(root / 'altron.db') as db:
        db.execute('CREATE TABLE altron_projects (id TEXT PRIMARY KEY, document TEXT NOT NULL)')
        db.execute('INSERT INTO altron_projects VALUES (?, ?)', (legacy['id'], json.dumps(legacy)))
        db.execute('PRAGMA user_version=1')
    store = Store(root)
    missions = mission_store(store)
    missions.create('Another need', 'chosen', 'explicit', 'altron')
    assert store.project(legacy['id']) == legacy
    with sqlite3.connect(store.path) as db:
        assert db.execute('PRAGMA user_version').fetchone()[0] > 1


CONTRACT = {
    'name': 'A useful report', 'goal': 'Explain the findings',
    'requirements': ['Include the findings and a usage guide'],
    'out_of_scope': ['Publishing externally'],
    'deliverables': [{'path': 'report.txt', 'purpose': 'The report'}],
    'checks': [{'id': 'content', 'label': 'The report contains findings', 'kind': 'file',
                'path': 'report.txt', 'contains': ['Findings']}],
    'plan': 'Research the question, write the report and check its contents.',
}


def report_interview(missions, mission, *, proposal=True, settle=True, contract=CONTRACT):
    turn = mission['turns'][-1]
    runtime, stored = 'runtime-' + turn['id'], 'stored-' + turn['id']
    missions.bind(mission['id'], turn['id'], runtime, stored)
    assert missions.claim(mission['id'], turn['id']) is True
    payload = {'action': 'interview', 'summary': 'A proposed outcome.' if proposal else 'Who will use this result?'}
    if proposal:
        payload['contract'] = contract
    missions.update(runtime, payload)
    missions.terminal(runtime, 'complete')
    if settle:
        missions.settle(mission['id'], turn['id'])
    return missions.get(mission['id'])


def test_followup_and_answer_are_saved_and_do_not_create_a_project(tmp_path):
    store = Store(tmp_path / 'data')
    missions = mission_store(store)
    mission = report_interview(missions, missions.create('A report', 'm', 'p', 'altron'), proposal=False)
    assert mission['status'] == 'waiting'
    answered = missions.answer(mission['id'], mission['revision'], 'New employees will use it.')
    restored = mission_store(Store(store.root)).get(mission['id'])
    assert restored['transcript'][-2:] == [
        {'role': 'assistant', 'text': 'Who will use this result?'},
        {'role': 'user', 'text': 'New employees will use it.'},
    ]
    assert restored['status'] == 'prepared'
    assert restored['turns'][-1]['id'] != mission['turns'][-1]['id']
    assert answered['revision'] == restored['revision']
    assert store.projects() == []


def test_contract_correction_invalidates_previous_confirmation(tmp_path):
    missions = mission_store(Store(tmp_path / 'data'))
    proposal = report_interview(missions, missions.create('A report', 'm', 'p', 'altron'))
    corrected = missions.answer(proposal['id'], proposal['revision'], 'It also needs a glossary.')
    assert corrected['proposal'] is None
    folder = tmp_path / 'project'
    folder.mkdir()
    with pytest.raises(MissionError, match='stale_revision'):
        missions.approve(proposal['id'], proposal['revision'], str(folder), 12, 168)
    assert missions.get(proposal['id'])['approval'] is None


def test_approval_waits_for_actual_runtime_settlement(tmp_path):
    missions = mission_store(Store(tmp_path / 'data'))
    mission = report_interview(missions, missions.create('A report', 'm', 'p', 'altron'), settle=False)
    folder = tmp_path / 'project'
    folder.mkdir()
    with pytest.raises(MissionError, match='mission_not_approvable'):
        missions.approve(mission['id'], mission['revision'], str(folder), 12, 168)
    assert missions.get(mission['id'])['approval'] is None


def test_concurrent_duplicate_confirmation_creates_one_project_and_intent(tmp_path):
    store = Store(tmp_path / 'data')
    missions = mission_store(store)
    proposal = report_interview(missions, missions.create('A report', 'org/chosen:beta', 'custom:research', 'altron'))
    folder = tmp_path / 'project'
    folder.mkdir()
    def approve():
        return mission_store(Store(store.root)).approve(proposal['id'], proposal['revision'], str(folder), 12, 168)
    with ThreadPoolExecutor(max_workers=2) as pool:
        first, second = list(pool.map(lambda _: approve(), range(2)))
    assert first['approval'] == second['approval']
    assert first['project_id'] == second['project_id']
    assert len(store.projects()) == 1
    saved = missions.get(proposal['id'])
    assert saved['status'] == 'queued' and saved['phase'] == 'work'
    assert saved['approval']['contract'] == CONTRACT
    assert saved['approval']['connection'] == {'model': 'org/chosen:beta', 'provider': 'custom:research', 'profile': 'altron'}
    assert saved['approval']['permissions']['publication'] is False
    assert saved['approval']['permissions']['payments'] is False
    with pytest.raises(MissionError, match='approval_conflict'):
        missions.approve(proposal['id'], proposal['revision'], str(folder), 13, 168)


def test_bad_project_folder_rolls_back_the_entire_confirmation(tmp_path):
    store = Store(tmp_path / 'data')
    existing = tmp_path / 'existing'
    existing.mkdir()
    store.create_project('Already owned', str(existing))
    nested = existing / 'nested'
    nested.mkdir()
    missions = mission_store(store)
    proposal = report_interview(missions, missions.create('A report', 'm', 'p', 'altron'))
    with pytest.raises(AltronError, match='project_overlap'):
        missions.approve(proposal['id'], proposal['revision'], str(nested), 12, 168)
    assert missions.get(proposal['id']) == proposal
    assert len(store.projects()) == 1


def test_agent_cannot_approve_its_own_proposal_or_rebind_a_turn(tmp_path):
    missions = mission_store(Store(tmp_path / 'data'))
    mission = missions.create('A report', 'm', 'p', 'altron')
    turn = mission['turns'][-1]
    missions.bind(mission['id'], turn['id'], 'runtime', 'stored')
    assert missions.claim(mission['id'], turn['id']) is True
    assert missions.claim(mission['id'], turn['id']) is False
    with pytest.raises(MissionError, match='action_not_allowed'):
        missions.update('runtime', {'action': 'approve', 'summary': 'I approve myself'})
    with pytest.raises(MissionError, match='session_already_bound'):
        missions.bind(mission['id'], turn['id'], 'other-runtime', 'other-stored')
    with pytest.raises(MissionError, match='session_not_bound'):
        missions.context('unrelated-session')
    assert missions.context('runtime')['mission']['approval'] is None
