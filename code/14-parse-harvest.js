// n8n Code node: "Parse harvest"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

// ───────────────────────────────────────────────────────────────────────────
// Parse harvest — n8n Code node ("Run Once for All Items")
// Parses the LLM-harvest output (current companies only), dedups vs known +
// within-run, then builds the resolve-prompt chunks the "Claude resolve" node
// expects. So the LLM harvest does the JUDGMENT (current vs exited/acquired) and
// resolve does the FETCH/canonicalize (rebrand/redirect + fills missing names).
//
// 2026-06-04 changes (Ethan):
//   - NAME-OPTIONAL harvest: a company may arrive with name "" (domain-only
//     listings like B Capital). Carry it through; resolve fills the name.
//   - Do NOT fall back to source_url for the domain (source_url is the VC's own
//     page -> would map to vc_domain and get dropped). Domain comes from harvest.
//   - Carry {source_url, name, domain} into each chunk as `_fallback` so
//     "Parse Claude" can fall back to the harvested domain if resolve misses
//     (no more silent drops when resolve returns empty).
//   <3 net-new -> quarantine.
// 2026-06-07 changes (Ethan): ARTICLE-LINK CASE (Footwork). A company may arrive
//   with domain "" + lookup_url=<an on-page newsletter/blog article about it>.
//   Kept as a SEPARATE "lookup" track; resolve fetches the article to recover the
//   real domain. GUARDRAILS so this NEVER loosens the already-good path:
//     * Direct entries (own-site domain) take the existing path UNCHANGED — same
//       dedup, same {source_url,name,domain} shape. lookup is only the ELSE branch
//       (fills a gap; can never override or degrade a real domain).
//     * A lookup_url is accepted ONLY if its host is in CONTENT_HOSTS (known
//       newsletter/blog platforms). News/social/other links stay dropped exactly
//       as before — the model proposes, this gate decides.
//     * Lookup dedup is by full article URL (NOT by name -> avoids generic-name
//       collisions); known-domain dedup happens post-resolve in Parse Claude.
//     * Directs are chunked FIRST, lookups after, so direct-only chunks get the
//       byte-identical original resolve prompt (extended prompt only when a chunk
//       actually contains a lookup item).
// ───────────────────────────────────────────────────────────────────────────
function normalizeDomain(d){ if(!d||typeof d!=="string") return ""; return d.toLowerCase().trim().replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/[\/?#].*$/,""); }
function registrableDomain(d){ const n=normalizeDomain(d); if(!n) return ""; const p=n.split("."); if(p.length<=2) return n; const last2=p.slice(-2).join("."); const COMPOUND=["co.uk","org.uk","ac.uk","gov.uk","co.kr","com.br","com.au","co.jp","co.il","co.za","co.nz","com.mx","co.in","com.sg","com.tr","com.cn","com.hk","co.th","com.tw","com.co"]; return (COMPOUND.indexOf(last2)>-1 && p.length>=3)?p.slice(-3).join("."):last2; }
function normalizeName(name){ if(!name||typeof name!=="string") return ""; let s=name.toLowerCase().trim(); s=s.replace(/[.,]?\s+(inc|llc|ltd|limited|corp|corporation|co|gmbh|sa|ag|plc|pte|bv)\.?$/i,""); return s.replace(/[^a-z0-9]/g,""); }
function cleanUrl(u){ if(!u||typeof u!=="string") return null; let s=u.trim(); const m=s.match(/https?:\/\/[^\s)\]]+/i); if(m) s=m[0]; if(s===""||s==="/"||s.indexOf("#")===0||/^(javascript|mailto|tel):/i.test(s)) return null; if(/^https?:\/\//i.test(s)) return /^https?:\/\/[^\/\s]+\.[a-z]{2,}/i.test(s)?s:null; return /^[^\/\s]+\.[a-z]{2,}/i.test(s)?("https://"+s):null; }
const BLOCK = new Set(["firecrawl.dev","linkedin.com","twitter.com","x.com","facebook.com","instagram.com","threads.net","crunchbase.com","youtube.com","pitchbook.com","bloomberg.com","wikipedia.org","g2.com","github.com","medium.com","apps.apple.com","play.google.com","squarespace.com","squarespace-cdn.com","onetrust.com","cloudfront.net","cloudinary.com","akamaized.net"]);
// Newsletter/blog platforms a portfolio page may link a company's spotlight post to,
// instead of the company's own site. ONLY these hosts may become a lookup_url entry.
// (Extend as you encounter more.) News/other hosts stay dropped as before.
const CONTENT_HOSTS = new Set(["substack.com","medium.com","beehiiv.com","ghost.io","wordpress.com","mirror.xyz","notion.site","hashnode.dev"]);
const cfg = $('Build config').first().json;
const vcDom = registrableDomain(cfg.vc_domain);
const knownNames = new Set(cfg.known_names || []);
const knownDomains = new Set(cfg.known_domains || []);
function llmText(resp){ const r=resp||{}; let c=null;
  if(r.choices&&r.choices[0]&&r.choices[0].message) c=r.choices[0].message.content;
  if(c==null&&r.message) c=(typeof r.message.content!=="undefined")?r.message.content:r.message;
  if(c==null&&typeof r.content!=="undefined") c=r.content;
  if(c==null&&typeof r.text!=="undefined") c=r.text;
  if(c==null&&typeof r.output_text!=="undefined") c=r.output_text;
  if(Array.isArray(c)) c=c.map(function(b){return (b&&typeof b.text==="string")?b.text:(typeof b==="string"?b:"");}).join(" ");   // text blocks only; ignore tool_use/tool_result
  if(c&&typeof c==="object") c=c.text||c.content||JSON.stringify(c);
  return (typeof c==="string")?c:(c!=null?String(c):""); }
function parseCompanies(txt){ if(!txt) return []; let o=null; try{o=JSON.parse(txt);}catch(e){ const m=txt.match(/\{[\s\S]*\}/); if(m){try{o=JSON.parse(m[0]);}catch(e2){}} } if(o&&Array.isArray(o.companies)) return o.companies; if(Array.isArray(o)) return o; return []; }

// v3.12 ROSTER MODE: the crawl branch now ships the status-filtered CURRENT roster ('Crawl -> companies').
// Roster profile-page lookups ARE the population — never drop them via the scarce-directs gate.
let isRoster = false, rosterNote = "";
try { const f0 = $input.first().json || {}; isRoster = !!f0._roster; rosterNote = f0._roster_note || ""; } catch (e) {}
const seenD = new Set(knownDomains), seenLU = new Set();   // (dead seenN removed in v3.10 — name arm gone since v2)
const directs = [], lookups = [], vcLookups = []; let proposed = 0;
for (const it of $input.all()){
  for (const c of parseCompanies(llmText(it.json||{}))){
    if(!c || typeof c !== "object") continue;
    proposed++;
    const dom = registrableDomain(cleanUrl(c.domain) || c.domain || "");   // domain ONLY from harvest's domain field
    const name = c.name ? String(c.name).trim() : "";
    const n = normalizeName(name);
    if(dom && dom!==vcDom && !BLOCK.has(dom)){                             // DIRECT — existing path, UNCHANGED
      if(seenD.has(dom)) continue;                                         // dedup vs known + within-run — DOMAIN ONLY (QA#1: the name arm silently dropped same-name distinct cos, e.g. joinuplift.co vs uplift.com)
      seenD.add(dom);
      directs.push({ source_url: "https://"+dom, name: name, domain: dom });  // name may be ""
      continue;
    }
    // LOOKUP CASE (v3.8): no usable own-site domain. Accept a lookup if there is a NAME and the link is
    // (a) a content-platform article (CONTENT_HOSTS — Footwork case), OR (b) the FIRM'S OWN profile page
    // (Dawn case) — the PROMPT now forbids shape (b), but if the agent emits it anyway the resolver
    // recovers the real domains instead of the run dying as a mislabeled no_new. Full-URL keying.
    const lu = cleanUrl(c.lookup_url || "") || "";
    const luReg = registrableDomain(lu);
    if(name && lu && (CONTENT_HOSTS.has(luReg) || luReg === vcDom)){
      const luKey = lu.toLowerCase().replace(/\/+$/,"");
      if(seenLU.has(luKey)) continue;                                       // within-run dedup by full lookup URL
      seenLU.add(luKey);
      (luReg === vcDom ? vcLookups : lookups).push({ source_url: lu, name: name, domain: "", lookup_url: lu });
      continue;
    }
    // else: not an own-site domain and not a content-host article -> drop (as before)
  }
}
// v3.10: vcDom profile-page lookups are a FALLBACK for pages that exposed no real domains (Dawn inline
// case: 0 directs). In CRAWL runs the index page emits the same companies as vc-lookups while the profile
// pages emit them as directs — resolving both doubles cost for zero new rows (Parse Claude's seenD already
// deduped the output). So: use vc-lookups ONLY when directs are scarce. Article lookups are ALWAYS used.
const usableLookups = (isRoster || directs.length < 3) ? lookups.concat(vcLookups) : lookups;   // v3.12: roster lookups are first-class
const entries = directs.concat(usableLookups);   // directs first -> direct-only chunks keep the original resolve prompt
if(entries.length < 3){
  let failedPages = 0; try { failedPages = ($input.first().json || {})._failed_pages || 0; } catch(e) {}
  const healthy = proposed >= 10;   // v3 (D9): many proposed but all already known = healthy no_new (memory-layer re-runs), not a failure
  return [{ json: { vc_account_id: cfg.vc_account_id, vc_name: cfg.vc_name, vc_domain: cfg.vc_domain, _quarantine: true,
    _verdict: healthy ? "no_new" : "review",
    _reason: (healthy ? "no_new — all proposed companies already known. " : "") + "LLM harvest net-new current: "+entries.length+" (proposed by LLM: "+proposed+"; direct: "+directs.length+", lookup: "+usableLookups.length+(vcLookups.length && directs.length >= 3 ? ("; vc-profile lookups dropped as direct-dups: "+vcLookups.length) : "")+(failedPages ? ("; FAILED PAGES: "+failedPages) : "")+")"+(rosterNote ? (" | "+rosterNote) : "") } }];
}
const CHUNK = 5; const out = [];
for (let i=0;i<entries.length;i+=CHUNK){
  const chunk = entries.slice(i,i+CHUNK);
  const listed = chunk.map(function(e,j){
    if(e.lookup_url){
      return (j+1)+". "+e.source_url+"   (PROFILE/ARTICLE page about the company \""+e.name+"\" — fetch it and return THAT company's official website domain, NOT this page's host)";
    }
    return (j+1)+". "+e.source_url+(e.name?("   (listed name: "+e.name+")"):"   (no name on page)");
  }).join("\n");
  const hasLookup = chunk.some(function(e){ return !!e.lookup_url; });
  const prompt = hasLookup
    ? ("You have a web_fetch tool. For EACH url below: FETCH it (follow redirects) and read the page.\n"+
       "- If the item is a company website, return the company's real NAME and its final canonical DOMAIN after any redirect. If a listed name is given, verify/correct it from the page; if no name is given, get the name from the page.\n"+
       "- If the item is marked as a PROFILE/ARTICLE page about a named company, that url is NOT the company's site (it is the investor's own profile page for the company, or a newsletter/blog post). Read it, find the company's OWN official website linked in it, and return that company's canonical DOMAIN. You MAY fetch that one company website to confirm. Do NOT return the page's own host (e.g. the VC's domain, substack.com, medium.com). STATUS CHECK for PROFILE pages: if the profile page clearly marks the company as acquired / merged / exited / no longer active, or shows a public stock ticker (e.g. 'NASDAQ: X', '1801.HK'), it is NOT a current portfolio company — return an empty domain for that item.\n"+
       "Only fetch the urls listed (and, for an ARTICLE item, the one company website you find linked in it) — do not otherwise search the web. If a url is dead or you cannot determine a real company website, return an empty domain.\n\nURLs:\n"+listed+"\n\nReturn source_url EXACTLY as given for each. Respond ONLY as compact JSON: {\"companies\":[{\"source_url\":\"...\",\"name\":\"...\",\"domain\":\"...\"}]}.")
    : ("You have a web_fetch tool. For EACH url below: FETCH it (follow redirects) and read the page, then return the company's real NAME and its final canonical DOMAIN after any redirect. If a listed name is given, verify/correct it from the page; if no name is given, get the name from the page. Only fetch the urls listed — do not fetch anything else. If a url is dead or clearly not a real company website, return an empty domain.\n\nURLs:\n"+listed+"\n\nReturn source_url EXACTLY as given for each. Respond ONLY as compact JSON: {\"companies\":[{\"source_url\":\"...\",\"name\":\"...\",\"domain\":\"...\"}]}.");
  out.push({ json: { vc_account_id: cfg.vc_account_id, vc_name: cfg.vc_name, vc_domain: cfg.vc_domain, _quarantine: false, chunk_index: Math.floor(i/CHUNK), _llm_prompt: prompt, _fallback: chunk } });
}
return out;
