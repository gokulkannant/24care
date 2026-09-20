import { NextResponse } from "next/server";
import { demoClinicalPolicy } from "@/lib/clinical-policy";
import { assessAndTriage } from "@/lib/triage";
import { canInitiateForPatient } from "@/lib/authorization";
import { createIntakeCase, listReviewQueue, toRepositoryError } from "@/lib/care-repository";
import { getAuthenticatedSession } from "@/lib/server-session";

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session || !["patient", "caretaker"].includes(session.role)) {
    return NextResponse.json({ error: "An authenticated patient or caretaker account is required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    caseAlias?: unknown;
    relationship?: unknown;
    callback?: unknown;
    transcript?: unknown;
    intakeConsent?: unknown;
    patientId?: unknown;
  } | null;
  if (!body || typeof body.caseAlias !== "string" || typeof body.relationship !== "string" || typeof body.callback !== "string" || typeof body.transcript !== "string" || body.intakeConsent !== true || !body.transcript.trim()) {
    return NextResponse.json({ error: "Case details, consent, and a transcript are required." }, { status: 400 });
  }

  const patientId = session.role === "patient" ? session.userId : typeof body.patientId === "string" ? body.patientId : session.userId;
  if (!(await canInitiateForPatient(session, patientId))) return NextResponse.json({ error: "You are not authorized to initiate a case for this patient." }, { status: 403 });
  const { assessment, triage } = assessAndTriage(body.transcript, demoClinicalPolicy);

  try {
    const careCase = await createIntakeCase(session, {
      patientId,
      caseAlias: body.caseAlias.trim(),
      relationship: body.relationship.trim(),
      callback: body.callback.trim(),
      transcript: body.transcript.trim(),
      assessment,
      triage,
      assessmentPolicyVersion:
        assessment.provider === "Local deterministic demo assessor" ? demoClinicalPolicy.version : triage.policyVersion,
    });
    return NextResponse.json({ case: careCase, assessment, triage }, { status: 201 });
  } catch (error) {
    const failure = toRepositoryError(error, "Unable to persist the care case.");
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Clinician review access is required." }, { status: 403 });

  try {
    const cases = await listReviewQueue(session);
    return NextResponse.json({ cases });
  } catch (error) {
    const failure = toRepositoryError(error, "Unable to load the care queue.");
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
