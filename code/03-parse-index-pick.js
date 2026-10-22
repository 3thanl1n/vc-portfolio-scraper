// n8n Code node: "Parse index pick"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

function normalizeDomain(d){ if(!d||typeof d!=="string") return ""; return d.toLowerCase().trim().replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/[\/?#].*$/,""); }
function registrableDomain(d){ const n=normalizeDomain(d); if(!n) return ""; const p=n.split("."); if(p.length<=2) return n; const last2=p.slice(-2).join("."); const COMPOUND=["co.uk","org.uk","ac.uk","gov.uk","co.kr","com.br","com.au","co.jp","co.il","co.za","co.nz","com.mx","co.in","com.sg","com.tr","com.cn","com.hk","co.th","com.tw","com.co"]; return (COMPOUND.indexOf(last2)>-1 && p.length>=3)?p.slice(-3).join("."):last2; }
function normalizeName(name){ if(!name||typeof name!=="string") return ""; let s=name.toLowerCase().trim(); s=s.replace(/[.,]?\s+(inc|llc|ltd|limited|corp|corporation|co|gmbh|sa|ag|plc|pte|bv)\.?$/i,""); return s.replace(/[^a-z0-9]/g,""); }
function cleanUrl(u){ if(!u||typeof u!=="string") return null; let s=u.trim(); const m=s.match(/https?:\/\/[^\s)\]]+/i); if(m) s=m[0]; if(s===""||s==="/"||s.indexOf("#")===0||/^(javascript|mailto|tel):/i.test(s)) return null; if(/^https?:\/\//i.test(s)) return /^https?:\/\/[^\/\s]+\.[a-z]{2,}/i.test(s)?s:null; return /^[^\/\s]+\.[a-z]{2,}/i.test(s)?("https://"+s):null; }
function hostOf(u){ return String(u||"").replace(/^https?:\/\//i,"").split("/")[0].toLowerCase(); }
function pathOf(u){ const s=String(u||"").replace(/^https?:\/\//i,""); const i=s.indexOf("/"); return i<0?"":s.slice(i).replace(/[?#].*$/,"").replace(/\/+$/,""); }   // NEW: path after host; "" = bare root
const BLOCK = new Set(["firecrawl.dev","linkedin.com","twitter.com","x.com","facebook.com","instagram.com","threads.net","crunchbase.com","youtube.com","pitchbook.com","bloomberg.com","wikipedia.org","g2.com","github.com","medium.com","apps.apple.com","play.google.com","getro.com","getro.io","consider.com","pinpointhq.com","teamtailor.com","greenhouse.io","lever.co","ashbyhq.com","workable.com","bamboohr.com","altareturn.com"]);
const PLATFORM_SUBDOMAIN = /^(jobs|job|careers|career|apply|boards|board|talent|hire|hiring|work)\./i;
const cfg = $('Build config').first().json;
const ctx = $('Build find-index prompt').first().json;
const cands = (ctx._candidate_urls||[]).map(function(u){return String(u);});
const candSet = new Set(cands); const candNorm = new Set(cands.map(function(u){return u.replace(/\/$/,"");}));
const resp = $input.first().json || {};
function llmText(r){ r=r||{}; let c=null;
  if(r.choices&&r.choices[0]&&r.choices[0].message) c=r.choices[0].message.content;
  if(c==null&&r.message) c=(typeof r.message.content!=="undefined")?r.message.content:r.message;
  if(c==null&&typeof r.content!=="undefined") c=r.content;
  if(c==null&&typeof r.text!=="undefined") c=r.text;
  if(c==null&&typeof r.output_text!=="undefined") c=r.output_text;
  if(Array.isArray(c)) c=c.map(function(b){return (b&&(b.text||b.content))?(b.text||b.content):(typeof b==="string"?b:"");}).join(" ");
  if(c&&typeof c==="object") c=c.text||c.content||JSON.stringify(c);
  return (typeof c==="string")?c:(c!=null?String(c):""); }
const txt = llmText(resp);
let picked = "";
try{ const o=JSON.parse(txt); if(o&&typeof o.index_url==="string") picked=o.index_url.trim(); }
catch(e){ const m=txt.match(/\{[\s\S]*\}/); if(m){ try{ const o=JSON.parse(m[0]); if(o&&typeof o.index_url==="string") picked=o.index_url.trim(); }catch(e2){} } }
if(!picked){ const m2=txt.match(/https?:\/\/[^\s"')]+/i); if(m2) picked=m2[0]; }
// anti-hallucination: must be one of the candidates we showed it
if(picked && !candSet.has(picked) && !candNorm.has(picked.replace(/\/$/,""))) picked="";

if(!picked){
  // ── Single-pager fallback (2026-06-07, Footwork) ─────────────────────────────
  // Some firms (esp. seed funds on Webflow/Carrd) have NO portfolio sub-page — the
  // portfolio is listed inline on the homepage. Map then surfaces only the site root,
  // and the picker correctly won't call the homepage a "portfolio index" → empty pick.
  // Rather than quarantine, crawl the homepage and let harvest read it.
  // GATE on the single-pager signature so we DON'T auto-crawl the root of a big
  // multi-page site that simply has no portfolio page (that burns harvest credits and
  // still quarantines). Signature = map surfaced only the firm's own domain, ≤2 URLs,
  // at least one of which is the bare root. `_picker_fallback` keeps the audit trail.
  const vcReg = registrableDomain(cfg.vc_domain);
  const onVcDomain = cands.length>0 && cands.every(function(u){ return registrableDomain(u)===vcReg; });
  const rootCand = cands.find(function(u){ return registrableDomain(u)===vcReg && pathOf(u)===""; });
  if(onVcDomain && cands.length<=2 && rootCand){
    return [{ json: { vc_account_id: cfg.vc_account_id, vc_name: cfg.vc_name, vc_domain: cfg.vc_domain, index_url: rootCand, _picker_fallback: "single_page_root" } }];
  }
  // OPTIONAL — map returned nothing at all (blocked/transient). Try the homepage anyway;
  // a dead domain just self-quarantines downstream ("crawl returned no pages").
  // Delete this block if you'd rather an empty map go straight to review.
  if(cands.length===0 && vcReg){
    return [{ json: { vc_account_id: cfg.vc_account_id, vc_name: cfg.vc_name, vc_domain: cfg.vc_domain, index_url: "https://"+normalizeDomain(cfg.vc_domain), _picker_fallback: "empty_map_root" } }];
  }
  return [{ json: { vc_account_id: cfg.vc_account_id, vc_name: cfg.vc_name, vc_domain: cfg.vc_domain, index_url: "", _quarantine: true, _reason: "no portfolio-list page identified from map" } }];
}
return [{ json: { vc_account_id: cfg.vc_account_id, vc_name: cfg.vc_name, vc_domain: cfg.vc_domain, index_url: picked } }];
