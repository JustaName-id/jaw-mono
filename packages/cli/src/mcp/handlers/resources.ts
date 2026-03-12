import { type McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

const DOCS_BASE = "https://docs.jaw.id/api-reference";

async function fetchDocs(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch docs: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  // Strip HTML tags for a readable text representation.
  // MCP resources are consumed by LLMs, so plain text is ideal.
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function registerResources(server: McpServer): void {
  // Overview of all RPC methods
  server.resource(
    "api-reference",
    "jaw://api-reference",
    {
      description:
        "JAW.id API reference — lists all supported RPC methods with descriptions. " +
        "Read this before using the jaw_rpc tool to understand available methods.",
      mimeType: "text/plain",
    },
    async () => ({
      contents: [
        {
          uri: "jaw://api-reference",
          mimeType: "text/plain",
          text: await fetchDocs(DOCS_BASE),
        },
      ],
    }),
  );

  // Per-method documentation with parameter details
  server.resource(
    "api-reference-method",
    new ResourceTemplate("jaw://api-reference/{method}", { list: undefined }),
    {
      description:
        "Detailed documentation for a specific RPC method including parameters, " +
        "request/response format, and examples. Use the method name from the " +
        "api-reference overview (e.g. wallet_sendCalls, personal_sign).",
      mimeType: "text/plain",
    },
    async (uri, variables) => {
      const method = String(variables.method);

      // Validate method name to prevent path traversal (e.g. ../../admin)
      if (!/^[\w_]+$/.test(method)) {
        throw new Error(
          `Invalid method name: "${method}". Expected an RPC method like wallet_sendCalls.`,
        );
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: await fetchDocs(`${DOCS_BASE}/${method}`),
          },
        ],
      };
    },
  );
}