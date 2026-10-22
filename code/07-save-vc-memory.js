// n8n Code node: "Save VC memory"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

// Save VC memory — per-VC discovery record in workflow static data (free, deterministic).
// NOTE: static data persists only on PRODUCTION (trigger) executions, not manual test runs.
const sd = $getWorkflowStaticData('global');
const j = $input.first().json || {};
let cfg = {}; try { cfg = ($('Build config').first() || {json:{}}).json || {}; } catch(e) {}
function memKey(dm){ return String(dm||'').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/[\/?#].*$/,''); }
const k = memKey(cfg.vc_domain);
if (k) {
  sd.vc_memory = sd.vc_memory || {};
  const prev = sd.vc_memory[k] || {};
  sd.vc_memory[k] = {
    ts: new Date().toISOString(),
    strategy: j.strategy || "",
    archetype: j._agent_archetype || "",
    notes: String(j._agent_notes || "").slice(0, 600),
    crawl_url: j.crawl_url || "",
    path_hint: j.path_hint || "",
    page_urls_count: Array.isArray(j.page_urls) ? j.page_urls.length : 0,
    estimated_count: j.estimated_count,
    confidence: j._agent_confidence,
    last_company_count: prev.last_company_count || null
  };
  const keys = Object.keys(sd.vc_memory);
  if (keys.length > 800) {
    keys.sort((a,b) => String(sd.vc_memory[a].ts||'').localeCompare(String(sd.vc_memory[b].ts||'')));
    for (const old of keys.slice(0, keys.length - 800)) delete sd.vc_memory[old];
  }
}
return [{ json: j }];
