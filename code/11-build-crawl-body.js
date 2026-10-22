// n8n Code node: "Build crawl body"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

// v3.14 BATCH-ALWAYS roster fetch. (Crawl mode DELETED.)
// HISTORY in one breath: namespace-crawl fetched the firm's all-time archive (v3.12 fixed with
// directory-roster); crawl link-discovery picked ONE of N pagination links per run, a coin flip
// (v3.13 fixed with agent-enumerated page_urls -> batch); then a single-page directory (F-Prime)
// obeyed "leave page_urls empty when no pager" and fell back to crawl mode again (v3.13.4 OPEN note).
// REALIZATION: we ALWAYS know the page set — crawl_url + any observed pager pages. Batch-scrape the
// known list every time. No discovery, no crawlEntireDomain/includePaths semantics, no coin flips.
// A missed pager = deterministic miss WITH the undercount warning (vs crawl's silent random miss).
// (Standing rules: body built in CODE never {{ }} [v3.7]; no host APIs [v3.11.1]; maxAge 0 — rosters
// never ride cache [v3.12.1]; proxy auto [v3.12.2]; timeout 300000 = API max [v3.13.3].)
const j = $input.first().json;
const EXTRACT = {
  formats: [{
    type: "json",
    prompt: "This page is an investment firm's portfolio DIRECTORY (a list of portfolio companies). Extract EVERY company row/card on THIS page, including exited/acquired ones. For each: name; status EXACTLY as printed on the row, if any (e.g. Current / Exited / Merger / IPO / 'Acquired by ...' / a stock ticker — keep multiple words as printed); external_domain = the company's OWN website domain ONLY if it literally appears as a link on this page (often it does not — then leave it empty, do NOT guess); profile_url = the absolute URL of the company's detail/profile page on the firm's own site, if the row links to one. Do not extract sector filters, navigation, news items, or team members.",
    schema: { type: "object", properties: { companies: { type: "array", items: { type: "object", properties: { name: { type: "string" }, status: { type: "string" }, external_domain: { type: "string" }, profile_url: { type: "string" } } } } } }
  }, "links"],   // v3.15: links format is FREE and DETERMINISTIC — JSON extraction truncates on dense
                 // pages (F-Prime live: 37 of ~375 rows emitted, alphabetical cutoff), links never do.
  onlyMainContent: true,   // KEEP true: A2 proved the roster survives the main-content filter; false would
                           // bloat extraction input with nav/footer junk (vendor probe used false only to test render)
  waitFor: 3000,           // v3.15.1: Firecrawl's own debug verdict on the F-Prime child death — transient,
                           // no logged error, their probe succeeded with a 3s render settle. Vendor-recommended.
  maxAge: 0,
  proxy: "auto",
  timeout: 300000
};
const pageUrls = (Array.isArray(j.page_urls) ? j.page_urls : []).filter(function(u){ return typeof u === "string" && /^https?:\/\//i.test(u); });
const seen = new Set(); const urls = [];
for (const u of [ (j.crawl_url || "") ].concat(pageUrls)){
  const t = (u || "").trim(); if (!t) continue;
  const k = t.toLowerCase().replace(/\/+$/, "");
  if (seen.has(k)) continue; seen.add(k); urls.push(t);
}
const body = Object.assign({ urls: urls.slice(0, 25), maxConcurrency: 10 }, EXTRACT);   // batch/scrape: options TOP-LEVEL
const scopeNote = "roster-batch: " + body.urls.length + " explicit directory page(s)" + (pageUrls.length ? "" : " (no pager observed)");
return [{ json: { ...j, _crawl_endpoint: "https://api.firecrawl.dev/v2/batch/scrape", _crawl_scope_note: scopeNote, _crawl_body: JSON.stringify(body) } }];
