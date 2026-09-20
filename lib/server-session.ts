import { cookies } from "next/headers";
import { verifyAccessToken } from "./custom-auth";
import { supabaseServerRestRequest } from "./supabase-rest";

export type AppRole = "patient" | "caretaker" | "clinician" | "care_coordinator" | "admin";

/**
 * An authenticated caller's identity.
 *
 * Deliberately carries no database credential. Server-side data access goes
 * through lib/care-repository.ts, which supplies the Supabase key itself, so
 * route handlers never hold a token they could pass to an unscoped query.
 */
export interface AuthenticatedSession {
  userId: string;
  email: string | null;
  name: string;
  role: AppRole;
}

interface Profile {
  id: string;
  display_name: string;
  role: AppRole;
}

export async function getAuthenticatedSession(): Promise<AuthenticatedSession | null> {
  const accessToken = (await cookies()).get("care_access_token")?.value;
  if (!accessToken) return null;

  try {
    const user = await verifyAccessToken(accessToken);
    if (!user) return null;
    const profiles = await supabaseServerRestRequest<Profile[]>(`/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,display_name,role`);
    const profile = profiles[0];
    if (!profile) return null;
    return {
      userId: user.id,
      email: user.email,
      name: profile.display_name,
      role: profile.role,
    };
  } catch {
    return null;
  }
}
