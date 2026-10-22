// n8n Code node: "Crawl review reason"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

// v3 (A2): a failed/cancelled/stuck crawl is a REVIEW verdict with an honest reason — not an empty quarantine.
const j = $input.first().json || {};
let cfg = {}; try { cfg = ($('Build config').first() || {json:{}}).json || {}; } catch(e) {}
return [{ json: { vc_account_id: cfg.vc_account_id || '', vc_name: cfg.vc_name || '', vc_domain: cfg.vc_domain || '', _review: true, _verdict: 'crawl_failed',
  _reason: ('crawl ended status=' + (j.status || '(no status / poll timeout ~10min)') + '; completed=' + (j.completed || 0) + '/' + (j.total || 0)).slice(0, 300) } }];
