import { BUILD_ID, VERSION } from "../../../lib/build";

export const runtime = "edge";

export function GET() {
  return Response.json({ version: VERSION, build: BUILD_ID, deployedAt: "2026-09-01" }, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
