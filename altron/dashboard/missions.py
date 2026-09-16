"""Saved interviews and approved autonomous projects in Altron's database."""

from contextlib import closing, contextmanager
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import sqlite3
from uuid import uuid4

class MissionError(ValueError):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def text(value, field, maximum=16000):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise MissionError('invalid_' + field)
    return value.strip()


def relative_path(value):
    value = text(value, 'deliverable_path', 1024)
    path = PurePosixPath(value)
    if path.is_absolute() or path.as_posix() != value or any(part in {'.', '..'} for part in value.split('/')) or any(c in value for c in '\\:*?"<>|'):
        raise MissionError('invalid_deliverable_path')
    return value


def string_list(value, field, minimum=0):
    if not isinstance(value, list) or not minimum <= len(value) <= 30:
        raise MissionError('invalid_' + field)
    return [text(part, field, 4000) for part in value]


def contract(value):
    fields = {'name', 'goal', 'requirements', 'out_of_scope', 'deliverables', 'checks', 'plan'}
    if not isinstance(value, dict) or set(value) != fields:
        raise MissionError('invalid_contract')
    result = {key: text(value[key], key, 200 if key == 'name' else 16000) for key in ('name', 'goal', 'plan')}
    result['requirements'] = string_list(value['requirements'], 'requirements', 1)
    result['out_of_scope'] = string_list(value['out_of_scope'], 'out_of_scope')
    for key in ('deliverables', 'checks'):
        if not isinstance(value[key], list) or not 1 <= len(value[key]) <= 30:
            raise MissionError('invalid_' + key)
    result['deliverables'] = []
    for row in value['deliverables']:
        if not isinstance(row, dict) or set(row) != {'path', 'purpose'}:
            raise MissionError('invalid_deliverable')
        result['deliverables'].append({'path': relative_path(row['path']), 'purpose': text(row['purpose'], 'purpose', 2000)})
    paths = [row['path'] for row in result['deliverables']]
    if len(set(paths)) != len(paths):
        raise MissionError('invalid_deliverables')
    result['checks'] = []
    for row in value['checks']:
        if not isinstance(row, dict) or row.get('kind') not in {'file', 'command'}:
            raise MissionError('invalid_check')
        expected = {'id', 'label', 'kind', 'path', 'contains'} if row['kind'] == 'file' else {'id', 'label', 'kind', 'command'}
        if set(row) != expected:
            raise MissionError('invalid_check')
        check = {key: text(row[key], 'check_' + key, 100 if key == 'id' else 2000) for key in ('id', 'label')}
        check['kind'] = row['kind']
        if row['kind'] == 'file':
            check.update(path=relative_path(row['path']), contains=string_list(row['contains'], 'check_contains'))
            if check['path'] not in paths:
                raise MissionError('invalid_check_path')
        else:
            check['command'] = text(row['command'], 'check_command', 4000)
        result['checks'].append(check)
    ids = [row['id'] for row in result['checks']]
    if len(set(ids)) != len(ids):
        raise MissionError('invalid_checks')
    return result


def new_turn(phase, directory):
    return {'id': uuid4().hex, 'phase': phase, 'status': 'prepared', 'created_at': now(),
            'directory': directory, 'runtime_id': None, 'stored_id': None,
            'terminal_status': None, 'settled': False, 'report': None,
            'generation': 0, 'pending_checks': {}, 'check_receipts': {}}


def current_turn(mission):
    return mission['turns'][-1]


