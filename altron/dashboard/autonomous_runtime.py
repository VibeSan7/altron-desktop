"""Backend-owned mission coordination; the renderer never schedules work turns."""

from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import threading
from uuid import uuid4


EPOCH = uuid4().hex
_CONTROLLERS = {}
_CONTROLLER_LOCK = threading.RLock()


def controller_for(missions, services):
    key = str(missions.store.root.resolve())
    with _CONTROLLER_LOCK:
        if key not in _CONTROLLERS:
            missions.reconcile(EPOCH)
            _CONTROLLERS[key] = Controller(missions, HermesRuntime(missions.store.root.parent, services))
        return _CONTROLLERS[key]


def prompt(mission):
    if mission['phase'] == 'interview':
        instruction = (
            'Conduct a detailed, adaptive interview in the user\'s language. Discover the actual need, audience, '
            'current situation, outcome, constraints, deliverables and verifiable acceptance criteria. '
            'Do not execute the project. Use only altron_context and altron_update. '
            'Ask meaningful follow-up questions, at most five at once. Do not ask the user to design software. '
            'When material uncertainties remain, call altron_update(action="interview", summary=your questions). '
            'When ready, call altron_update(action="interview", summary=the proposed outcome, contract=the complete contract). '
            'A contract has exactly name, goal, requirements (strings), out_of_scope (strings), plan, '
            'deliverables ({path, purpose}), and checks. Each check has id, label, kind; '
            'file checks add path and contains (strings); command checks add the exact command. '
            'File paths are relative, portable paths; every file check names a deliverable. '
            'Prefer meaningful checks, not just presence. Never claim a file-presence check verifies quality. '
            'No project directory, execution, payments, publishing, access changes or approval may be invented. '
            'The user will choose a directory and approve the exact proposal in Altron. '
            'Finish this turn after saving the questions or proposal; do not wait in a tool for a reply.'
        )
        assignment = {'transcript': mission['transcript'], 'proposal': mission['proposal']}
    else:
        instruction = (
            'Complete the approved project autonomously in the user\'s language. Call altron_context first. '
            'The approval is immutable. Make ordinary technical decisions yourself within its scope. '
            'Use only the selected worker model; no additional agents, reviewers, paid services, publishing, '
            'new accounts, permission changes or destructive external actions are authorized. Keep native approvals. '
            'Inspect existing files before changing them. Never repeat uncertain prior side effects blindly. '
            'Create real deliverables and run all agreed checks. Run each command check via the terminal tool '
            'with exactly the approved command and explicit project workdir, synchronously. '
            'A started background process or a prose claim is not a successful check. '
            'Run checks after modifications; later modifying tools invalidate earlier check receipts. '
            'To continue useful work in another bounded turn, save altron_update(action="checkpoint", summary=verified progress '
            'and concrete next steps), then finish. Do not ask the user to say continue. '
            'If a real external permission, access or material scope decision is needed, save '
            'altron_update(action="blocked", summary=the precise obstacle), then finish. '
            'On completion save altron_update(action="result", summary=what was delivered, paths=real relative file paths, '
            'instructions=how to use the result and its remaining limitations), then finish. '
            'The backend validates files and checks; you cannot accept the work for the user or approve yourself.'
        )
        assignment = {'approval': mission['approval'], 'checkpoint': mission['checkpoint'],
                      'verification': mission['verification'], 'feedback': mission.get('feedback', '')}
    instruction += ' If Altron tools are deferred, load their schemas with tool_describe(names=["altron_context", "altron_update"]) and invoke them through tool_call; this does not authorize other tools during the interview.'
    return 'Altron mission assignment.\n' + instruction + '\nSaved assignment:\n' + json.dumps(assignment, ensure_ascii=False)


