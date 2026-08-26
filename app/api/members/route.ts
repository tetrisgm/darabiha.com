import { requireAdmin } from "../../authz";
import { listMembers, removeMember, upsertMember } from "../../../db/store";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return Response.json({ members: await listMembers() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null) as { action?: string; email?: string; role?: string } | null;
  const email = (body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "invalid_email" }, { status: 400 });

  const members = await listMembers();
  const target = members.find((member) => member.email === email);
  const lastAdmin = target?.role === "admin" && members.filter((member) => member.role === "admin").length === 1;

  if (body?.action === "remove") {
    if (!target) return Response.json({ error: "not_a_member" }, { status: 404 });
    if (lastAdmin) return Response.json({ error: "last_admin" }, { status: 400 });
    await removeMember(email, auth.user.email);
  } else if (body?.action === "set") {
    const role = body.role === "admin" ? "admin" as const : body.role === "editor" ? "editor" as const : null;
    if (!role) return Response.json({ error: "invalid_role" }, { status: 400 });
    if (lastAdmin && role !== "admin") return Response.json({ error: "last_admin" }, { status: 400 });
    await upsertMember(email, role, auth.user.email);
  } else {
    return Response.json({ error: "unknown_action" }, { status: 400 });
  }
  return Response.json({ members: await listMembers() });
}
