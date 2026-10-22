// n8n Code node: "Build agent input"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

const c = $input.first().json;
const idx = c.index_url || (c.vc_domain ? ("https://" + String(c.vc_domain).replace(/^https?:\/\//,"")) : "(website unknown)");
const sd = $getWorkflowStaticData('global');
function memKey(dm){ return String(dm||'').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/[\/?#].*$/,''); }
const mem = (sd.vc_memory || {})[memKey(c.vc_domain)] || null;
let agent_prompt =
  "VC firm: " + (c.vc_name || "(unknown)") + "\n" +
  "Firm domain: " + (c.vc_domain || "") + "\n" +
  "Portfolio page (already located for you): " + idx + "\n";
const fp = c._fingerprint || {};
if (fp.found) {
  agent_prompt += "\nAPI FINGERPRINT SCAN (deterministic pre-scan of the page source and its script bundles — verify before trusting):\n" + fp.summary + "\n";
} else {
  agent_prompt += "\nAPI FINGERPRINT SCAN: no API signatures detected in the page source" + (fp.summary ? (" (" + fp.summary + ")") : "") + ". The page may still be API-backed via runtime-loaded config.\n";
}
if (mem) {
  agent_prompt += "\nPRIOR RUN (" + (mem.ts || "?") + "): strategy=" + (mem.strategy || "?") +
    (mem.archetype ? (", archetype=" + mem.archetype) : "") +
    (mem.last_company_count ? (", last harvest count=" + mem.last_company_count) : "") +
    (mem.crawl_url ? (", crawl_url=" + mem.crawl_url) : "") +
    (mem.notes ? ("\nPrior notes: " + mem.notes) : "") +
    "\nVerify the prior approach with ONE cheap call first; if it still holds, return the SAME strategy without re-discovering — do not switch strategies for stylistic reasons; consistency across runs matters downstream. If it fails, discover from scratch.\n";
}
agent_prompt += "\nDiscover how this firm's portfolio companies are served and act per your instructions.";
return [{ json: { ...c, agent_prompt } }];
