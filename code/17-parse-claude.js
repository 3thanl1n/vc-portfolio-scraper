// n8n Code node: "Parse Claude"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

function normDom(d){ if(!d||typeof d!=="string") return ""; return d.toLowerCase().trim().replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/[\/?#].*$/,""); }
function regDom(d){ const n=normDom(d); if(!n) return ""; const p=n.split("."); if(p.length<=2) return n; const last2=p.slice(-2).join("."); const C=["co.uk","org.uk","ac.uk","gov.uk","co.kr","com.br","com.au","co.jp","co.il","co.za","co.nz","com.mx","co.in","com.sg","com.tr","com.cn","com.hk","co.th","com.tw","com.co"]; return (C.indexOf(last2)>-1&&p.length>=3)?p.slice(-3).join("."):last2; }
function hostReg(u){ const m=String(u||"").toLowerCase().match(/^[a-z][a-z0-9+.-]*:\/\/([^\/?#]*)/); return m?regDom(m[1]):""; }
function fullKey(u){ let s=String(u||"").toLowerCase().trim(); s=s.replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/[?#].*$/,"").replace(/\/+$/,""); return s; }
function cleanUrl(u){ if(!u||typeof u!=="string") return null; let s=u.trim(); const m=s.match(/https?:\/\/[^\s)\]]+/i); if(m) s=m[0]; if(s===""||s==="/"||s.indexOf("#")===0||/^(javascript|mailto|tel):/i.test(s)) return null; if(/^https?:\/\//i.test(s)) return /^https?:\/\/[^\/\s]+\.[a-z]{2,}/i.test(s)?s:null; return /^[^\/\s]+\.[a-z]{2,}/i.test(s)?("https://"+s):null; }
var BLOCK=new Set(["linkedin.com","twitter.com","x.com","facebook.com","instagram.com","threads.net","youtube.com","tiktok.com","t.me","discord.gg","discord.com","reddit.com","crunchbase.com","pitchbook.com","wikipedia.org","g2.com","github.com","apps.apple.com","play.google.com","firecrawl.dev","substack.com","medium.com","beehiiv.com","ghost.io","wordpress.com","mirror.xyz","notion.site","hashnode.dev","squarespace.com","squarespace-cdn.com","onetrust.com","cloudfront.net","cloudinary.com","akamaized.net","gravatar.com","w.org","plasmic.app","techcrunch.com","forbes.com","bloomberg.com","businesswire.com","prnewswire.com","globenewswire.com","statnews.com","fiercebiotech.com","fiercehealthcare.com","reuters.com","wsj.com","nytimes.com","vogue.com","time.com","inc.com","fastcompany.com","today.com","newsweek.com"]);
var CONTENT_HOSTS=new Set(["substack.com","medium.com","beehiiv.com","ghost.io","wordpress.com","mirror.xyz","notion.site","hashnode.dev"]);
function llmText(resp){ const r=resp||{}; let c=null; if(r.choices&&r.choices[0]&&r.choices[0].message) c=r.choices[0].message.content; if(c==null&&r.message) c=(typeof r.message.content!=="undefined")?r.message.content:r.message; if(c==null&&typeof r.content!=="undefined") c=r.content; if(c==null&&typeof r.text!=="undefined") c=r.text; if(Array.isArray(c)) c=c.map(function(b){return (b&&typeof b.text==="string")?b.text:(typeof b==="string"?b:"");}).join(" "); if(c&&typeof c==="object") c=c.text||c.content||JSON.stringify(c); return (typeof c==="string")?c:(c!=null?String(c):""); }
function parseCompanies(txt){ if(!txt) return []; let o=null; try{o=JSON.parse(txt);}catch(e){ const m=txt.match(/\{[\s\S]*\}/); if(m){try{o=JSON.parse(m[0]);}catch(e2){}} } if(o&&Array.isArray(o.companies)) return o.companies; if(Array.isArray(o)) return o; return []; }
function assembleRows(fbArr, verdictItems, cfg, knownDomains){
  const vcDom=regDom(cfg.vc_domain);
  const lookupSet=new Set(); for(const e of fbArr){ if(e&&e.lookup_url){const fk=fullKey(e.lookup_url); if(fk) lookupSet.add(fk);} }
  function keyOf(u){ const fk=fullKey(u); if(lookupSet.has(fk)) return "LU|"+fk; return regDom(cleanUrl(u)||u||""); }
  const verd={};
  for(const it of verdictItems){ for(const c of parseCompanies(llmText(it.json!==undefined?it.json:it))){ if(!c||typeof c!=="object")continue; const key=keyOf(c.source_url); if(!key)continue; const dom=regDom(cleanUrl(c.domain)||c.domain||""); if(!verd[key]) verd[key]={domain:dom,keep:(c.keep!==false),status:(c.status||"")}; } }
  const fb={};
  for(const e of fbArr){ const isLU=!!(e&&e.lookup_url); const key=isLU?keyOf(e.lookup_url):regDom(cleanUrl(e.source_url)||e.source_url||e.domain||""); if(!key)continue; if(!fb[key]) fb[key]={name:(e.name||""),domain:regDom(e.domain||"")}; }
  const out=[]; const seen=new Set(knownDomains||[]);
  for(const key of Object.keys(fb)){
    const f=fb[key]; const v=verd[key]||null;
    if(v && v.keep===false) continue;
    let domain=(v&&v.domain&&v.domain!==vcDom&&!BLOCK.has(v.domain)&&!CONTENT_HOSTS.has(v.domain))?v.domain:f.domain;
    if(!domain||domain===vcDom||BLOCK.has(domain)||CONTENT_HOSTS.has(domain)) continue;
    if(seen.has(domain)) continue; seen.add(domain);
    out.push({ portco_name:(f.name||null), url:"https://"+domain, domain:domain, _resolved_via:(v?("claude-verdict-"+(v.status||"current")):"direct-or-fallback") });
  }
  return out;
}

// ── Parse Claude (v3.18) — fallback from BOTH Profiles → domains (mined lookups; pushed first so it wins)
//    and Parse harvest (directs + names). Direct-domain firms (inline shape, e.g. Abstract) skip the
//    profile scrape (the IF 'Profiles to scrape?' routes them straight here), so their domains come from
//    Parse harvest and the Claude verdict ($input) is empty for them -> they pass through kept.
const cfg=$('Build config').first().json;
const knownDomains=new Set(cfg.known_domains||[]);
const fbArr=[];
try{ for(const it of $('Profiles → domains').all()){ const a=(it.json&&it.json._fallback)?it.json._fallback:[]; for(const e of a) fbArr.push(e); } }catch(err){}
try{ for(const it of $('Parse harvest').all()){ const a=(it.json&&it.json._fallback)?it.json._fallback:[]; for(const e of a) fbArr.push(e); } }catch(err){}
const rows=assembleRows(fbArr, $input.all(), cfg, Array.from(knownDomains));
return rows.map(function(r){ return { json: { vc_account_id:cfg.vc_account_id, vc_name:cfg.vc_name, vc_domain:cfg.vc_domain, portco_name:r.portco_name, url:r.url, domain:r.domain, _resolved_via:r._resolved_via } }; });
