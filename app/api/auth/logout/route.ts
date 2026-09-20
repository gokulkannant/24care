import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/auth-cookies";
import { revokeSession } from "@/lib/custom-auth";

export async function POST() {
  const refreshToken = (await cookies()).get("care_refresh_token")?.value;
  if (refreshToken) await revokeSession(refreshToken).catch(() => undefined);
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}
