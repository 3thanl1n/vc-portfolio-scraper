// n8n Code node: "Build config"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

// v3 (B5): optional shared-secret gate — set EXPECTED_TOKEN here AND send header x-portco-token from Clay to enable.
const EXPECTED_TOKEN = "";
const _hdrs = ($input.first().json && $input.first().json.headers) || {};
if (EXPECTED_TOKEN && String(_hdrs['x-portco-token'] || '') !== EXPECTED_TOKEN) { throw new Error('webhook auth failed: missing/wrong x-portco-token header'); }
// Build the dedup index from Claygent (only entries that already have a URL count as "known").
// No agent, no prompt — this flow discovers companies from the VC's own site.
const body = ($input.first().json && $input.first().json.body) ? $input.first().json.body : $input.first().json;
const vc_account_id = body.vc_account_id || "";
const vc_name       = body.vc_name || "";
const vc_domain     = body.vc_domain || "";
const claygent      = body.claygent_portcos;
function normalizeDomain(d){ if(!d||typeof d!=="string") return ""; return d.toLowerCase().trim().replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/[\/?#].*$/,""); }
function registrableDomain(d){ const n=normalizeDomain(d); if(!n) return ""; const p=n.split("."); if(p.length<=2) return n; const last2=p.slice(-2).join("."); const COMPOUND=["co.uk","org.uk","ac.uk","gov.uk","co.kr","com.br","com.au","co.jp","co.il","co.za","co.nz","com.mx","co.in","com.sg","com.tr","com.cn","com.hk","co.th","com.tw","com.co"]; return (COMPOUND.indexOf(last2)>-1 && p.length>=3)?p.slice(-3).join("."):last2; }
function normalizeName(name){ if(!name||typeof name!=="string") return ""; let s=name.toLowerCase().trim(); s=s.replace(/[.,]?\s+(inc|llc|ltd|limited|corp|corporation|co|gmbh|sa|ag|plc|pte|bv)\.?$/i,""); return s.replace(/[^a-z0-9]/g,""); }
function parseExisting(raw){ if(!raw) return []; let arr=null; if(Array.isArray(raw)) arr=raw; else if(typeof raw==="object"&&Array.isArray(raw.portfolio_companies)) arr=raw.portfolio_companies; else if(typeof raw==="string"){ try{const p=JSON.parse(raw); arr=Array.isArray(p)?p:((p&&p.portfolio_companies)||null);}catch(e){arr=null;} } if(!arr) return []; return arr.map(function(x){ return (typeof x==="string")?{name:x,url:null}:{name:(x&&x.name)||"",url:(x&&x.url)||null}; }).filter(function(x){return x.name||x.url;}); }
const existing = parseExisting(claygent);
const knownNames = []; const knownDomains = [];
for (const p of existing){ if (!p.url) continue; const n = normalizeName(p.name); if(n) knownNames.push(n); const d = registrableDomain(p.url); if(d) knownDomains.push(d); }
return [{ json: { vc_account_id, vc_name, vc_domain, known_names: knownNames, known_domains: knownDomains } }];
