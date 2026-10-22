// n8n Code node: "Split page URLs"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

const out = [];
for (const it of $input.all()){ const urls = Array.isArray(it.json.page_urls)?it.json.page_urls:[];
  for (const u of urls){ if (u && typeof u === "string") out.push({ json: { url: u } }); } }
return out.length ? out : [{ json: { url: "" } }];
