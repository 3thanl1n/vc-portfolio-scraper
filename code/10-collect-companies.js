// n8n Code node: "Collect companies"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

let all = []; let failed = 0;
for (const it of $input.all()){ const j=it.json||{}; const resp=(j.body!==undefined&&j.body!==null)?j.body:j;
  const data=(resp&&resp.data)||{}; const ex=data.json||{}; const cos=Array.isArray(ex.companies)?ex.companies:[];
  if(!Array.isArray(ex.companies)) failed++;      // v3 (B2): a page that returned no extraction is a FAILURE to count, not to hide
  for (const c of cos){ if (c&&typeof c==="object") all.push(c); } }
return [{ json: { content: JSON.stringify({ companies: all }), _strategy:"paginated", _pages: $input.all().length, _failed_pages: failed } }];
