import type { NextResponse } from "next/server";

const secure = process.env.NODE_ENV === "production";

export function setSessionCookies(response: NextResponse, session: { accessToken: string; refreshToken: string }) {
  response.cookies.set("care_access_token", session.accessToken, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 });
  response.cookies.set("care_refresh_token", session.refreshToken, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.delete("care_access_token");
  response.cookies.delete("care_refresh_token");
}
