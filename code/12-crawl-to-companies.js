// n8n Code node: "Crawl → companies"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

// v3.12 ROSTER-FIRST: the crawl branch scrapes ONLY directory pages; each page's extraction is roster
// rows {name, status, external_domain, profile_url}. This node is the DETERMINISTIC population gate:
//   merge duplicate cards -> drop non-current statuses (auditable token list) -> emit Parse-harvest shape:
//   external_domain -> direct candidate; else profile_url -> vcDom lookup (first-class under _roster).
// Name-only rows (logo grids) are counted and dropped — a16z policy: review, never name-search.
function s(v){ if (v == null) return ""; if (Array.isArray(v)) return v.join(" "); return String(v); }
const DROP = /exit|acquir|merger|merged|prior|alumni|former|divest|realized|legacy|graduat|\bpast\b/i;  // not-current tokens (PE vocab incl. Realized/Legacy/Past; v3.13.4: stock-exchange tickers — F-Prime prints "NASDAQ: TOST" as the status for IPO'd cos, which carried zero previous DROP tokens). KEEP (current/active) still overrides.
const KEEP = /current|active/i;                                                // explicit current wins over co-tags (Klaviyo: "IPO Current")
let rows = []; let status = ""; let respN = 0; let pageN = 0; const pageUrls = []; const pageLinks = [];
for (const it of $input.all()){
  const j = it.json || {};
  const resp = (j.body !== undefined && j.body !== null) ? j.body : j;
  respN++;
  if (resp.status) status = resp.status;
  const pages = Array.isArray(resp.data) ? resp.data : [];
  pageN += pages.length;
  for (const p of pages){
    try { const u = ((p||{}).metadata||{}).url || ((p||{}).metadata||{}).sourceURL || ""; if (u) pageUrls.push(u); } catch (e) {}
    const ex = (p && p.json) || {};
    const cos = Array.isArray(ex.companies) ? ex.companies : [];
    for (const c of cos){ if (c && typeof c === "object") rows.push(c); }
    if (Array.isArray(p && p.links)) for (const L of p.links) pageLinks.push(L);
  }
}
// pass 1: merge duplicate cards (Webflow renders each company 2-3x per page; pages can re-list)
const merged = new Map();
for (const c of rows){
  const name = s(c.name).trim(), st = s(c.status).trim();
  const ext = s(c.external_domain || c.domain).trim(), prof = s(c.profile_url || c.lookup_url).trim();
  if (!name && !ext && !prof) continue;
  const key = (prof || ext || name).toLowerCase().replace(/\/+$/, "");
  const m = merged.get(key) || { name: "", st: "", ext: "", prof: "" };
  if (name.length > m.name.length) m.name = name;
  if (st && m.st.toLowerCase().indexOf(st.toLowerCase()) === -1) m.st = (m.st ? m.st + " " : "") + st;  // union of statuses across cards
  if (!m.ext) m.ext = ext;
  if (!m.prof) m.prof = prof;
  merged.set(key, m);
}
// pass 1.5 (v3.15 LINKS SAFETY NET): JSON extraction truncates on dense pages (F-Prime live:
// 37/~375 rows, alphabetical cutoff) — the free `links` format never truncates. Add profile links
// the extraction missed: same registrable host as the roster page, path matching the agent's
// path_hint, not already covered. Status unknown -> KEPT (fail-open); the resolve prompt now reads
// each profile page's own status and empties exited/ticker'd companies (it fetches the page anyway).
function slugName(u){ try { const seg=(u.replace(/[?#].*$/,"").replace(/\/+$/,"").split("/").pop()||""); return seg.split("-").map(function(w){return w? w.charAt(0).toUpperCase()+w.slice(1):w;}).join(" ").trim(); } catch(e){ return ""; } }
let linksAdded = 0;
const hint = (function(){ let h=""; try { h=String($('Build crawl body').first().json.path_hint||"").trim(); } catch(e){} return (h && h.length>2) ? h.toLowerCase() : ""; })();
if (hint && pageLinks.length){
  const rosterHost = (function(){ try { const m=(pageUrls[0]||"").toLowerCase().match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/); return m? m[1].replace(/^www\./,"") : ""; } catch(e){ return ""; } })();
  for (const L of pageLinks){
    const t=(typeof L==="string"?L:"").trim(); if(!t) continue;
    const low=t.toLowerCase();
    const hm=low.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/); if(!hm) continue;
    const host=hm[1].replace(/^www\./,"");
    if (rosterHost && host!==rosterHost) continue;                 // firm's own profile pages only
    if (low.indexOf(hint)===-1) continue;                          // must match the profile-path prefix
    const key=low.replace(/[?#].*$/,"").replace(/\/+$/,"");
    if (key.endsWith(hint.replace(/\/+$/,""))) continue;           // skip the bare /company/ index itself
    if (merged.has(key)) continue;                                 // already covered by extraction
    const nm=slugName(t); if(!nm) continue;
    merged.set(key, { name:nm, st:"", ext:"", prof:t.replace(/[?#].*$/,"") });
    linksAdded++;
  }
}
// pass 2: status filter -> Parse-harvest contract
const companies = []; let droppedStatus = 0, nameOnly = 0;
for (const m of merged.values()){
  if (m.st && DROP.test(m.st) && !KEEP.test(m.st)) { droppedStatus++; continue; }
  if (m.ext) { companies.push({ name: m.name, domain: m.ext, lookup_url: m.prof || "" }); continue; }
  if (m.prof) { companies.push({ name: m.name, domain: "", lookup_url: m.prof }); continue; }
  nameOnly++;
}
let est = 0; try { est = Number($('Build crawl body').first().json.estimated_count) || 0; } catch (e) {}
const undercount = est > 0 && (companies.length + droppedStatus) < Math.ceil(est * 0.5);
const note = "roster: crawl_status=" + (status || "?") + ", pages=" + pageN + ", rows=" + rows.length + ", links_added=" + linksAdded + ", unique=" + merged.size +
  ", kept=" + companies.length + ", dropped_status=" + droppedStatus + ", name_only=" + nameOnly +
  (est ? (", estimated=" + est) : "") +
  (undercount ? " | WARNING roster_undercount <50% of estimate (JS load-more directory? pagination not discovered?)" : "");
return [{ json: { content: JSON.stringify({ companies: companies }), _strategy: "crawl", _roster: true, _roster_note: note,
  _crawl_responses: respN, _roster_pages: pageN, _roster_page_urls: pageUrls, _roster_rows: rows.length, _roster_kept: companies.length,
  _roster_dropped_status: droppedStatus, _roster_name_only: nameOnly, _partial: (status !== "completed") } }];
