// n8n Code node: "Fingerprint page source"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

// Fingerprint page source — deterministic pre-scan (free, no Firecrawl credits).  [v3]
// Fetches the located portfolio page's RAW HTML (+ up to 5 same-site script bundles, smart-ranked),
// regex-scans backend-API signatures, measures embedded state blobs (size = detection, not conclusion),
// and — when WordPress is detected — fetches the /wp-json/ ROOT to list CUSTOM NAMESPACES.
// (#3348 lesson: insight/v1/get-company-content carried the domains+status that wp/v2 lacked,
//  and the v2 scan returned found:false on a WordPress site because api.w.org was not a signature.)
const c = $input.first().json;
const idx = c.index_url || (c.vc_domain ? ("https://" + String(c.vc_domain).replace(/^https?:\/\//, "")) : "");
const out = { ...c, _fingerprint: { found: false, http_status: null, summary: "", candidates: [] } };
const seen = new Set();
function push(sig, value, src, excerpt) {
  const k = sig + "|" + String(value).slice(0, 120);
  if (seen.has(k)) return; seen.add(k);
  out._fingerprint.candidates.push({ sig: sig, value: String(value).slice(0, 200), src: src, excerpt: String(excerpt || "").replace(/\s+/g, " ").slice(0, 220) });
}
function scan(text, src) {
  const RX = [
    ["algolia_appId",   /["']?(?:applicationId|appId|x-algolia-application-id)["']?\s*[:=]\s*["']([A-Z0-9]{8,14})["']/g],
    ["algolia_apiKey",  /["']?(?:apiKey|searchApiKey|searchKey|x-algolia-api-key)["']?\s*[:=]\s*["']([a-f0-9]{16,64})["']/gi],
    ["algolia_index",   /["']?indexName["']?\s*[:=]\s*["']([A-Za-z0-9_\-\.]{3,60})["']/g],
    ["algolia_host",    /https?:\/\/[A-Z0-9]{6,14}(?:-dsn)?\.algolia(?:\.net|net\.com)[^"'\s]*/gi],
    ["typesense",       /x-typesense-api-key|typesense/gi],
    ["meilisearch",     /meilisearch/gi],
    ["graphql_endpoint",/["'](https?:\/\/[^"']{4,160}graphql[^"']{0,40})["']/gi],
    ["api_path",        /["'](\/(?:api|wp-json|_next\/data|graphql)[^"']{0,120})["']/g],
    ["wp_rest_root",    /api\.w\.org/g],
    ["wp_admin_ajax",   /admin-ajax\.php/g],
    ["next_data",       /__NEXT_DATA__/g],
    ["next_buildId",    /"buildId"\s*:\s*"([^"]+)"/g],
    ["nuxt",            /__NUXT_DATA__|__NUXT__|_payload\.json/g],
    ["remix",           /__remixContext|\?_data=/g],
    ["sveltekit",       /__sveltekit|\/__data\.json/g],
    ["redux_state",     /__INITIAL_STATE__|__PRELOADED_STATE__/g],
    ["gatsby",          /page-data\.json|___gatsby/g],
    ["apollo_state",    /__APOLLO_STATE__/g],
    ["airtable",        /airtable\.com\/(?:embed|shr)[A-Za-z0-9\/]*/g],
    ["contentful",      /cdn\.contentful\.com[^"'\s]*/g],
    ["sanity",          /[a-z0-9]+\.api(?:cdn)?\.sanity\.io[^"'\s]*/g],
    ["prismic",         /[a-z0-9-]+\.(?:cdn\.)?prismic\.io[^"'\s]*/g],
    ["webflow",         /assets(?:-global)?\.website-files\.com|wf-collection/g],
    ["hubdb",           /hubdb|hs-sites/gi]
  ];
  for (const pair of RX) {
    const sig = pair[0], rx = pair[1];
    let m, count = 0;
    while ((m = rx.exec(text)) && count < 4) {
      const val = m[1] !== undefined ? m[1] : m[0];
      count++;
      push(sig, val, src, text.slice(Math.max(0, m.index - 120), m.index + 160));
      if (out._fingerprint.candidates.length >= 32) return;
    }
  }
}
function blobStats(html, marker) {
  const i = html.indexOf(marker); if (i < 0) return null;
  const s = html.indexOf(">", i); const e = html.indexOf("</script>", s);
  if (s < 0 || e < 0 || e <= s) return null;
  const blob = html.slice(s + 1, e);
  return { bytes: blob.length, nameKeys: (blob.match(/"name"\s*:/g) || []).length };
}
try {
  if (idx) {
    const r = await this.helpers.httpRequest({ method: "GET", url: idx, timeout: 20000, json: false, returnFullResponse: true, ignoreHttpStatusErrors: true, headers: { "user-agent": "Mozilla/5.0 (compatible; PortcoFinder/1.0)" } });
    out._fingerprint.http_status = r.statusCode || null;
    const html = String(r.body || "").slice(0, 2000000);
    scan(html, "page");
    // Embedded state blobs: report SIZE so the small-list vs giant-blob split is mechanical.
    for (const marker of ["__NEXT_DATA__", "__NUXT_DATA__", "__APOLLO_STATE__", "__PRELOADED_STATE__"]) {
      const st = blobStats(html, marker);
      if (st) push("embedded_blob", marker + " ~" + Math.round(st.bytes / 1024) + "KB, " + st.nameKeys + " name-keys", "page", "");
    }
    // WORDPRESS: fetch the REST ROOT and list custom namespaces + company-ish routes (#3348:
    // custom routes like insight/v1/get-company-content expose fields the generic wp/v2 API lacks).
    if (/api\.w\.org|\/wp-json\//.test(html)) {
      try {
        const origin = idx.replace(/^(https?:\/\/[^\/]+).*/, "$1");
        const rootRaw = String(await this.helpers.httpRequest({ method: "GET", url: origin + "/wp-json/", timeout: 20000, json: false, ignoreHttpStatusErrors: true })).slice(0, 2000000).replace(/\\\//g, "/");
        const ns = rootRaw.match(/"namespaces":\s*\[([^\]]*)\]/);
        if (ns) push("wp_namespaces", ns[1].replace(/["\\]/g, "").slice(0, 220), "wp-json root", "");
        let rm; const rrx = /"(\/[a-zA-Z0-9_\-\/]*(?:compan|portfolio|invest|team|search|filter)[a-zA-Z0-9_\-\/]*)"/gi;
        let rc = 0;
        while ((rm = rrx.exec(rootRaw)) && rc < 8) {
          if (rm[1].indexOf("/wp/v2") === 0) continue;
          rc++; push("wp_custom_route", rm[1], "wp-json root", "");
        }
      } catch (e) { /* root probe failed; not fatal */ }
    }
    // SPA bundles: rank candidates (main/app/index/runtime/search/portfolio first), fetch up to 5.
    const all = []; let sm; const srx = /<script[^>]+src=["']([^"']+)["']/gi;
    while ((sm = srx.exec(html)) && all.length < 25) {
      let u = sm[1];
      if (u.startsWith("//")) u = "https:" + u;
      else if (u.startsWith("/")) u = idx.replace(/^(https?:\/\/[^\/]+).*/, "$1") + u;
      if (!/^https?:\/\//.test(u)) continue;
      if (/(googletagmanager|google-analytics|gtag|hotjar|segment|intercom|hubspot|facebook|linkedin|clarity|cookiebot|onetrust|doubleclick|recaptcha)/i.test(u)) continue;
      all.push(u);
    }
    all.sort(function(a, b){ return ((/(main|app|index|runtime|search|portfolio|chunk)/i.test(b)) ? 1 : 0) - ((/(main|app|index|runtime|search|portfolio|chunk)/i.test(a)) ? 1 : 0); });
    for (const u of all.slice(0, 5)) {
      if (out._fingerprint.candidates.length >= 32) break;
      try {
        const rb = await this.helpers.httpRequest({ method: "GET", url: u, timeout: 20000, json: false, ignoreHttpStatusErrors: true });
        scan(String(rb || "").slice(0, 2000000), u.slice(0, 120));
      } catch (e) { /* skip bundle */ }
    }
  }
} catch (e) {
  out._fingerprint.summary = "scan failed: " + String((e && e.message) || e).slice(0, 200);
  return [{ json: out }];
}
const statusLine = (out._fingerprint.http_status && out._fingerprint.http_status >= 400)
  ? ("PAGE FETCH RETURNED HTTP " + out._fingerprint.http_status + " — scan UNRELIABLE (bot wall?); do NOT treat 'no signatures' as evidence of no API.\n") : "";
if (out._fingerprint.candidates.length) {
  out._fingerprint.found = true;
  out._fingerprint.summary = (statusLine + out._fingerprint.candidates.map(function(cd){ return "- " + cd.sig + ": " + cd.value + "  [" + cd.src + "]" + (cd.excerpt ? (" ..." + cd.excerpt) : ""); }).join("\n")).slice(0, 6000);
} else {
  out._fingerprint.summary = statusLine.trim();
}
return [{ json: out }];
