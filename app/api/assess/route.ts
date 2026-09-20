import { demoClinicalPolicy } from "@/lib/clinical-policy";
import { assessAndTriage } from "@/lib/triage";
import { appendAssessment, toRepositoryError } from "@/lib/care-repository";
import { getAuthenticatedSession } from "@/lib/server-session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { transcript?: unknown; caseId?: unknown } | null;

  if (!body || typeof body.transcript !== "string" || !body.transcript.trim()) {
    return Response.json({ error: "A transcript is required." }, { status: 400 });
  }

  const result = assessAndTriage(body.transcript, demoClinicalPolicy);
  if (typeof body.caseId === "string") {
    const session = await getAuthenticatedSession();
    if (!session) return Response.json({ error: "Authentication is required to persist this assessment." }, { status: 401 });
    try {
      await appendAssessment(session, body.caseId, {
        provider: result.assessment.provider,
        policyVersion: demoClinicalPolicy.version,
        output: result,
      });
    } catch (error) {
      const failure = toRepositoryError(error, "Unable to persist the assessment.");
      return Response.json({ error: failure.message }, { status: failure.status });
    }
  }

  return Response.json({
    mode: "demo_only",
    policy: { version: demoClinicalPolicy.version, approvalStatus: demoClinicalPolicy.approvalStatus },
    ...result,
  });
}
