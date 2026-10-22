// n8n Code node: "Init state"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.


const sd = $getWorkflowStaticData('global');
const cfg = ($('Build config').first() || {json:{}}).json || {};
let idx = {}; try { idx = ($('Parse index pick').first() || {json:{}}).json || {}; } catch(e) {}
const directoryUrl = idx.index_url || (cfg.vc_domain ? ('https://' + String(cfg.vc_domain).replace(/^https?:\/\//,'')) : (idx.vc_domain || ''));
const PROMPT =
"You are a portfolio-extraction engineer. Return the COMPLETE list of the firm's CURRENT portfolio companies from the directory at " + directoryUrl + " as JSON. Decide everything at runtime; do NOT assume any site-specific format.\n\n" +
"You have two tools: code_execution (a Python sandbox with NO internet of its own) and http_request (an ASYNC function you call FROM your Python code to make any HTTP request; it returns a JSON string {\"status\":number,\"headers\":{selected response headers},\"body\":<parsed JSON or text>}). You MAY call http_request CONCURRENTLY with asyncio.gather in batches of up to ~75 calls — one batch completes in one round trip, so batching is the ONLY fast way to fetch many items. (Drop to ~20 per batch only if individual responses are large, >100KB each.)\n\n" +
"Steps:\n" +
"1. Call http_request from code to GET " + directoryUrl + " and inspect the raw HTML/JS to discover the backend API that actually serves the companies (e.g. an Algolia applicationId + search-only apiKey + index name, a __NEXT_DATA__ blob, or any JSON/search endpoint). On WordPress sites (wp-json / api.w.org present): GET /wp-json/ (the REST ROOT) and check its custom namespaces (e.g. firm/v1) — custom routes like get-companies / get-company-content usually expose fields the generic wp/v2 API lacks.\n" +
"2. In code, query that API and PAGINATE / FACET through EVERY page until exhausted. CRITICAL FOR SPEED: probe with the smallest page first to read the reported total (hitsPerPage=0, per_page=1, or the X-WP-Total / X-WP-TotalPages response headers), then request the LARGEST page size the API allows (Algolia hitsPerPage=1000; WordPress per_page=100) and fetch all remaining pages CONCURRENTLY with asyncio.gather. Every batch is one slow round-trip, so use the fewest batches possible.\n" +
"3. If the list data lacks each company's EXTERNAL website, look for a per-item detail/content endpoint (e.g. get-company-content?id=X) and — ONLY when the total is known and <= ~1000 — fetch ALL items in concurrent batches of ~75, parsing out the external website (the first non-social external href) and any status field. EXCLUDE companies whose status marks them exited/acquired/prior whenever a status field exists anywhere in the data. When filtering social/own-domain hosts, ALWAYS compare PARSED hostnames by equality or dot-suffix (urlparse(u).netloc), NEVER by substring — 'x.com' in 'idrx.com' is the classic bug.\n" +
"4. Deduplicate by WEBSITE/URL — never by name alone (distinct companies share names). Keep only company name + external website. Exclude the firm itself, social/login/jobs links, and category labels.\n" +
"5. HONEST FALLBACK: if after checking custom namespaces and detail endpoints there is genuinely NO external-website source anywhere, do NOT put the firm's own URLs in 'website'. Return each company as {'name': ..., 'website': '', 'profile_url': <the firm's own page for that company>} and state in ONE sentence that the site publishes no external sites.\n" +
"6. Do ALL fetching/pagination/parsing/dedup INSIDE the sandbox via http_request. Never print raw pages or progress totals as your result.\n" +
"7. FINAL OUTPUT (critical, the only thing that matters): once you have EVERY company, make ONE final print of the COMPLETE list, exactly:\n" +
"   print('RESULT_JSON:' + json.dumps({'companies': companies, 'count': len(companies)}))\n" +
"   Each company is {'name':..., 'website':...} (plus 'profile_url' when website is empty). `companies` must contain EVERY company you collected (do NOT summarize, sample, truncate, or print just a count). Keep any prose reply to one short sentence.";
let HINT = "";
try {
  const plan = ($('Read plan').first() || {json:{}}).json || {};
  if (plan._agent_notes) HINT = "\n\nANALYST HINT from the discovery agent (it already inspected this page; verify before trusting, fall back to your own discovery if it is wrong): " + String(plan._agent_notes).slice(0, 2000);
} catch(e) {}
// v3 (A5): state is scoped PER EXECUTION — concurrent VC runs no longer collide on sd.messages.
sd.runs = sd.runs || {};
const rk = Object.keys(sd.runs);
if (rk.length > 10) { rk.sort(function(a,b){ return String((sd.runs[a]||{})._ts||'').localeCompare(String((sd.runs[b]||{})._ts||'')); }); for (const k of rk.slice(0, rk.length - 10)) delete sd.runs[k]; }
sd.runs[$execution.id] = { _ts: new Date().toISOString(), messages: [{ role: "user", content: PROMPT + HINT }], container: null, done: false, final: null, round: 0, retries: 0 };
return [{ json: { started: true, directoryUrl: directoryUrl, _exec: $execution.id } }];
