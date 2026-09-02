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
import { findMcpWriteTool, MCP_WRITE_TOOLS } from "../../../lib/mcp-write-tools";
import { archiveName } from "../../../lib/archive-config";
import { listAgentProposals, readTree, submitAgentProposal } from "../../../db/store";

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
    case "tools/list": {
      const tools = MCP_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema, annotations: { readOnlyHint: true } }));
      // write tools exist only for tokens approved with the propose scope
      if (identity.scope === "propose") {
        tools.push(...MCP_WRITE_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema, annotations: { readOnlyHint: false } })));
        tools.push({
          name: "list_my_proposals",
          description: "The proposals this connection has filed, with their review status.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true },
        });
      }
      return rpcResponse(id, { result: { tools } });
    }
    case "tools/call": {
      const name = typeof params?.name === "string" ? params.name : "";
      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const readTool = findMcpTool(name);
        if (readTool) {
          const text = readTool.handler(args, await readTree());
          return rpcResponse(id, { result: { content: [{ type: "text", text }], isError: false } });
        }
        const writeTool = findMcpWriteTool(name);
        // authorization check runs before the handler, never after
        if ((writeTool || name === "list_my_proposals") && identity.scope !== "propose") {
          throw new Error("This connection was approved for reading only. Reconnect and request the propose scope to file proposals.");
        }
        if (writeTool) {
          const { proposal, note } = writeTool.build(args, await readTree());
          const proposalId = await submitAgentProposal(proposal, identity.memberEmail, identity.clientName, note);
          return rpcResponse(id, { result: { content: [{ type: "text", text: `Filed for family review (proposal ${proposalId}): ${proposal.summary}. Nothing changes until an editor applies it; check its status with list_my_proposals.` }], isError: false } });
        }
        if (name === "list_my_proposals") {
          const proposals = await listAgentProposals({ submittedBy: identity.memberEmail });
          const text = proposals.length
            ? proposals.map((entry) => `- [${entry.status}] ${entry.summary} (${entry.id}, filed ${entry.createdAt.slice(0, 10)})`).join("\n")
            : "No proposals filed from this member yet.";
          return rpcResponse(id, { result: { content: [{ type: "text", text }], isError: false } });
        }
        throw new Error(`Unknown tool: ${name}`);
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
