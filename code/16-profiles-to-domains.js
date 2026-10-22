// n8n Code node: "Profiles → domains"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

// shared pure logic for the verdict layer (v3.17) — inlined into the n8n nodes + tested here
function normDom(d){ if(!d||typeof d!=="string") return ""; return d.toLowerCase().trim().replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/[\/?#].*$/,""); }
function regDom(d){ const n=normDom(d); if(!n) return ""; const p=n.split("."); if(p.length<=2) return n; const last2=p.slice(-2).join("."); const C=["co.uk","org.uk","ac.uk","gov.uk","co.kr","com.br","com.au","co.jp","co.il","co.za","co.nz","com.mx","co.in","com.sg","com.tr","com.cn","com.hk","co.th","com.tw","com.co"]; return (C.indexOf(last2)>-1&&p.length>=3)?p.slice(-3).join("."):last2; }
function hostReg(u){ const m=String(u||"").toLowerCase().match(/^[a-z][a-z0-9+.-]*:\/\/([^\/?#]*)/); return m?regDom(m[1]):""; }
function fullKey(u){ let s=String(u||"").toLowerCase().trim(); s=s.replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/[?#].*$/,"").replace(/\/+$/,""); return s; }
function cleanUrl(u){ if(!u||typeof u!=="string") return null; let s=u.trim(); const m=s.match(/https?:\/\/[^\s)\]]+/i); if(m) s=m[0]; if(s===""||s==="/"||s.indexOf("#")===0||/^(javascript|mailto|tel):/i.test(s)) return null; if(/^https?:\/\//i.test(s)) return /^https?:\/\/[^\/\s]+\.[a-z]{2,}/i.test(s)?s:null; return /^[^\/\s]+\.[a-z]{2,}/i.test(s)?("https://"+s):null; }
var BLOCK=new Set(["linkedin.com","twitter.com","x.com","facebook.com","instagram.com","threads.net","youtube.com","tiktok.com","t.me","discord.gg","discord.com","reddit.com","crunchbase.com","pitchbook.com","wikipedia.org","g2.com","github.com","apps.apple.com","play.google.com","firecrawl.dev","substack.com","medium.com","beehiiv.com","ghost.io","wordpress.com","mirror.xyz","notion.site","hashnode.dev","squarespace.com","squarespace-cdn.com","onetrust.com","cloudfront.net","cloudinary.com","akamaized.net","gravatar.com","w.org","plasmic.app","techcrunch.com","forbes.com","bloomberg.com","businesswire.com","prnewswire.com","globenewswire.com","statnews.com","fiercebiotech.com","fiercehealthcare.com","reuters.com","wsj.com","nytimes.com","vogue.com","time.com","inc.com","fastcompany.com","today.com","newsweek.com"]);
var CONTENT_HOSTS=new Set(["substack.com","medium.com","beehiiv.com","ghost.io","wordpress.com","mirror.xyz","notion.site","hashnode.dev"]);
function pickDomain(links, firmHostReg){ for (const L of (Array.isArray(links)?links:[])){ const rd=hostReg(L); if(!rd) continue; if(rd===firmHostReg) continue; if(BLOCK.has(rd)) continue; return rd; } return ""; }
function evidence(md){ var t=String(md||""); var foot=t.indexOf("Sign up to get the latest updates"); if(foot>-1) t=t.slice(0,foot); var sm=t.match(/###\s*Status\s*\n+\s*([A-Za-z][A-Za-z \/-]*)/); var st=sm?("STATUS: "+sm[1].trim()+" | "):""; var head=t.slice(0,650).replace(/\s+/g," ").trim(); return (st+head).slice(0,800); }
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
    out.push({ portco_name:(f.name||null), url:"https://"+domain, domain:domain, _resolved_via:(v?("claude-verdict-"+(v.status||"current")):"miner-fallback") });
  }
  return out;
}
var NEWDROP=/exit|acquir|merger|merged|prior|alumni|former|divest|realized|legacy|graduat|\bpast\b/i;
var KEEP=/current|active/i;

// ── Profiles → domains (v3.17) — Run Once for All Items ──────────────────────────────
// Deterministic domain-pick from the Firecrawl profile scrape, then hand SCRAPED EVIDENCE to a Claude
// verdict node (next) that confirms the domain + judges current-vs-exited DYNAMICALLY. No status filter
// here: KEEP everything, let the verdict decide ("keep publics, drop only acquired/merged/defunct" is a
// prompt rule, not a regex token list — the regex missed SHA:/HKSE:). Emits {_llm_prompt,_fallback}
// chunks — the same contract the resolve→ParseClaude path already consumes.
const reqByFk={};
for (const it of $('Parse harvest').all()){ const a=(it.json&&it.json._fallback)?it.json._fallback:[]; for(const e of a){ if(e&&e.lookup_url){ const fk=fullKey(e.lookup_url); if(fk&&!reqByFk[fk]) reqByFk[fk]={source_url:e.lookup_url,name:(e.name||"")}; } } }
const cos=[]; let pagesN=0,matched=0,noDom=0;
for (const it of $input.all()){
  const j=it.json||{}; const resp=(j.body!==undefined&&j.body!==null)?j.body:j; const pages=Array.isArray(resp.data)?resp.data:[];
  for (const p of pages){ pagesN++;
    const meta=(p&&p.metadata)||{}; const u=meta.url||meta.sourceURL||""; const fk=fullKey(u);
    const req=reqByFk[fk]; if(!req) continue; matched++;
    const md=(p&&p.markdown)||""; const links=(p&&Array.isArray(p.links))?p.links:[];
    const domain=pickDomain(links,hostReg(u)); if(!domain) noDom++;
    const h1=((md.match(/^#\s+(.+?)\s*$/m)||[])[1]||"").trim();
    cos.push({ source_url:req.source_url, name:h1||req.name||"", domain:domain, evidence:evidence(md) });
  }
}
const cfg=$('Build config').first().json;
const note="profile-mine v3.17: pages="+pagesN+", matched="+matched+", companies="+cos.length+", no_domain="+noDom;
const CHUNK=20; const out=[];
for(let i=0;i<cos.length;i+=CHUNK){
  const chunk=cos.slice(i,i+CHUNK);
  const listed=chunk.map(function(c,k){ return (k+1)+'. name="'+c.name+'"  candidate_domain="'+c.domain+'"  source_url='+c.source_url+'\n   evidence: '+c.evidence; }).join("\n\n");
  const prompt='You are validating portfolio companies for the VC '+cfg.vc_name+'. Each item gives a company name, a candidate website domain extracted from the VC profile page for that company, the source_url, and an evidence snippet from that profile page.\n\nFor EACH company return:\n- "source_url": echoed EXACTLY as given.\n- "domain": the correct canonical company website domain. Use candidate_domain if it is right; correct it ONLY if the evidence clearly shows a different official company site. Never return the VC own domain, a social/jobs/press host, or empty unless the evidence truly shows no company website.\n- "keep": true if this is a CURRENT portfolio company, INCLUDING publicly-traded ones still listed (a stock ticker, an exchange code such as SHA / HKSE / NASDAQ, or a "Public" status is NOT a reason to drop). Set false ONLY if the evidence shows it is no longer an independent active company: acquired, merged, shut down, or defunct.\n- "status": one of current | public | acquired | merged | defunct.\n\nUse ONLY the evidence provided; do not browse or use outside knowledge. Respond ONLY as compact JSON: {"companies":[{"source_url":"...","domain":"...","keep":true,"status":"..."}]}.\n\nCompanies:\n'+listed;
  const fb=chunk.map(function(c){ return {source_url:c.source_url,name:c.name,domain:c.domain,lookup_url:c.source_url}; });
  out.push({ json:{ vc_account_id:cfg.vc_account_id, vc_name:cfg.vc_name, vc_domain:cfg.vc_domain, _quarantine:false, chunk_index:Math.floor(i/CHUNK), _llm_prompt:prompt, _fallback:fb, _miner_note:note } });
}
return out.length?out:[{ json:{ vc_account_id:cfg.vc_account_id, vc_name:cfg.vc_name, vc_domain:cfg.vc_domain, _quarantine:false, chunk_index:0, _llm_prompt:'Respond ONLY as compact JSON: {"companies":[]}.', _fallback:[], _miner_note:note+" (no profiles matched)" } }];
