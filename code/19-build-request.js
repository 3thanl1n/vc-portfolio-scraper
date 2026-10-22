// n8n Code node: "Build request"
// Read-only copy extracted from workflow/vc-portfolio-scraper.n8n.json. The workflow file is the source of truth.


const sd = $getWorkflowStaticData('global');
const S = (sd.runs || {})[$execution.id] || { messages: [] };
const tools = [
  { type: "code_execution_20260120", name: "code_execution" },
  {
    name: "http_request",
    description: "Make an HTTP request and return the response. Call this from your Python code — it is an ASYNC function: await it, and use asyncio.gather to run up to ~75 calls concurrently in one batch (one batch = one round trip). Input: {method (default GET), url, headers (object), query (object of querystring params), body (string for POST)}. Returns a JSON STRING: {\"status\":number,\"headers\":{selected response headers, e.g. x-wp-total, x-wp-totalpages, link, retry-after},\"body\":<parsed JSON or raw text>}. Use it to read pages you discover, to paginate APIs, and to fetch per-item detail endpoints in concurrent batches.",
    input_schema: { type: "object", properties: {
      method:  { type: "string" },
      url:     { type: "string" },
      headers: { type: "object" },
      query:   { type: "object" },
      body:    { type: "string" }
    }, required: ["url"] },
    allowed_callers: ["code_execution_20260120"]
  }
];
// cache_control (top-level) = Anthropic automatic prompt caching: the API moves the breakpoint to the
// last cacheable block as the conversation grows. Reads bill at 0.1x. (#3348 ran fully uncached.)
const body = { model: "claude-opus-4-8", max_tokens: 32000, tools: tools, messages: S.messages, cache_control: { type: "ephemeral" } };
if (S.container) body.container = S.container;
return [{ json: { requestBody: body } }];