class HermesRuntime:
    def __init__(self, home, services):
        self.home, self.services = Path(home).resolve(), services
        self.server = services._runtime()
        required = ('handle_request', 'bind_transport', 'reset_transport', '_session_profile_runtime_scope',
                    '_session_live_transports', '_transport_is_live_peer', '_session_usage_snapshot')
        if any(not callable(getattr(self.server, key, None)) for key in required):
            raise ValueError('runtime_unavailable')
        self.channels, self.owned, self.receipts = {}, {}, {}

    def _scope(self, session, mission, turn):
        if (Path(session.get('profile_home') or self.server._hermes_home).resolve() != self.home or
                Path(session.get('cwd') or '').resolve() != Path(turn['directory']).resolve()):
            raise ValueError('runtime_scope_mismatch')
        route = session.get('model_override') or {}
        if any(route.get(key) != mission['connection'][key] for key in ('model', 'provider')):
            raise ValueError('model_mismatch')

    def bind(self, mission, turn, runtime_id, stored_id):
        with self.server._sessions_lock:
            session = self.server._sessions.get(runtime_id)
            if session is None or self.server._session_lookup_key(session, fallback=runtime_id) != stored_id:
                raise ValueError('runtime_scope_mismatch')
            self._scope(session, mission, turn)
            peer = next((p for p in self.server._session_live_transports(session) if self.server._transport_is_live_peer(p)), None)
            if peer is None:
                raise ValueError('runtime_connection_lost')
            self.channels[mission['id']] = peer
            self.owned[turn['id']] = session

    def _owned(self, mission, turn):
        session = self.server._sessions.get(turn['runtime_id'])
        if session is None or self.owned.get(turn['id']) is not session:
            raise ValueError('runtime_ownership_lost')
        self._scope(session, mission, turn)
        return session

    def can_create(self, mission):
        peer = self.channels.get(mission['id'])
        return peer is not None and self.server._transport_is_live_peer(peer)

    def _rpc(self, mission, method, params):
        if not self.can_create(mission):
            raise ValueError('runtime_connection_lost')
        token = self.server.bind_transport(self.channels[mission['id']])
        try:
            with self.server._session_profile_runtime_scope({'profile_home': str(self.home)}):
                result = self.server.handle_request({'jsonrpc': '2.0', 'id': uuid4().hex, 'method': method, 'params': params})
        finally:
            self.server.reset_transport(token)
        if not isinstance(result, dict) or result.get('error') or not isinstance(result.get('result'), dict):
            raise ValueError('runtime_request_failed')
        return result['result']

    def create(self, mission, turn):
        return self._rpc(mission, 'session.create', {
            'source': 'desktop', 'profile': mission['connection']['profile'],
            'model': mission['connection']['model'], 'provider': mission['connection']['provider'],
            'cwd': turn['directory'], 'close_on_disconnect': False,
            'title': 'Altron — интервью' if turn['phase'] == 'interview' else 'Altron — работа'})

    def ready(self, mission, turn):
        with self.server._sessions_lock:
            session = self._owned(mission, turn)
            ready = session.get('agent_ready')
            if ready is None or not hasattr(ready, 'is_set'):
                raise ValueError('runtime_unavailable')
            if not ready.is_set():
                return False
            agent = session.get('agent')
            if agent is None:
                raise ValueError('runtime_initialization_failed')
            if not hasattr(agent, '_fallback_chain') or not hasattr(agent, '_fallback_activated'):
                raise ValueError('runtime_unavailable')
            if agent._fallback_chain or agent._fallback_activated:
                raise ValueError('model_fallback_not_allowed')
            if agent.model != mission['connection']['model']:
                raise ValueError('model_mismatch')
            # This owned, not-yet-submitted agent must not start an unapproved review model.
            agent.skip_background_review = True
            return True

    def submit(self, mission, turn, text):
        with self.server._sessions_lock:
            self._owned(mission, turn)
        if not self.ready(mission, turn):
            raise ValueError('runtime_initializing')
        snapshot = self._rpc(mission, 'session.events.since', {'session_id': turn['runtime_id'], 'last_seen': 0})
        self.receipts[turn['id']] = {'epoch': snapshot['epoch'], 'seq': snapshot['latest_seq'], 'status': None}
        return self._rpc(mission, 'prompt.submit', {'session_id': turn['runtime_id'], 'text': text})

    def _terminal_receipt(self, mission, turn):
        receipt = self.receipts.get(turn['id'])
        if receipt is None:
            return None
        if receipt['status']:
            return receipt['status']
        snapshot = self._rpc(mission, 'session.events.since', {'session_id': turn['runtime_id'], 'last_seen': receipt['seq']})
        if snapshot['epoch'] != receipt['epoch'] or snapshot['count'] != len(snapshot['events']):
            raise ValueError('runtime_replay_unconfirmed')
        for event in snapshot['events']:
            if event['seq'] <= receipt['seq']:
                continue
            receipt['seq'] = event['seq']
            if event.get('session_id') != turn['runtime_id'] or event.get('type') != 'message.complete':
                continue
            status = (event.get('payload') or {}).get('status')
            if status in {'complete', 'error', 'interrupted'}:
                receipt['status'] = status
        # A retained terminal event is a receipt even if preceding token deltas
        # were evicted. A missing terminal event never becomes inferred success.
        return receipt['status']

    def observe(self, mission, turn):
        with self.server._sessions_lock:
            session = self._owned(mission, turn)
            busy = bool(session.get('running') or session.get('queued_prompts'))
            busy = busy or self.server._session_live_status(turn['runtime_id'], session) != 'idle'
            for key in ('_run_thread', 'worker', 'slash_worker'):
                thread = session.get(key)
                busy = busy or bool(thread and getattr(thread, 'is_alive', lambda: False)())
            observed = {'state': 'active' if busy else 'idle',
                        'stored_id': self.server._session_lookup_key(session, fallback=turn['runtime_id']),
                        'usage': self.services.clean_usage(self.server._session_usage_snapshot(session))}
        terminal = self._terminal_receipt(mission, turn)
        if terminal:
            observed['terminal_status'] = terminal
        if busy:
            pending = self._rpc(mission, 'approval.pending', {'session_id': turn['runtime_id']})
            observed['needs_permission'] = bool(pending['approvals'])
        return observed

    def interrupt(self, mission, turn):
        with self.server._sessions_lock:
            self._owned(mission, turn)
        return self._rpc(mission, 'session.interrupt', {'session_id': turn['runtime_id']})

    @contextmanager
    def fence(self, mission, turn):
        with self.services.observe_mission_run(turn, {'directory': turn['directory']}, self.home) as state:
            yield state


