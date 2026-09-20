import { cookies } from "next/headers";
import { getDemoUser, getDemoUserForRole, portalRoles, type PortalRole } from "@/lib/demo-auth";

const sessionCookie = "care_demo_user";

export async function GET() {
  const cookieStore = await cookies();
  const user = getDemoUser(cookieStore.get(sessionCookie)?.value);
  return Response.json({ mode: "demo_only", user });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { role?: unknown };
  const role = body.role;
  if (typeof role !== "string" || !portalRoles.includes(role as PortalRole)) {
    return Response.json({ error: "A supported demo role is required." }, { status: 400 });
  }

  const user = getDemoUserForRole(role as PortalRole);
  const response = Response.json({ mode: "demo_only", user });
  response.headers.append(
    "Set-Cookie",
    `${sessionCookie}=${user.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`,
  );
  return response;
}

export async function DELETE() {
  const response = Response.json({ mode: "demo_only", user: null });
  response.headers.append(
    "Set-Cookie",
    `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
  return response;
}
