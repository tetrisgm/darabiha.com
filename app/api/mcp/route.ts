/** The hosted MCP endpoint (streamable HTTP, JSON responses).
 *
 * Hand-rolled JSON-RPC rather than mcp-handler: that package targets Node
 * servers and this is a Cloudflare Worker. The surface an MCP client needs
 * for tools is small - initialize, the initialized notification, tools/list,
 * tools/call, ping - and implementing it directly keeps the Worker bundle
 * lean and the behavior inspectable. Auth follows the mcp-kit chain: a
 * tokenless call gets 401 + WWW-Authenticate pointing at the RFC 9728
 * document, which names this origin as the OAuth authorization server.
 */

import { publicOrigin } from "../../../lib/archive-config";
import { resolveAgentToken } from "../../../lib/mcp-oauth";
import { findMcpTool, MCP_TOOLS } from "../../../lib/mcp-tools";
import { archiveName } from "../../../lib/archive-config";
import { readTree } from "../../../db/store";

export const runtime = "edge";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-protocol-version, mcp-session-id",
};

const unauthorized = () => new Response(JSON.stringify({ error: "unauthorized" }), {
  status: 401,
  headers: {
    ...cors,
    "content-type": "application/json",
    "www-authenticate": `Bearer resource_metadata="${publicOrigin()}/.well-known/oauth-protected-resource"`,
  },
});

const rpcResponse = (id: unknown, payload: { result?: unknown; error?: { code: number; message: string } }) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, ...payload }), { headers: { ...cors, "content-type": "application/json" } });

export async function POST(request: Request) {
  const identity = await resolveAgentToken(request.headers.get("authorization"));
  if (!identity) return unauthorized();

  let message: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    message = await request.json();
  } catch {
    return rpcResponse(null, { error: { code: -32700, message: "Parse error" } });
  }
  const { id, method, params } = message;

  // notifications carry no id and expect no body
  if (id === undefined && typeof method === "string") return new Response(null, { status: 202, headers: cors });

  switch (method) {
    case "initialize": {
      const requested = typeof params?.protocolVersion === "string" ? params.protocolVersion : "";
      return rpcResponse(id, {
        result: {
          protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: `${archiveName()} family archive`, version: "1.0.0" },
          instructions: `Read-only access to the ${archiveName()} family archive as ${identity.memberEmail}. Start with tree_summary; find_person returns the ids the other tools take.`,
        },
      });
    }
    case "ping":
      return rpcResponse(id, { result: {} });
    case "tools/list":
      return rpcResponse(id, { result: { tools: MCP_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema, annotations: { readOnlyHint: true } })) } });
    case "tools/call": {
      const name = typeof params?.name === "string" ? params.name : "";
      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const tool = findMcpTool(name);
        if (!tool) throw new Error(`Unknown tool: ${name}`);
        const text = tool.handler(args, await readTree());
        return rpcResponse(id, { result: { content: [{ type: "text", text }], isError: false } });
      } catch (error) {
        // tool-level failures are results, not protocol errors, so the model can read them
        return rpcResponse(id, { result: { content: [{ type: "text", text: error instanceof Error ? error.message : "The tool call failed." }], isError: true } });
      }
    }
    default:
      return rpcResponse(id, { error: { code: -32601, message: `Method not found: ${String(method)}` } });
  }
}

// no server-initiated stream in v1; spec-compliant clients treat 405 as "no SSE"
export const GET = () => new Response(null, { status: 405, headers: cors });
export const OPTIONS = () => new Response(null, { status: 204, headers: cors });
