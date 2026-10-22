// n8n Code node: "Build profile batch body"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

// Build profile batch body (v3.16) — Run Once for All Items.
// The roster's lookups are profile pages (F-Prime-style) that hold each company's real external domain
// ONLY on the profile, not on the directory. The old 'Claude resolve' web_fetched all ~241 of them ->
// Anthropic web_fetch max_uses(12)/too_many_requests starvation (live: ~115/241, run-to-run variance).
// Instead: batch-scrape the profile pages with Firecrawl (proxy-rotated, no per-call fetch cap) and mine
// domain+status deterministically in 'Profiles → domains'. Body conventions mirror 'Build crawl body':
// CODE-built (never {{ }}), no host APIs, maxAge 0, proxy auto, timeout = API max. Reuses the
// _crawl_endpoint/_crawl_body field names so 'Profiles submit (det)' is a verbatim clone of 'Crawl submit (det)'.
const seen = new Set(); const urls = [];
for (const it of $('Parse harvest').all()){
  const arr = (it.json && it.json._fallback) ? it.json._fallback : [];
  for (const e of arr){
    if (!e || !e.lookup_url) continue;                      // directs already carry a domain; only profile/article pages need scraping
    const t = String(e.lookup_url).trim(); if (!t) continue;
    const clean = t.replace(/[?#].*$/, "");
    const k = clean.toLowerCase().replace(/\/+$/, "");
    if (seen.has(k)) continue; seen.add(k); urls.push(clean);
  }
}
const body = {
  urls: urls,
  maxConcurrency: 10,
  formats: ["markdown", "links"],   // mine the domain from links + status from markdown; no JSON extraction (cheaper, never truncates)
  onlyMainContent: true,
  maxAge: 0,
  proxy: "auto",
  timeout: 300000
};
return [{ json: {
  _crawl_endpoint: "https://api.firecrawl.dev/v2/batch/scrape",
  _crawl_body: JSON.stringify(body),
  _profile_count: urls.length,
  _profile_note: "profile-batch: " + urls.length + " profile page(s)" + (urls.length ? "" : " | WARNING 0 lookups — batch submit will error (firm yielded only directs; route inline instead)")
} }];
