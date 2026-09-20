import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { issueSession, type CustomAuthUser } from "@/lib/custom-auth";
import { setSessionCookies } from "@/lib/auth-cookies";
import { supabaseServerRestRequest } from "@/lib/supabase-rest";
import type { AppRole } from "@/lib/server-session";

interface GoogleProfile {
  sub: string;
  email?: string;
  verified_email?: boolean;
  name?: string;
  picture?: string;
}

interface AppUserRow {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: AppRole;
  google_subject: string | null;
}

function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  return `${forwardedProto ?? url.protocol.replace(":", "")}://${forwardedHost ?? url.host}`;
}

function failureRedirect(origin: string, reason = "google") {
  return NextResponse.redirect(new URL(`/?auth_error=${reason}`, origin));
}

async function findOrCreateUser(profile: GoogleProfile): Promise<CustomAuthUser> {
  const email = profile.email?.trim().toLowerCase();
  if (!email || profile.verified_email === false) throw new Error("Google did not provide a verified email address.");

  const subject = encodeURIComponent(profile.sub);
  const emailFilter = encodeURIComponent(email);
  let users = await supabaseServerRestRequest<AppUserRow[]>(`/app_user?google_subject=eq.${subject}&select=id,email,display_name,avatar_url,role,google_subject`);
  if (!users[0]) users = await supabaseServerRestRequest<AppUserRow[]>(`/app_user?email=eq.${emailFilter}&select=id,email,display_name,avatar_url,role,google_subject`);

  const now = new Date().toISOString();
  let user = users[0];
  if (user) {
    await supabaseServerRestRequest(`/app_user?id=eq.${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      body: { email, display_name: profile.name?.trim() || user.display_name, avatar_url: profile.picture ?? user.avatar_url, google_subject: profile.sub, last_login_at: now, updated_at: now },
    });
    user = { ...user, email, display_name: profile.name?.trim() || user.display_name, avatar_url: profile.picture ?? user.avatar_url, google_subject: profile.sub };
  } else {
    const id = crypto.randomUUID();
    const created = await supabaseServerRestRequest<AppUserRow[]>("/app_user", {
      method: "POST",
      prefer: "return=representation",
      body: [{ id, email, display_name: profile.name?.trim() || email.split("@")[0], avatar_url: profile.picture ?? null, google_subject: profile.sub, role: "patient", last_login_at: now }],
    });
    user = created[0];
    if (!user) throw new Error("The application user could not be created.");
  }

  const profiles = await supabaseServerRestRequest<Array<{ id: string }>>(`/profiles?id=eq.${encodeURIComponent(user.id)}&select=id`);
  if (!profiles[0]) {
    await supabaseServerRestRequest("/profiles", {
      method: "POST",
      body: [{ id: user.id, display_name: user.display_name, role: user.role }],
    });
  } else {
    await supabaseServerRestRequest(`/profiles?id=eq.${encodeURIComponent(user.id)}`, { method: "PATCH", body: { display_name: user.display_name, updated_at: now } });
  }

  return { id: user.id, email: user.email, name: user.display_name, role: user.role, image: user.avatar_url };
}

export async function GET(request: Request) {
  const origin = requestOrigin(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const verifier = cookieStore.get("care_google_pkce")?.value;
  const expectedState = cookieStore.get("care_google_state")?.value;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !code || !state || state !== expectedState || !verifier) {
    console.error("[google-auth] callback validation failed", {
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
      hasCode: Boolean(code),
      hasState: Boolean(state),
      stateMatches: Boolean(state && expectedState && state === expectedState),
      hasVerifier: Boolean(verifier),
    });
    return failureRedirect(origin, "google_config");
  }

  try {
    const redirectUri = `${origin}/api/auth/google/callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, code_verifier: verifier, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      cache: "no-store",
    });
    if (!tokenResponse.ok) return failureRedirect(origin, "google_token");
    const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenPayload.access_token) return failureRedirect(origin, "google_token");

    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokenPayload.access_token}` }, cache: "no-store" });
    if (!profileResponse.ok) return failureRedirect(origin, "google_profile");
    const user = await findOrCreateUser(await profileResponse.json() as GoogleProfile);
    const session = await issueSession(user);
    const response = NextResponse.redirect(new URL("/", origin));
    setSessionCookies(response, session);
    response.cookies.delete("care_google_pkce");
    response.cookies.delete("care_google_state");
    return response;
  } catch (error) {
    console.error("[google-auth] callback failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return failureRedirect(origin, "google_server");
  }
}
