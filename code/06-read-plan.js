// n8n Code node: "Read plan"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

const it = $input.first().json || {};
let o = (it.output !== undefined && it.output !== null) ? it.output : it;
if (typeof o === "string") { try { o = JSON.parse(o); } catch(e){ const m = o.match(/\{[\s\S]*\}/); try { o = m ? JSON.parse(m[0]) : null; } catch(e2){ o = null; } } }
if (!o || typeof o !== "object") o = {};
const VALID = new Set(["inline","api","paginated","crawl","giant_flag","review"]);
// Parse failure / unknown strategy -> human review, NOT the harvester (giant_flag must be an explicit verdict).
let strategy = VALID.has(o.strategy) ? o.strategy : "review";
let reason = VALID.has(o.strategy) ? "" : ("unparseable/unknown strategy: " + String(o.strategy || "(missing)"));
let companies = Array.isArray(o.companies) ? o.companies.filter(function(c){ return c && typeof c === "object"; }) : [];
let page_urls = (Array.isArray(o.page_urls) ? o.page_urls : []).filter(function(u){ return typeof u === "string" && /^https?:\/\//i.test(u); });
let crawl_url = (typeof o.crawl_url === "string" && /^https?:\/\//i.test(o.crawl_url.trim())) ? o.crawl_url.trim() : "";
let truncated_pages = false;
// v3 (A1): STRATEGY-PAYLOAD COHERENCE — a valid strategy with an unusable payload must never reach an executor.
if (strategy === "crawl" && !crawl_url) { strategy = "review"; reason = "strategy=crawl but no usable crawl_url"; }
if (strategy === "paginated") {
  if (page_urls.length === 0) { strategy = "review"; reason = "strategy=paginated but no usable page_urls"; }
  else if (page_urls.length > 60) { truncated_pages = true; page_urls = page_urls.slice(0, 60); }
}
if ((strategy === "inline" || strategy === "api") && companies.length === 0) { strategy = "review"; reason = "strategy=" + String(o.strategy) + " but companies is empty"; }
// v3 (D8): implausible volume from a scraped-page strategy is a red flag (prompt-injection / runaway), not data.
if (companies.length > 500) { strategy = "review"; reason = "implausible companies count: " + companies.length + " (cap 500)"; companies = []; }
// v3.5: SELF-CONFESSED PARTIAL (Abstract case) — agent returned a 5-company sample with estimated_count 250.
// If the inline/api payload is less than HALF the agent's own estimate, it sampled: review, never a write.
// Threshold 25% (not 50%): estimated_count = TOTAL directory size BEFORE exited-exclusions (defined in
// the prompt), so honest high-exit funds (observed: 9-34% exited; allow up to ~75%) must not trip this.
// The real failure shape is extreme (5 of 250 = 2%), not borderline.
if ((strategy === "inline" || strategy === "api") && typeof o.estimated_count === "number" && o.estimated_count > 0
    && companies.length < Math.max(5, Math.ceil(o.estimated_count * 0.25))) {
  strategy = "review";
  reason = "partial " + String(o.strategy) + " payload: " + companies.length + " companies vs agent's own estimated_count " + o.estimated_count + " — sample returned as if complete";
}
// v3.19: names-only payload (text-only / Framer portfolios, e.g. Altos) — an inline/api result
// where NO company has a domain OR a lookup_url. The resolvers can act on neither, so without this every
// company drops in Parse harvest and the run is mislabeled "no_new". Route to review with an honest reason.
// (No name-search: generic names like Self / Path / Channel / SODA would mis-resolve.)
if ((strategy === "inline" || strategy === "api") && companies.length > 0) {
  var _resolvable = 0;
  for (var _i = 0; _i < companies.length; _i++) {
    var _c = companies[_i] || {};
    var _d = (typeof _c.domain === "string") ? _c.domain.trim() : "";
    var _lu = (typeof _c.lookup_url === "string") ? _c.lookup_url.trim() : "";
    if (_d || _lu) { _resolvable++; }
  }
  if (_resolvable === 0) {
    strategy = "review";
    reason = "names-only payload: " + companies.length + " companies, none with a domain or lookup_url on the page (text-only/Framer portfolio) — needs an alternate domain source; not name-searched per policy";
  }
}
return [{ json: {
  strategy: strategy,
  companies: companies,
  page_urls: page_urls,
  crawl_url: crawl_url,
  path_hint: (typeof o.path_hint === "string") ? o.path_hint.trim() : "",
  estimated_count: (typeof o.estimated_count === "number") ? o.estimated_count : null,
  _agent_archetype: o.archetype || "", _agent_notes: o.notes || "",
  _agent_escalated: !!o.escalated, _agent_confidence: o.confidence, _agent_tools: o.tools_used || [],
  _raw_strategy: o.strategy || "(missing)",
  _reason: reason,
  _page_urls_truncated: truncated_pages
} }];
