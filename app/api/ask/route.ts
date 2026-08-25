import OpenAI from "openai";
import { readTree } from "../../../db/store";

export const runtime = "edge";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "openai_not_configured" }, { status: 503 });
  const body = await request.json() as { message?: unknown };
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
  if (!message) return Response.json({ error: "empty_message" }, { status: 400 });
  const tree = await readTree();
  try {
    const response = await new OpenAI({ apiKey }).responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4",
      instructions: "You answer questions about the public Darabiha family archive. Use only the supplied tree data. If a fact is absent, say it is not recorded. Never invent relationships, dates, places, or biographies. Do not propose or perform changes.",
      input: `Question: ${message}\n\nTree data:\n${JSON.stringify(tree)}`,
      store: false,
    });
    return Response.json({ reply: response.output_text.trim() || "That detail is not recorded in the archive." });
  } catch (error) {
    console.warn("Public archive question failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "agent_failed" }, { status: 502 });
  }
}
