import { createHash, randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { supabaseServerRestRequest } from "./supabase-rest";
import type { AppRole } from "./server-session";

export interface CustomAuthUser {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  image?: string | null;
}

interface TokenClaims {
  sub: string;
  email: string;
  name: string;
  role: AppRole;
  image?: string | null;
  tokenType: "access" | "refresh";
  sessionId?: string;
}

const accessLifetime = "1h";
const refreshLifetimeMs = 30 * 24 * 60 * 60 * 1000;

function secret(name: "AUTH_JWT_SECRET" | "AUTH_REFRESH_SECRET") {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(`${name} must be set to at least 32 characters.`);
  return new TextEncoder().encode(value);
}

export function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function signAccessToken(user: CustomAuthUser) {
  return new SignJWT({ email: user.email, name: user.name, role: user.role, image: user.image ?? null, tokenType: "access" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(accessLifetime)
    .sign(secret("AUTH_JWT_SECRET"));
}

async function signRefreshToken(userId: string, sessionId: string) {
  return new SignJWT({ tokenType: "refresh", sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret("AUTH_REFRESH_SECRET"));
}

export async function issueSession(user: CustomAuthUser) {
  const sessionId = randomUUID();
  const refreshToken = await signRefreshToken(user.id, sessionId);
  await supabaseServerRestRequest("/app_session", {
    method: "POST",
    body: [{ id: sessionId, user_id: user.id, refresh_token_hash: hashRefreshToken(refreshToken), expires_at: new Date(Date.now() + refreshLifetimeMs).toISOString() }],
  });
  return { accessToken: await signAccessToken(user), refreshToken };
}

export async function verifyAccessToken(token: string): Promise<CustomAuthUser | null> {
  try {
    const result = await jwtVerify(token, secret("AUTH_JWT_SECRET"), { algorithms: ["HS256"] });
    const claims = result.payload as unknown as Partial<TokenClaims>;
    if (claims.tokenType !== "access" || typeof result.payload.sub !== "string" || typeof claims.email !== "string" || typeof claims.name !== "string" || typeof claims.role !== "string") return null;
    return { id: result.payload.sub, email: claims.email, name: claims.name, role: claims.role as AppRole, image: claims.image ?? null };
  } catch {
    return null;
  }
}

async function verifyRefreshToken(token: string) {
  try {
    const result = await jwtVerify(token, secret("AUTH_REFRESH_SECRET"), { algorithms: ["HS256"] });
    const claims = result.payload as unknown as Partial<TokenClaims>;
    if (claims.tokenType !== "refresh" || typeof result.payload.sub !== "string" || typeof claims.sessionId !== "string") return null;
    return { userId: result.payload.sub, sessionId: claims.sessionId };
  } catch {
    return null;
  }
}

export async function rotateSession(refreshToken: string) {
  const claims = await verifyRefreshToken(refreshToken);
  if (!claims) return null;
  const sessions = await supabaseServerRestRequest<Array<{ id: string; user_id: string; expires_at: string; revoked_at: string | null }>>(`/app_session?id=eq.${encodeURIComponent(claims.sessionId)}&user_id=eq.${encodeURIComponent(claims.userId)}&select=id,user_id,expires_at,revoked_at`);
  const session = sessions[0];
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return null;
  const users = await supabaseServerRestRequest<Array<{ id: string; email: string; display_name: string; role: AppRole; avatar_url: string | null }>>(`/app_user?id=eq.${encodeURIComponent(claims.userId)}&select=id,email,display_name,role,avatar_url`);
  const row = users[0];
  if (!row) return null;
  await supabaseServerRestRequest(`/app_session?id=eq.${encodeURIComponent(session.id)}`, { method: "PATCH", body: { revoked_at: new Date().toISOString() } });
  return issueSession({ id: row.id, email: row.email, name: row.display_name, role: row.role, image: row.avatar_url });
}

export async function revokeSession(refreshToken: string) {
  const claims = await verifyRefreshToken(refreshToken);
  if (!claims) return;
  await supabaseServerRestRequest(`/app_session?id=eq.${encodeURIComponent(claims.sessionId)}&user_id=eq.${encodeURIComponent(claims.userId)}`, { method: "PATCH", body: { revoked_at: new Date().toISOString() } });
}
