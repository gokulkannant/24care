import { demoClinicalPolicy } from "@/lib/clinical-policy";
import { assessAndTriage } from "@/lib/triage";
import { canAccessCase } from "@/lib/authorization";
import { getAuthenticatedSession } from "@/lib/server-session";
import { supabaseRestRequest } from "@/lib/supabase-rest";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { transcript?: unknown; caseId?: unknown } | null;

  if (!body || typeof body.transcript !== "string" || !body.transcript.trim()) {
    return Response.json({ error: "A transcript is required." }, { status: 400 });
  }

  const result = assessAndTriage(body.transcript, demoClinicalPolicy);
  if (typeof body.caseId === "string") {
    const session = await getAuthenticatedSession();
    if (!session) return Response.json({ error: "Authentication is required to persist this assessment." }, { status: 401 });
    if (!(await canAccessCase(session, body.caseId))) return Response.json({ error: "The assessment case is not accessible." }, { status: 403 });
    try {
      await supabaseRestRequest("/assessment", {
        method: "POST",
        accessToken: session.accessToken,
        body: [{
          case_id: body.caseId,
          provider: result.assessment.provider,
          policy_version: demoClinicalPolicy.version,
          output: result,
        }],
      });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Unable to persist the assessment." }, { status: 502 });
    }
  }

  return Response.json({
    mode: "demo_only",
    policy: { version: demoClinicalPolicy.version, approvalStatus: demoClinicalPolicy.approvalStatus },
    ...result,
  });
}
