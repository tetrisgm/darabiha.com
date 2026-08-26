import { requireAdmin } from "../../authz";
import { getSiteVisibility, setSiteVisibility } from "../../../db/store";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return Response.json({ visibility: await getSiteVisibility() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null) as { visibility?: string } | null;
  const visibility = body?.visibility === "members" ? "members" as const : body?.visibility === "public" ? "public" as const : null;
  if (!visibility) return Response.json({ error: "invalid_visibility" }, { status: 400 });
  await setSiteVisibility(visibility, auth.user.email);
  return Response.json({ visibility });
}
