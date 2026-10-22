// n8n Code node: "Build review row"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

// v3 (A7): every review/quarantine verdict becomes a row downstream automation can see — never a dead end.
const j = $input.first().json || {};
let cfg = {}; try { cfg = ($('Build config').first() || {json:{}}).json || {}; } catch(e) {}
let plan = {}; try { plan = ($('Read plan').first() || {json:{}}).json || {}; } catch(e) {}
const verdict = j._verdict || 'review';
const reason = String(j._reason || j._warning || ('strategy=' + (plan._raw_strategy || plan.strategy || j.strategy || '(pre-agent)'))).slice(0, 500);
const notes = String(j._agent_notes || plan._agent_notes || '').slice(0, 800);
return [{ json: {
  vc_account_id: j.vc_account_id || cfg.vc_account_id || '', vc_name: j.vc_name || cfg.vc_name || '', vc_domain: j.vc_domain || cfg.vc_domain || '',
  portco_name: '', url: '', domain: '',
  verdict: verdict, reason: reason, agent_notes: notes, strategy: plan._raw_strategy || plan.strategy || '', _source: 'portco_finder_review'
} }];
