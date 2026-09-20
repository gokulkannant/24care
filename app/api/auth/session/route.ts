import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearSessionCookies, setSessionCookies } from "@/lib/auth-cookies";
import { rotateSession, verifyAccessToken, type CustomAuthUser } from "@/lib/custom-auth";
import { supabaseServerRestRequest } from "@/lib/supabase-rest";
import type { AppRole } from "@/lib/server-session";

interface Profile {
  id: string;
  display_name: string;
  role: AppRole;
}

async function toClientUser(user: CustomAuthUser) {
  const profiles = await supabaseServerRestRequest<Profile[]>(`/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,display_name,role`);
  const profile = profiles[0];
  return { id: user.id, name: profile?.display_name ?? user.name, role: profile?.role ?? user.role, email: user.email };
}

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("care_access_token")?.value;
  const refreshToken = cookieStore.get("care_refresh_token")?.value;
  let user = accessToken ? await verifyAccessToken(accessToken) : null;
  let rotated: { accessToken: string; refreshToken: string } | null = null;

  try {
    if (!user && refreshToken) {
      rotated = await rotateSession(refreshToken);
      if (rotated) user = await verifyAccessToken(rotated.accessToken);
    }
    if (!user) {
      const response = NextResponse.json({ user: null });
      clearSessionCookies(response);
      return response;
    }
    const response = NextResponse.json({ user: await toClientUser(user) });
    if (rotated) setSessionCookies(response, rotated);
    return response;
  } catch {
    const response = NextResponse.json({ user: null });
    clearSessionCookies(response);
    return response;
  }
}