class MissionStore:
    def __init__(self, store):
        self.store = store

    def _read(self, db, mission_id):
        row = db.execute('SELECT document FROM altron_missions WHERE id=?', (mission_id,)).fetchone()
        if row is None:
            raise MissionError('mission_not_found')
        return json.loads(row[0])

    @contextmanager
    def changing(self, mission_id):
        with closing(self.store.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            if self.store.guard:
                self.store.guard()
            mission = self._read(db, mission_id)
            yield mission, db
            mission['updated_at'] = now()
            db.execute('UPDATE altron_missions SET document=? WHERE id=?',
                       (json.dumps(mission, ensure_ascii=False), mission_id))

    def get(self, mission_id):
        with closing(self.store.connect()) as db:
            return self._read(db, mission_id)

    def list(self):
        with closing(self.store.connect()) as db:
            return [json.loads(row[0]) for row in db.execute('SELECT document FROM altron_missions ORDER BY rowid DESC')]

    def create(self, message, model, provider, profile):
        message = text(message, 'message')
        connection = {'model': text(model, 'model', 512), 'provider': text(provider, 'provider', 200),
                      'profile': text(profile, 'profile', 200)}
        if (model, provider, profile) != tuple(connection.values()):
            raise MissionError('invalid_connection')
        mission_id = uuid4().hex
        directory = self.store.root / 'interviews' / mission_id
        if not directory.parent.resolve().is_relative_to(self.store.root.resolve()):
            raise MissionError('invalid_interview_directory')
        timestamp = now()
        turn = new_turn('interview', str(directory.resolve()))
        mission = {'id': mission_id, 'revision': 1, 'phase': 'interview', 'status': 'prepared',
                   'created_at': timestamp, 'updated_at': timestamp, 'connection': connection,
                   'transcript': [{'role': 'user', 'text': message}], 'proposal': None, 'approval': None,
                   'project_id': None, 'turns': [turn], 'checkpoint': '', 'artifacts': [],
                   'verification': [], 'instructions': '', 'blocker': None}
        with closing(self.store.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            if self.store.guard:
                self.store.guard()
            directory.mkdir(parents=True)
            db.execute('INSERT INTO altron_missions VALUES (?, ?)', (mission_id, json.dumps(mission, ensure_ascii=False)))
        return mission

    def _binding(self, runtime_id):
        with closing(self.store.connect()) as db:
            row = db.execute('SELECT mission_id, turn_id FROM altron_mission_sessions WHERE runtime_id=?', (runtime_id,)).fetchone()
        if row is None:
            raise MissionError('session_not_bound')
        return row

    def context(self, runtime_id):
        mission_id, turn_id = self._binding(runtime_id)
        mission = self.get(mission_id)
        turn = current_turn(mission)
        if turn['id'] != turn_id:
            raise MissionError('historical_run')
        return {'mode': 'mission', 'mission': mission, 'turn': turn}

    def bind(self, mission_id, turn_id, runtime_id, stored_id):
        runtime_id, stored_id = text(runtime_id, 'runtime_id', 512), text(stored_id, 'stored_id', 512)
        with self.changing(mission_id) as (mission, db):
            turn = current_turn(mission)
            if turn['id'] != turn_id:
                raise MissionError('historical_run')
            if turn['runtime_id']:
                if (turn['runtime_id'], turn['stored_id']) != (runtime_id, stored_id):
                    raise MissionError('session_already_bound')
                return mission
            if turn['status'] not in {'prepared', 'creating'} or mission['status'] != turn['status']:
                raise MissionError('mission_not_prepared')
            if db.execute('SELECT 1 FROM altron_sessions WHERE runtime_id=? OR stored_id=?', (runtime_id, stored_id)).fetchone():
                raise MissionError('session_already_bound')
            try:
                db.execute('INSERT INTO altron_mission_sessions VALUES (?, ?, ?, ?)', (runtime_id, stored_id, mission_id, turn_id))
            except sqlite3.IntegrityError as exc:
                raise MissionError('session_already_bound') from exc
            turn.update(runtime_id=runtime_id, stored_id=stored_id, status='bound')
            mission['status'] = 'bound'
        return mission

    def claim(self, mission_id, turn_id):
        with self.changing(mission_id) as (mission, _):
            turn = current_turn(mission)
            if turn['id'] != turn_id or turn['status'] != 'bound' or mission['status'] != 'bound':
                return False
            budget = mission.get('revision_budget') or mission['approval']
            if turn['phase'] == 'work' and datetime.fromisoformat(now()) >= datetime.fromisoformat(budget['deadline_at']):
                mission.update(status='cancel_requested', stop_reason='time_limit', blocker='time_limit')
                return False
            turn.update(status='running', started_at=now())
            mission['status'] = 'running'
        return True

    def update(self, runtime_id, payload):
        mission_id, turn_id = self._binding(runtime_id)
        fields = {'interview': {'action', 'summary', 'contract'}, 'checkpoint': {'action', 'summary'},
                  'blocked': {'action', 'summary'}, 'result': {'action', 'summary', 'paths', 'instructions'}}
        if not isinstance(payload, dict) or payload.get('action') not in fields or set(payload) - fields[payload['action']]:
            raise MissionError('action_not_allowed')
        report = {'action': payload['action'], 'summary': text(payload.get('summary'), 'summary')}
        if report['action'] == 'interview' and payload.get('contract') is not None:
            report['contract'] = contract(payload['contract'])
        with self.changing(mission_id) as (mission, _):
            turn = current_turn(mission)
            if turn['id'] != turn_id or (turn['phase'] == 'interview') != (report['action'] == 'interview'):
                raise MissionError('action_not_allowed')
            if turn['status'] != 'running' or turn['terminal_status'] or mission['status'] != 'running':
                raise MissionError('run_not_active')
            if report['action'] == 'result':
                paths = string_list(payload.get('paths'), 'paths', 1)
                if len(set(paths)) != len(paths) or not {row['path'] for row in mission['approval']['contract']['deliverables']}.issubset(paths):
                    raise MissionError('required_deliverables_missing')
                report['artifacts'] = self.artifacts(mission, paths)
                report['instructions'] = text(payload.get('instructions'), 'instructions')
            turn['report'] = report
        return mission

    def terminal(self, runtime_id, status):
        if status not in {'complete', 'error', 'interrupted'}:
            raise MissionError('invalid_terminal_status')
        mission_id, turn_id = self._binding(runtime_id)
        with self.changing(mission_id) as (mission, _):
            turn = next(row for row in mission['turns'] if row['id'] == turn_id)
            if not turn['terminal_status']:
                turn.update(terminal_status=status, finished_at=now())
        return mission

    def settle(self, mission_id, turn_id):
        # Called by the controller only while holding the native stopped-runtime fence.
        with self.changing(mission_id) as (mission, _):
            turn = current_turn(mission)
            if turn['id'] != turn_id:
                raise MissionError('historical_run')
            if turn['settled']:
                return mission
            if not turn['terminal_status']:
                raise MissionError('run_state_unconfirmed')
            turn.update(settled=True, status=turn['terminal_status'])
            report = turn['report']
            if turn.get('permission_blocked'):
                mission.update(status='blocked', blocker='permission_required')
            elif turn['terminal_status'] != 'complete' or not report:
                mission.update(status='blocked', blocker='report_missing' if not report else 'execution_stopped')
            elif turn['phase'] == 'interview':
                mission['transcript'].append({'role': 'assistant', 'text': report['summary']})
                mission.update(proposal=report.get('contract'), status='awaiting_approval' if report.get('contract') else 'waiting',
                               revision=mission['revision'] + 1)
            elif report['action'] == 'blocked':
                mission.update(status='blocked', blocker='needs_input', checkpoint=report['summary'])
            elif report['action'] == 'checkpoint':
                mission.update(status='queued', checkpoint=report['summary'], blocker=None)
            elif report['action'] == 'result':
                checks = self.verify(mission, turn)
                passed = all(row['passed'] for row in checks)
                mission.update(status='ready' if passed else 'queued', verification=checks,
                               artifacts=report['artifacts'], instructions=report['instructions'],
                               checkpoint=report['summary'] if passed else 'Repair failed checks: ' + json.dumps(checks, ensure_ascii=False),
                               blocker=None)
        return mission

    def answer(self, mission_id, revision, message):
        message = text(message, 'message')
        with self.changing(mission_id) as (mission, _):
            if type(revision) is not int or revision != mission['revision']:
                raise MissionError('stale_revision')
            if mission['approval'] or mission['status'] not in {'waiting', 'awaiting_approval'} or not current_turn(mission)['settled']:
                raise MissionError('mission_not_editable')
            if len(mission['transcript']) >= 200:
                raise MissionError('interview_limit')
            mission['transcript'].append({'role': 'user', 'text': message})
            mission['turns'].append(new_turn('interview', current_turn(mission)['directory']))
            mission.update(proposal=None, status='prepared', revision=mission['revision'] + 1)
        return mission

    def approve(self, mission_id, revision, directory, max_turns, max_hours):
        directory = text(directory, 'directory', 4096)
        if not Path(directory).is_absolute():
            raise MissionError('directory_must_be_absolute')
        if type(revision) is not int or type(max_turns) is not int or not 1 <= max_turns <= 200 or type(max_hours) is not int or not 1 <= max_hours <= 168:
            raise MissionError('invalid_limits')
        limits = {'max_turns': max_turns, 'max_hours': max_hours}
        with self.changing(mission_id) as (mission, db):
            approval = mission['approval']
            if approval:
                if approval['revision'] != revision or Path(approval['directory']) != Path(directory).resolve() or approval['limits'] != limits:
                    raise MissionError('approval_conflict')
                return mission
            if mission['revision'] != revision:
                raise MissionError('stale_revision')
            if mission['status'] != 'awaiting_approval' or not mission['proposal'] or not current_turn(mission)['settled']:
                raise MissionError('mission_not_approvable')
            project = self.store.insert_project(db, mission['proposal']['name'], directory)
            project['autonomy_id'] = mission_id
            db.execute('UPDATE altron_projects SET document=? WHERE id=?', (json.dumps(project, ensure_ascii=False), project['id']))
            db.execute('UPDATE altron_workspace SET selected_project_id=? WHERE singleton=1', (project['id'],))
            timestamp = now()
            approval = {'revision': revision, 'contract': deepcopy(mission['proposal']), 'connection': dict(mission['connection']),
                        'directory': project['directory'], 'limits': limits, 'at': timestamp,
                        'deadline_at': (datetime.fromisoformat(timestamp) + timedelta(hours=max_hours)).isoformat(),
                        'permissions': {'local_project_work': True, 'publication': False, 'payments': False,
                                        'new_access': False, 'destructive_external_actions': False}}
            mission.update(approval=approval, project_id=project['id'], phase='work', status='queued', revision=revision + 1)
        return mission

    def prepare(self, mission_id, *, automatic=False):
        with self.changing(mission_id) as (mission, _):
            if mission['status'] != 'queued' or not mission['approval'] or not current_turn(mission)['settled']:
                raise MissionError('mission_not_queued')
            budget = mission.get('revision_budget') or mission['approval']
            used = sum(row['phase'] == 'work' for row in mission['turns']) - budget.get('turn_offset', 0)
            if datetime.fromisoformat(now()) >= datetime.fromisoformat(budget['deadline_at']):
                mission.update(status='blocked', blocker='time_limit')
            elif used >= budget['limits']['max_turns']:
                mission.update(status='blocked', blocker='turn_limit')
            else:
                mission['turns'].append(dict(new_turn('work', mission['approval']['directory']), automatic=automatic))
                mission.update(status='prepared', phase='work', blocker=None)
        return mission

    def revise(self, mission_id, feedback, max_turns, max_hours):
        feedback = text(feedback, 'feedback')
        if type(max_turns) is not int or not 1 <= max_turns <= 200 or type(max_hours) is not int or not 1 <= max_hours <= 168:
            raise MissionError('invalid_limits')
        with self.changing(mission_id) as (mission, _):
            if not mission['approval'] or mission['status'] not in {'ready', 'blocked', 'cancelled'} or not current_turn(mission)['settled']:
                raise MissionError('mission_not_revisable')
            timestamp = now()
            budget = {'limits': {'max_turns': max_turns, 'max_hours': max_hours}, 'at': timestamp,
                      'turn_offset': sum(row['phase'] == 'work' for row in mission['turns']),
                      'deadline_at': (datetime.fromisoformat(timestamp) + timedelta(hours=max_hours)).isoformat()}
            mission.setdefault('revisions', []).append({'feedback': feedback, 'budget': deepcopy(budget)})
            mission.update(status='queued', feedback=feedback, revision_budget=budget, blocker=None)
        return mission

    def artifacts(self, mission, paths=None):
        if paths is None:
            paths = [row['path'] for row in mission['approval']['contract']['deliverables']]
        rows = [self.store.artifact({'directory': mission['approval']['directory']}, relative_path(path)) for path in paths]
        return [dict(row, path=Path(row['path']).as_posix()) for row in rows]

    def command_check(self, mission, tool_name, args):
        if tool_name != 'terminal' or args.get('background') or not isinstance(args.get('workdir'), str):
            return None
        if Path(args['workdir']) != Path(mission['approval']['directory']):
            return None
        return next((row for row in mission['approval']['contract']['checks']
                     if row['kind'] == 'command' and row['command'] == args.get('command')), None)

    def before_tool(self, runtime_id, tool_name, args, call_id):
        context = self.context(runtime_id)
        mission, turn = context['mission'], context['turn']
        if turn['terminal_status'] or turn['settled'] or mission['status'] != 'running':
            raise MissionError('run_not_active')
        protocol = {'altron_context', 'altron_update'}
        calls = args.get('calls')
        protocol_call = (tool_name == 'tool_call' and isinstance(calls, list) and bool(calls)
                         and all(isinstance(call, dict) and call.get('name') in protocol
                                 and isinstance(call.get('arguments'), dict) for call in calls))
        if turn['phase'] == 'interview':
            names = args.get('names')
            protocol_description = (tool_name == 'tool_describe' and isinstance(names, list)
                                    and bool(names) and all(name in protocol for name in names))
            if tool_name not in protocol and not protocol_call and not protocol_description:
                raise MissionError('interview_tools_only')
            return
        budget = mission.get('revision_budget') or mission['approval']
        if datetime.fromisoformat(now()) >= datetime.fromisoformat(budget['deadline_at']):
            raise MissionError('time_limit')
        if protocol_call:
            return
        if turn.get('permission_blocked') and tool_name not in protocol:
            raise MissionError('permission_required')
        if tool_name.startswith(('ha_', 'kanban_', 'browser_vault_')) or tool_name in {'delegate_task', 'skill_manage', 'memory', 'honcho_conclude'}:
            raise MissionError('separate_permission_required')
        if tool_name in {'altron_context', 'altron_update', 'read_file', 'search_files', 'tool_search', 'tool_describe', 'skills_list', 'skill_view'}:
            return
        with self.changing(mission['id']) as (saved, _):
            active = current_turn(saved)
            if active['id'] != turn['id'] or saved['status'] != 'running':
                raise MissionError('run_not_active')
            check = self.command_check(saved, tool_name, args)
            if check and call_id:
                active['pending_checks'][call_id] = {'check_id': check['id'], 'generation': active['generation']}
            else:
                active['generation'] += 1
                active['check_receipts'] = {}

    def after_tool(self, runtime_id, tool_name, args, result, call_id, status):
        if tool_name != 'terminal' or not call_id:
            return
        mission_id, turn_id = self._binding(runtime_id)
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except (ValueError, TypeError):
                result = {}
        with self.changing(mission_id) as (mission, _):
            turn = current_turn(mission)
            if turn['id'] != turn_id:
                return
            if isinstance(result, dict) and (str(result.get('error', '')).startswith('BLOCKED:')
                    or result.get('approval_pending') is True or result.get('user_consent') is False):
                turn['permission_blocked'] = True
            pending = turn['pending_checks'].pop(call_id, None)
            check = self.command_check(mission, tool_name, args) if mission['approval'] else None
            if not pending or not check or pending['check_id'] != check['id'] or pending['generation'] != turn['generation']:
                return
            valid = (status == 'ok' and isinstance(result, dict) and type(result.get('exit_code')) is int
                     and result['exit_code'] == 0 and not result.get('error') and not result.get('session_id'))
            try:
                artifacts = self.artifacts(mission) if valid else []
            except ValueError:
                artifacts, valid = [], False
            turn['check_receipts'][check['id']] = {'passed': valid, 'tool_call_id': call_id,
                'generation': turn['generation'], 'artifacts': artifacts, 'at': now(),
                'exit_code': result.get('exit_code') if isinstance(result, dict) else None,
                'output_sha256': hashlib.sha256(json.dumps(result, sort_keys=True, ensure_ascii=False).encode()).hexdigest()}

    def verify(self, mission, turn):
        report = turn['report']
        checks = []
        try:
            actual = self.artifacts(mission, [row['path'] for row in report['artifacts']])
            stable = actual == report['artifacts']
            required = self.artifacts(mission)
        except ValueError:
            stable, required = False, []
        for check in mission['approval']['contract']['checks']:
            row = {'id': check['id'], 'label': check['label'], 'kind': check['kind'], 'passed': False, 'at': now()}
            if check['kind'] == 'file':
                try:
                    artifact = next(a for a in required if a['path'] == check['path'])
                    contents = (Path(mission['approval']['directory']) / check['path']).read_text(encoding='utf-8') if check['contains'] else ''
                    row.update(passed=stable and artifact['bytes'] > 0 and all(value in contents for value in check['contains']),
                               source='file_content' if check['contains'] else 'file_presence', path=check['path'])
                except (ValueError, OSError, StopIteration):
                    row['error'] = 'file_check_failed'
            else:
                receipt = turn['check_receipts'].get(check['id'])
                row.update(source='terminal_receipt', command=check['command'],
                           passed=bool(stable and receipt and receipt['passed'] and receipt['artifacts'] == required
                                       and receipt['generation'] == turn['generation']))
                if receipt:
                    row['tool_call_id'] = receipt['tool_call_id']
                    row['exit_code'] = receipt['exit_code']
            checks.append(row)
        return checks


    def own(self, mission_id, turn_id, owner, epoch):
        with self.changing(mission_id) as (mission, _):
            turn = current_turn(mission)
            if turn['id'] != turn_id or (turn.get('owner') and turn['owner'] != owner):
                raise MissionError('turn_owned_elsewhere')
            turn['owner'] = owner
            mission['runtime_epoch'] = epoch

    def claim_creation(self, mission_id, turn_id, owner, epoch):
        with self.changing(mission_id) as (mission, _):
            turn = current_turn(mission)
            if turn['id'] != turn_id or mission['status'] != 'prepared' or turn['status'] != 'prepared' or not turn.get('automatic'):
                return False
            turn.update(owner=owner, status='creating')
            mission.update(status='creating', runtime_epoch=epoch)
        return True

    def unknown(self, mission_id, reason):
        with self.changing(mission_id) as (mission, _):
            turn = current_turn(mission)
            if not turn['settled']:
                turn['status'] = 'unknown'
                mission.update(status='unknown', blocker=reason)
        return mission

    def reconcile(self, epoch):
        for row in self.list():
            if row['status'] in {'creating', 'bound', 'running', 'cancel_requested'} and row.get('runtime_epoch') != epoch:
                self.unknown(row['id'], 'backend_changed')

    def lineage(self, mission_id, turn_id, stored_id):
        stored_id = text(stored_id, 'stored_id', 512)
        with self.changing(mission_id) as (mission, db):
            turn = current_turn(mission)
            if turn['id'] != turn_id or turn['settled']:
                raise MissionError('historical_run')
            if turn['stored_id'] != stored_id:
                turn.setdefault('stored_id_history', []).append(turn['stored_id'])
                db.execute('UPDATE altron_mission_sessions SET stored_id=? WHERE runtime_id=? AND turn_id=?',
                           (stored_id, turn['runtime_id'], turn_id))
                turn['stored_id'] = stored_id

    def cancel(self, mission_id, reason='user_cancel'):
        with self.changing(mission_id) as (mission, _):
            turn = current_turn(mission)
            mission['stop_reason'] = reason
            if turn['settled'] or (mission['status'] == 'prepared' and not turn['runtime_id']):
                turn.update(settled=True, status='not_started' if not turn['runtime_id'] else turn['status'])
                mission.update(status='cancelled' if reason == 'user_cancel' else 'blocked', blocker=reason)
            else:
                mission.update(status='cancel_requested', blocker=reason)
        return mission

    def interrupt_requested(self, mission_id):
        with self.changing(mission_id) as (mission, _):
            current_turn(mission)['interrupt_requested'] = True

    def cancelled(self, mission_id):
        with self.changing(mission_id) as (mission, _):
            turn = current_turn(mission)
            if mission['status'] != 'cancel_requested':
                raise MissionError('cancellation_not_requested')
            turn.update(settled=True, status='cancelled', stopped_at=now())
            reason = mission.get('stop_reason', 'user_cancel')
            mission.update(status='cancelled' if reason == 'user_cancel' else 'blocked', blocker=reason)
        return mission

    def recovered(self, mission_id):
        with self.changing(mission_id) as (mission, _):
            if mission['status'] not in {'unknown', 'blocked', 'cancelled'}:
                raise MissionError('mission_not_recoverable')
            turn = current_turn(mission)
            turn.update(settled=True, status='recovered', recovery={'observed': 'stopped', 'at': now()})
            if mission['approval']:
                mission.update(status='queued', blocker=None,
                               checkpoint='Recovery was explicitly confirmed after verifying no active runtime. '
                               'Inspect existing files and prior receipts before acting; do not repeat uncertain side effects. '
                               + mission['checkpoint'])
            else:
                mission['turns'].append(new_turn('interview', turn['directory']))
                mission.update(status='prepared', blocker=None)
        return mission
