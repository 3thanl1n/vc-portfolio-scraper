// n8n Code node: "Handle + service tools"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.


const sd = $getWorkflowStaticData('global');
sd.runs = sd.runs || {};
const S = sd.runs[$execution.id];
if (!S) { return [{ json: { done: true, _error: 'missing run state (evicted? concurrent prune?)' } }]; }
const resp = $input.first().json;

function extractFinal() {
  // scan EVERY assistant code_execution_tool_result across the whole conversation for the RESULT_JSON: sentinel
  let best = null, lastStdout = null;
  for (const m of S.messages) {
    if (!m || m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (b.type === 'code_execution_tool_result' && b.content && typeof b.content.stdout === 'string') {
        const s = b.content.stdout;
        if (s.trim()) lastStdout = s.trim();
        const i = s.lastIndexOf('RESULT_JSON:');
        if (i !== -1) {
          const j = s.slice(i + 12).trim();
          try { best = JSON.parse(j); } catch (e) { if (!best) best = { error: 'result_json_unparseable', length: j.length, head: j.slice(0, 300) }; }
        }
      }
    }
  }
  if (best) return best;
  if (lastStdout) { try { return JSON.parse(lastStdout); } catch (e) { return { raw_stdout: lastStdout.slice(0, 2000) }; } }
  const txt = S.messages.filter(function(m){ return m.role==='assistant' && Array.isArray(m.content); }).flatMap(function(m){ return m.content; }).filter(function(b){ return b.type==='text'; }).map(function(b){ return b.text; }).join('\n');
  return { text: txt.slice(0, 2000) };
}

// v3 (A4): API-level error -> bounded retry for transient classes; otherwise SALVAGE what the sandbox
// already collected instead of discarding a 50-round harvest.
if (!resp || resp.type === 'error' || !Array.isArray(resp.content)) {
  const et = (resp && resp.error && resp.error.type) || '';
  const retryable = ['overloaded_error', 'rate_limit_error', 'api_error', 'timeout_error'].indexOf(et) > -1;
  if (retryable && (S.retries || 0) < 3) {
    S.retries = (S.retries || 0) + 1;
    await new Promise(function(r){ setTimeout(r, 15000 * S.retries); });   // 15s/30s/45s — far under the 4.5-min container idle limit
    return [{ json: { done: false } }];                                     // re-send the SAME request (nothing appended)
  }
  S.done = true; S.final = Object.assign({}, extractFinal(), { _api_error: (resp && resp.error) || resp || 'empty response' });
  return [{ json: { done: true } }];
}
S.retries = 0;
if (resp.container && resp.container.id) S.container = resp.container.id;

// --- memory guard --------------------------------------------------------------
// Every prior http_request result has ALREADY been consumed by the sandbox and the container holds the
// working state, so raw page bodies are never needed again. Trim already-delivered tool_result bodies
// before they get re-sent (client-side payload control — the only lever on n8n Cloud's fixed heap).
const TRIMMED = '[result already delivered to the sandbox; body trimmed to save memory]';
for (const m of S.messages) {
  if (!m || m.role !== 'user' || !Array.isArray(m.content)) continue;
  for (const b of m.content) {
    if (b && b.type === 'tool_result' && typeof b.content === 'string' && b.content !== TRIMMED && b.content.length > 200) {
      b.content = TRIMMED;
    }
  }
}
// -------------------------------------------------------------------------------

S.messages.push({ role: 'assistant', content: resp.content });
S.round = (S.round || 0) + 1;

const stop = resp.stop_reason;

if (stop === 'end_turn' || stop === 'max_tokens' || stop === 'refusal' || S.round >= 120) {
  S.done = true; S.final = extractFinal();
  if (stop === 'max_tokens' && S.final && typeof S.final === 'object') { S.final._truncated = true; S.final._warning = 'stopped at max_tokens — RESULT_JSON may be partial or missing'; }
  if (stop === 'refusal' && S.final && typeof S.final === 'object') { S.final._refusal = true; }
  if (S.round >= 120 && stop === 'tool_use' && S.final && typeof S.final === 'object') { S.final._round_capped = true; }
  return [{ json: { done: true } }];
}
// v3.4: EVERY client tool_use block must get a tool_result — no exceptions, or the next request 400s
// ("tool_use ids were found without tool_result blocks immediately after"). Real http_request calls are
// serviced; any OTHER/unknown tool name gets a stub error result the model can read and recover from.
// pause_turn with pending client tool_use is serviced too (resending as-is would leave ids unanswered).
const pending = Array.isArray(resp.content) ? resp.content.filter(function(b){ return b && b.type === 'tool_use'; }) : [];
if (stop === 'pause_turn' && pending.length === 0) {
  return [{ json: { done: false } }]; // true long-turn pause: resend as-is per docs
}
if ((stop === 'tool_use' || stop === 'pause_turn') && pending.length > 0) {
  const KEEP_HEADERS = ['x-wp-total', 'x-wp-totalpages', 'link', 'content-type', 'retry-after', 'x-ratelimit-remaining', 'x-ratelimit-reset'];
  const results = new Array(pending.length);
  const self = this;
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= pending.length) return;
      const b = pending[i];
      let outStr;
      if (b.name !== 'http_request') {
        outStr = JSON.stringify({ status: 0, error: "tool '" + b.name + "' does not exist. The ONLY available tool is http_request — call it from your Python code (await http_request({url: ...}))." });
      } else {
        const inp = b.input || {};
        try {
          const r = await self.helpers.httpRequest({
            method: String(inp.method || 'GET').toUpperCase(),
            url: inp.url,
            headers: inp.headers || {},
            qs: inp.query || {},
            body: inp.body,
            json: false,
            returnFullResponse: true,
            timeout: 45000
          });
          let parsed; try { parsed = JSON.parse(r.body); } catch (e) { parsed = r.body; }
          const hsrc = r.headers || {}; const hsel = {};
          for (const hk of KEEP_HEADERS) { if (hsrc[hk] !== undefined) hsel[hk] = String(hsrc[hk]).slice(0, 300); }
          outStr = JSON.stringify({ status: r.statusCode, headers: hsel, body: parsed });
        } catch (e) {
          const sc = (e && e.httpCode) || (e && e.statusCode) || 0;
          outStr = JSON.stringify({ status: sc, error: String((e && e.message) || e) });
        }
      }
      results[i] = { type: 'tool_result', tool_use_id: b.id, content: outStr };
    }
  }
  const POOL = Math.min(8, pending.length);
  await Promise.all(Array.from({ length: POOL }, function(){ return worker(); }));
  // paranoia: no slot may remain unanswered
  for (let i = 0; i < pending.length; i++) {
    if (!results[i]) results[i] = { type: 'tool_result', tool_use_id: pending[i].id, content: JSON.stringify({ status: 0, error: 'servicing slot lost — retry this call' }) };
  }
  S.messages.push({ role: 'user', content: results }); // tool_result-only user message (PTC rule)
  return [{ json: { done: false } }];
}
if (stop === 'tool_use') { S.done = true; S.final = Object.assign({}, extractFinal(), { _error: 'tool_use_with_no_blocks' }); return [{ json: { done: true } }]; }
S.done = true; S.final = Object.assign({}, extractFinal(), { _error: 'unhandled_stop_reason: ' + stop });
return [{ json: { done: true } }];
