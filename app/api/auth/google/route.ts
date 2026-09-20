import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  return `${forwardedProto ?? url.protocol.replace(":", "")}://${forwardedHost ?? url.host}`;
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Google OAuth is not configured." }, { status: 503 });

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(32).toString("base64url");
  const callback = `${requestOrigin(request)}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  const secure = process.env.NODE_ENV === "production";
  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  response.cookies.set("care_google_pkce", verifier, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 600 });
  response.cookies.set("care_google_state", state, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 600 });
  return response;
}