class Controller:
    def __init__(self, missions, adapter):
        self.missions, self.adapter = missions, adapter
        self.owner = uuid4().hex
        self._lock = threading.RLock()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._thread = None
        self.last_error = None

    def attach(self, mission_id, turn_id, runtime_id, stored_id):
        with self._lock:
            mission = self.missions.get(mission_id)
            turn = mission['turns'][-1]
            if turn['id'] != turn_id:
                raise ValueError('historical_run')
            self.adapter.bind(mission, turn, runtime_id, stored_id)
            self.missions.bind(mission_id, turn_id, runtime_id, stored_id)
            self.missions.own(mission_id, turn_id, self.owner, EPOCH)
        return self.missions.get(mission_id)

    def tick(self):
        with self._lock:
            for mission in self.missions.list():
                try:
                    self._advance(mission)
                except Exception:
                    # Do not leak provider errors or mark uncertain execution stopped.
                    self.last_error = 'controller_state_unavailable'

    def _advance(self, mission):
        mid, status, turn = mission['id'], mission['status'], mission['turns'][-1]
        if status == 'queued':
            if self.adapter.can_create(mission):
                self.missions.prepare(mid, automatic=True)
            return
        if status == 'prepared' and turn.get('automatic') and self.adapter.can_create(mission):
            if not self.missions.claim_creation(mid, turn['id'], self.owner, EPOCH):
                return
            try:
                created = self.adapter.create(mission, turn)
                self.attach(mid, turn['id'], created['session_id'], created['stored_session_id'])
            except Exception:
                self.missions.unknown(mid, 'creation_unconfirmed')
            return
        if turn.get('owner') != self.owner:
            return
        if status == 'bound':
            budget = mission.get('revision_budget') or mission['approval']
            if budget and datetime.now(timezone.utc) >= datetime.fromisoformat(budget['deadline_at']):
                self.missions.cancel(mid, 'time_limit')
                return
            try:
                if not self.adapter.ready(mission, turn):
                    return
            except ValueError as exc:
                self.missions.cancel(mid, str(exc))
                return
            if self.missions.claim(mid, turn['id']):
                try:
                    response = self.adapter.submit(mission, turn, prompt(mission))
                    if response.get('status') != 'streaming':
                        self.missions.unknown(mid, 'submission_unconfirmed')
                except Exception:
                    self.missions.unknown(mid, 'submission_unconfirmed')
            return
        if status not in {'running', 'cancel_requested'}:
            return
        try:
            observed = self.adapter.observe(mission, turn)
            if observed.get('stored_id') and observed['stored_id'] != turn['stored_id']:
                self.missions.lineage(mid, turn['id'], observed['stored_id'])
                mission = self.missions.get(mid)
                turn = mission['turns'][-1]
            if observed.get('terminal_status'):
                self.missions.terminal(turn['runtime_id'], observed['terminal_status'])
                mission = self.missions.get(mid)
                turn = mission['turns'][-1]
            if observed['state'] == 'idle':
                with self.adapter.fence(mission, turn) as stopped:
                    if stopped['state'] != 'stopped':
                        return
                    if status == 'cancel_requested':
                        self.missions.cancelled(mid)
                    elif turn['terminal_status']:
                        self.missions.settle(mid, turn['id'])
                    else:
                        self.missions.unknown(mid, 'terminal_receipt_missing')
                return
            budget = mission.get('revision_budget') or mission['approval']
            if status == 'running':
                notice = 'permission_pending' if observed.get('needs_permission') else None
                if notice != mission.get('blocker') and (notice or mission.get('blocker') == 'permission_pending'):
                    with self.missions.changing(mid) as (saved, _):
                        saved['blocker'] = notice
            if status == 'running' and budget and datetime.now(timezone.utc) >= datetime.fromisoformat(budget['deadline_at']):
                self.missions.cancel(mid, 'time_limit')
                status = 'cancel_requested'
            if status == 'cancel_requested' and not turn.get('interrupt_requested'):
                self.missions.interrupt_requested(mid)
                self.adapter.interrupt(mission, turn)
        except Exception:
            self.missions.unknown(mid, 'runtime_state_unconfirmed')

    def resume(self, mission_id):
        with self._lock:
            mission = self.missions.get(mission_id)
            if mission['status'] == 'queued':
                return self.missions.prepare(mission_id)
            with self.missions.changing(mission_id) as (saved, _):
                turn = saved['turns'][-1]
                if saved['status'] != 'prepared' or turn['runtime_id'] or turn.get('owner'):
                    raise ValueError('mission_not_prepared')
                turn['automatic'] = False
            return saved

    def approve(self, mission_id, revision, directory, max_turns, max_hours):
        with self._lock:
            mission = self.missions.approve(mission_id, revision, directory, max_turns, max_hours)
            return self.missions.prepare(mission_id) if mission['status'] == 'queued' else mission

    def revise(self, mission_id, feedback, max_turns, max_hours):
        with self._lock:
            self.missions.revise(mission_id, feedback, max_turns, max_hours)
            return self.missions.prepare(mission_id)

    def cancel(self, mission_id):
        self.missions.cancel(mission_id, 'user_cancel')
        return self.missions.get(mission_id)

    def recover(self, mission_id):
        with self._lock:
            mission = self.missions.get(mission_id)
            if mission['status'] not in {'unknown', 'blocked', 'cancelled'}:
                raise ValueError('mission_not_recoverable')
            with self.adapter.fence(mission, mission['turns'][-1]) as observed:
                if observed['state'] != 'stopped':
                    raise ValueError('run_still_active')
                mission = self.missions.recovered(mission_id)
                return self.missions.prepare(mission_id) if mission['status'] == 'queued' else mission

    def wake(self):
        with self._lock:
            if self._stop.is_set():
                raise ValueError('controller_stopped')
            if self._thread is None:
                self._thread = threading.Thread(target=self._run, name='altron-missions', daemon=True)
                self._thread.start()
            self._wake.set()

    def _run(self):
        while not self._stop.is_set():
            self._wake.wait(2)
            self._wake.clear()
            if not self._stop.is_set():
                try:
                    self.tick()
                except Exception:
                    self.last_error = 'controller_state_unavailable'

    def stop(self):
        self._stop.set()
        self._wake.set()
        if self._thread is not None and self._thread is not threading.current_thread():
            self._thread.join(timeout=2)
