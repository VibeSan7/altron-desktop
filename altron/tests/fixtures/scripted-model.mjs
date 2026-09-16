import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';

// A deterministic protocol fixture, not an LLM or evidence of model quality.
// It deliberately submits a bad first result so the real backend must repair it.
export async function scriptedModel({input, model}) {
  const requests = [];
  const errors = [];
  const command = `python -c "import json; a=json.load(open('input.json')); b=json.load(open('result.json')); assert b['ready'] is True; assert b['marker']==a['marker']; assert b['count']==len(a['values']); assert b['total']==sum(a['values'])"`;
  const contract = {
    name: 'Protocol acceptance', goal: 'Create a checked calculation from the supplied local input.',
    requirements: ['Read input.json and write result.json with marker, count, total and ready=true.'],
    out_of_scope: ['No external services, publication, delegation or other files.'],
    plan: 'Create the result, execute the approved check, repair a failed attempt and provide instructions.',
    deliverables: [{path: 'result.json', purpose: 'Checked calculation'}],
    checks: [
      {id: 'content', label: 'Result declares completion', kind: 'file', path: 'result.json', contains: ['"ready": true']},
      {id: 'calculation', label: 'Input and calculation match', kind: 'command', command},
    ],
  };
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/v1/models') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({object: 'list', data: [{id: model, object: 'model', owned_by: 'local-test'}]}));
        return;
      }
      if (req.method === 'GET' || req.url === '/api/show') {
        res.writeHead(404, {'content-type': 'application/json'});
        res.end(JSON.stringify({error: {message: 'Optional metadata unavailable'}}));
        return;
      }
      assert.equal(req.url, '/v1/chat/completions');
      const buffers = [];
      for await (const part of req) buffers.push(part);
      const body = JSON.parse(Buffer.concat(buffers).toString('utf8'));
      assert.equal(body.model, model, 'No implicit model change');
      const content = [...body.messages].reverse().find(m => m.role === 'user')?.content;
      const text = Array.isArray(content) ? content.map(p => p.text || '').join('\n') : content;
      assert.equal(typeof text, 'string');
      const marker = '\nSaved assignment:\n';
      assert.ok(text.includes(marker), 'Only mission prompts are accepted by this fixture');
      const assignment = JSON.parse(text.slice(text.indexOf(marker) + marker.length));
      const interview = Array.isArray(assignment.transcript);
      const repaired = !interview && assignment.verification.some(c => !c.passed);
      // Chat-completions omits names on tool results; resolve their call IDs.
      const names = new Map(body.messages.flatMap(m => (m.tool_calls || []).map(c => [c.id, c.function?.name])));
      const toolResults = body.messages.filter(m => m.role === 'tool').map(m => ({...m, name: names.get(m.tool_call_id)}));
      const completed = toolResults.filter(m => m.name !== 'tool_describe');
      const step = completed.length;
      const output = {marker: input.marker, count: input.values.length, total: input.values.reduce((a, b) => a + b, 0), ready: repaired};
      const sequence = interview ? [
        ['altron_context', {}],
        ['altron_update', assignment.transcript.length === 1
          ? {action: 'interview', summary: 'Кто будет пользоваться результатом и что нужно проверить?'}
          : {action: 'interview', summary: 'Предлагаю проверяемый локальный результат.', contract}],
      ] : [
        ['altron_context', {}],
        ...(repaired ? [['read_file', {path: 'result.json'}]] : []),
        ['write_file', {path: 'result.json', content: JSON.stringify(output, null, 2) + '\n'}],
        ['terminal', {command, workdir: assignment.approval.directory, timeout: 30}],
        ['altron_update', {action: 'result', summary: repaired ? 'Corrected result' : 'First attempt', paths: ['result.json'], instructions: 'Open result.json. Re-run the approved command to verify the calculation.'}],
      ];
      const intended = sequence[step];
      let next = intended;
      if (next && !body.tools.some(t => t.function?.name === next[0])) {
        const described = toolResults.some(m => m.name === 'tool_describe');
        next = described
          ? ['tool_call', {calls: [{name: next[0], arguments: next[1]}]}]
          : ['tool_describe', {names: ['altron_context', 'altron_update']}];
      }
      requests.push({model: body.model, interview, repaired, step, tool: next?.[0] || null, stream: Boolean(body.stream)});
      let message;
      if (next) {
        assert.ok(body.tools.some(t => t.function?.name === next[0]), `Native tool missing: ${next[0]}`);
        message = {role: 'assistant', content: null, tool_calls: [{id: 'qa-' + randomUUID(), type: 'function', function: {name: next[0], arguments: JSON.stringify(next[1])}}]};
      } else {
        message = {role: 'assistant', content: 'Сохранено в Altron.'};
      }
      const finish_reason = next ? 'tool_calls' : 'stop';
      const base = {id: 'qa-' + randomUUID(), model, created: Math.floor(Date.now() / 1000)};
      if (body.stream) {
        res.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-cache'});
        const delta = {...message};
        if (delta.tool_calls) delta.tool_calls = delta.tool_calls.map((t, index) => ({index, ...t}));
        res.write('data: ' + JSON.stringify({...base, object: 'chat.completion.chunk', choices: [{index: 0, delta, finish_reason: null}]}) + '\n\n');
        res.write('data: ' + JSON.stringify({...base, object: 'chat.completion.chunk', choices: [{index: 0, delta: {}, finish_reason}], usage: {prompt_tokens: 100, completion_tokens: 30, total_tokens: 130}}) + '\n\n');
        res.end('data: [DONE]\n\n');
      } else {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({...base, object: 'chat.completion', choices: [{index: 0, message, finish_reason}], usage: {prompt_tokens: 100, completion_tokens: 30, total_tokens: 130}}));
      }
    } catch (error) {
      errors.push(error.message);
      res.statusCode = 500;
      res.end(JSON.stringify({error: {message: 'Scripted protocol fixture rejected request', type: 'fixture_error'}}));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {baseUrl: `http://127.0.0.1:${server.address().port}/v1`, requests, errors, contract,
    close: () => new Promise(resolve => {server.close(resolve); server.closeAllConnections();})};
}
