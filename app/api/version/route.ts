import { BUILD_ID } from "../../../lib/build";

export const runtime = "edge";

export function GET() {
  return Response.json({ build: BUILD_ID, deployedAt: "2026-08-25" }, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
