import { BUILD_ID, VERSION } from "../../../lib/build";

export const runtime = "edge";

export function GET() {
  return Response.json({ version: VERSION, build: BUILD_ID, deployedAt: "2026-08-26" }, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
