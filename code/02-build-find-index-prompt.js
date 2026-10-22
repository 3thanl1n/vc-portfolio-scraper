// n8n Code node: "Build find-index prompt"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

function normalizeDomain(d){ if(!d||typeof d!=="string") return ""; return d.toLowerCase().trim().replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/[\/?#].*$/,""); }
function registrableDomain(d){ const n=normalizeDomain(d); if(!n) return ""; const p=n.split("."); if(p.length<=2) return n; const last2=p.slice(-2).join("."); const COMPOUND=["co.uk","org.uk","ac.uk","gov.uk","co.kr","com.br","com.au","co.jp","co.il","co.za","co.nz","com.mx","co.in","com.sg","com.tr","com.cn","com.hk","co.th","com.tw","com.co"]; return (COMPOUND.indexOf(last2)>-1 && p.length>=3)?p.slice(-3).join("."):last2; }
function normalizeName(name){ if(!name||typeof name!=="string") return ""; let s=name.toLowerCase().trim(); s=s.replace(/[.,]?\s+(inc|llc|ltd|limited|corp|corporation|co|gmbh|sa|ag|plc|pte|bv)\.?$/i,""); return s.replace(/[^a-z0-9]/g,""); }
function cleanUrl(u){ if(!u||typeof u!=="string") return null; let s=u.trim(); const m=s.match(/https?:\/\/[^\s)\]]+/i); if(m) s=m[0]; if(s===""||s==="/"||s.indexOf("#")===0||/^(javascript|mailto|tel):/i.test(s)) return null; if(/^https?:\/\//i.test(s)) return /^https?:\/\/[^\/\s]+\.[a-z]{2,}/i.test(s)?s:null; return /^[^\/\s]+\.[a-z]{2,}/i.test(s)?("https://"+s):null; }
function hostOf(u){ return String(u||"").replace(/^https?:\/\//i,"").split("/")[0].toLowerCase(); }
const BLOCK = new Set(["firecrawl.dev","linkedin.com","twitter.com","x.com","facebook.com","instagram.com","threads.net","crunchbase.com","youtube.com","pitchbook.com","bloomberg.com","wikipedia.org","g2.com","github.com","medium.com","apps.apple.com","play.google.com","getro.com","getro.io","consider.com","pinpointhq.com","teamtailor.com","greenhouse.io","lever.co","ashbyhq.com","workable.com","bamboohr.com","altareturn.com"]);
const PLATFORM_SUBDOMAIN = /^(jobs|job|careers|career|apply|boards|board|talent|hire|hiring|work)\./i;
// Let an LLM pick THE portfolio-list page from the map results. Handles any slug (/companies-list,
// /portfolio, ...) and domain drift (abstract.vc -> abstract.com) that deterministic rules can't.
const cfg = $('Build config').first().json;
const resp = $input.first().json || {};
function getLinks(d,dep){ if(!d||typeof d!=="object"||dep>6) return null; if(Array.isArray(d.links)) return d.links; if(d.data&&Array.isArray(d.data.links)) return d.data.links; if(Array.isArray(d.data)) return d.data; if(Array.isArray(d)) return d; for(const k in d){ const v=d[k]; if(v&&typeof v==="object"){ const f=getLinks(v,(dep||0)+1); if(f) return f; } } return null; }
const links = getLinks(resp,0) || [];
const cands = []; const seen = new Set();
for(const l of links){
  const url = (typeof l==="string") ? l : (l && l.url) ? l.url : "";
  if(!url) continue;
  if(/\.(xml|rss|json|txt|pdf)(\?|$)/i.test(url)) continue;        // drop sitemaps/feeds
  if(seen.has(url)) continue; seen.add(url);
  cands.push({ url: url, title: (l&&l.title)||"", desc: String((l&&l.description)||"").slice(0,220) });
  if(cands.length>=400) break;
}
// v3 (B4): deterministically promote portfolio-ish slugs before truncating to 60 (map order kept within classes — stable sort)
const PRIO = /(portfolio|companies|investments|our-companies|startups|ventures)/i;
cands.sort(function(a,b){ return (PRIO.test(b.url)?1:0)-(PRIO.test(a.url)?1:0); });
const top = cands.slice(0,60);
const list = top.map((c,i)=> (i+1)+". "+c.url+"\n   title: "+c.title+"\n   desc: "+c.desc).join("\n");
const prompt =
  "Below are pages from the website of the VC firm \"" + cfg.vc_name + "\".\n\n" +
  "Identify THE single page that lists the firm's PORTFOLIO COMPANIES — the directory/index of companies they have invested in. It is NOT the team page, blog, jobs board, news, or a sitemap. Use the titles and descriptions to decide (a portfolio list usually names multiple companies). If several qualify, choose the most comprehensive one. Copy the url EXACTLY from the list. If none of these is a portfolio list, return an empty url.\n\n" +
  "Pages:\n" + list + "\n\n" +
  "Respond ONLY as compact JSON: {\"index_url\":\"<exact url from the list, or empty string>\"}";
return [{ json: { vc_account_id: cfg.vc_account_id, vc_name: cfg.vc_name, vc_domain: cfg.vc_domain, _candidate_urls: top.map(c=>c.url), _llm_prompt: prompt } }];
