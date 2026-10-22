// n8n Code node: "Harvest → staging items"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.


const sd = $getWorkflowStaticData('global');
sd.runs = sd.runs || {};
const S = sd.runs[$execution.id] || {};
const cfg = ($('Build config').first() || {json:{}}).json || {};
function normalizeDomain(d){ if(!d||typeof d!=="string") return ""; return d.toLowerCase().trim().replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/[\/?#].*$/,""); }
function registrableDomain(d){ const n=normalizeDomain(d); if(!n) return ""; const p=n.split("."); if(p.length<=2) return n; const last2=p.slice(-2).join("."); const COMPOUND=["co.uk","org.uk","ac.uk","gov.uk","co.kr","com.br","com.au","co.jp","co.il","co.za","co.nz","com.mx","co.in","com.sg","com.tr","com.cn","com.hk","co.th","com.tw","com.co"]; return (COMPOUND.indexOf(last2)>-1 && p.length>=3)?p.slice(-3).join("."):last2; }
function normalizeName(name){ if(!name||typeof name!=="string") return ""; let s=name.toLowerCase().trim(); s=s.replace(/[.,]?\s+(inc|llc|ltd|limited|corp|corporation|co|gmbh|sa|ag|plc|pte|bv)\.?$/i,""); return s.replace(/[^a-z0-9]/g,""); }
const BLOCK = new Set(["firecrawl.dev","linkedin.com","twitter.com","x.com","facebook.com","instagram.com","threads.net","crunchbase.com","youtube.com","pitchbook.com","bloomberg.com","wikipedia.org","g2.com","github.com","medium.com","apps.apple.com","play.google.com","squarespace.com","squarespace-cdn.com","onetrust.com","cloudfront.net","cloudinary.com","akamaized.net"]);
const vcDom = registrableDomain(cfg.vc_domain);
const seenD = new Set(cfg.known_domains || []);   // already registrableDomain-normalized by Build config
const seenN = new Set(cfg.known_names || []);     // already normalizeName-normalized by Build config
const f = S.final || {};
delete sd.runs[$execution.id];                    // v3: run state is finished — stop static-data bloat
const mk = String(cfg.vc_domain || '').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/[\/?#].*$/,'');
function memo(field, val){ try { if (mk) { sd.vc_memory = sd.vc_memory || {}; sd.vc_memory[mk] = sd.vc_memory[mk] || {}; sd.vc_memory[mk][field] = val; sd.vc_memory[mk].ts = sd.vc_memory[mk].ts || new Date().toISOString(); } } catch(e) {} }
let companies = Array.isArray(f.companies) ? f.companies : (Array.isArray(f) ? f : []);
const out = [];
let internal = 0, considered = 0;
for (const c of companies) {
  if (!c || typeof c !== 'object') continue;
  const name = String(c.name || c.portco_name || "").trim();
  const site = String(c.website || c.domain || c.url || "").trim();
  const profile = String(c.profile_url || "").trim();
  if (!name && !site && !profile) continue;
  considered++;
  let dom = registrableDomain(site);
  // v3 (#3348): the firm's own domain / a BLOCK host is NOT a company identity — treat as domainless.
  if (dom && (dom === vcDom || BLOCK.has(dom))) { internal++; dom = ""; }
  else if (!dom && profile) { internal++; }       // explicit names-only entry (honest-fallback contract)
  if (dom) {
    if (seenD.has(dom)) continue; seenD.add(dom); // DOMAIN is the dedup key (QA#1: no name arm when a domain exists)
    out.push({ json: { vc_account_id: cfg.vc_account_id, vc_name: cfg.vc_name, vc_domain: cfg.vc_domain, portco_name: name, url: site, domain: site, _source: "ptc_harvester" } });
  } else {
    const nm = normalizeName(name);
    if (!nm) continue;
    if (seenN.has(nm)) continue; seenN.add(nm);   // name arm ONLY for domainless entries (nothing else to key on)
    out.push({ json: { vc_account_id: cfg.vc_account_id, vc_name: cfg.vc_name, vc_domain: cfg.vc_domain, portco_name: name, url: (profile || site), domain: "", _source: "ptc_harvester", _names_only: true } });
  }
}
// v3: harvester error with nothing usable -> review verdict, never a junk staging row (A3).
if ((f._api_error || f._error) && out.length === 0) {
  memo('outcome', 'harvester_error');
  return [{ json: { vc_account_id: cfg.vc_account_id, vc_name: cfg.vc_name, vc_domain: cfg.vc_domain, _review: true, _verdict: 'harvester_error',
    _reason: ('harvester error: ' + JSON.stringify(f._api_error || f._error)).slice(0, 400) } }];
}
// v3 (#3348): >=90% firm-internal/blocked URLs -> internal_links_only verdict, never a silent 800->1 collapse.
if (considered >= 10 && internal / considered >= 0.9) {
  memo('outcome', 'internal_links_only');
  return [{ json: { vc_account_id: cfg.vc_account_id, vc_name: cfg.vc_name, vc_domain: cfg.vc_domain, _review: true, _verdict: 'internal_links_only',
    _reason: ('harvester returned ' + internal + '/' + considered + ' companies with only firm-internal/blocked URLs — a per-company detail/content endpoint probably carries the real domains (see agent notes); do not write these as companies'),
    _names_only_count: out.length } }];
}
if (!out.length) {
  memo('outcome', 'empty');
  return [{ json: { vc_account_id: cfg.vc_account_id, vc_name: cfg.vc_name, vc_domain: cfg.vc_domain, _review: true, _verdict: 'empty_harvest',
    _reason: ('harvest produced 0 net-new rows (raw count: ' + companies.length + ')' + (f._truncated ? ' [max_tokens truncation]' : '') + (f._refusal ? ' [refusal]' : '')).slice(0, 400) } }];
}
memo('last_company_count', out.length);
memo('outcome', f._truncated ? 'written_truncated' : 'written');
return out;
