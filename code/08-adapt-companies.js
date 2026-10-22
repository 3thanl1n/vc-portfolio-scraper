// n8n Code node: "Adapt companies"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.

const c = Array.isArray($json.companies) ? $json.companies : [];
return [{ json: { content: JSON.stringify({ companies: c }),
  _strategy: $json.strategy||"", _agent_notes: $json._agent_notes||"", _agent_tools: $json._agent_tools||[] } }];
