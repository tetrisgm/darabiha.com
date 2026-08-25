import { readTree } from "../../../db/store";

export async function GET() {
  return Response.json(await readTree(), {
    headers: { "cache-control": "public, max-age=30, stale-while-revalidate=120" },
  });
}
