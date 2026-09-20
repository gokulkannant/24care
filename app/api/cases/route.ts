import { NextResponse } from "next/server";
import { demoClinicalPolicy } from "@/lib/clinical-policy";
import { assessAndTriage } from "@/lib/triage";
import { canInitiateForPatient } from "@/lib/authorization";
import { getAuthenticatedSession } from "@/lib/server-session";
import type { PersistedCaseRecord } from "@/lib/persistence-contract";
import { supabaseRestRequest } from "@/lib/supabase-rest";

type CareCaseRow = PersistedCaseRecord;

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
    const created = await supabaseRestRequest<CareCaseRow[]>("/care_case", {
      method: "POST",
      accessToken: session.accessToken,
      prefer: "return=representation",
      body: [{
        patient_id: patientId,
        initiated_by: session.userId,
        case_alias: body.caseAlias.trim(),
        caller_relationship: body.relationship.trim(),
        callback_reference: body.callback.trim(),
        policy_version: triage.policyVersion,
        priority: triage.priority,
        status: "review",
        triage_output: triage,
      }],
    });
    const careCase = created[0];
    if (!careCase) throw new Error("Supabase did not return the created case.");

    await supabaseRestRequest("/consent_record", {
      method: "POST",
      accessToken: session.accessToken,
      body: [{ case_id: careCase.id, captured_by: session.userId, intake_consent: true, recording_consent: false, notice_version: "web-intake-1" }],
    });
    await supabaseRestRequest("/transcript_segment", {
      method: "POST",
      accessToken: session.accessToken,
      body: [{ case_id: careCase.id, speaker: "caller", transcript: body.transcript.trim(), language: "mixed", status: "final" }],
    });
    await supabaseRestRequest("/assessment", {
      method: "POST",
      accessToken: session.accessToken,
      body: [{ case_id: careCase.id, provider: assessment.provider, policy_version: assessment.provider === "Local deterministic demo assessor" ? demoClinicalPolicy.version : triage.policyVersion, output: { assessment, triage } }],
    });
    await supabaseRestRequest("/audit_event", {
      method: "POST",
      accessToken: session.accessToken,
      body: [{ case_id: careCase.id, actor_id: session.userId, action: "Submitted intake", detail: `${careCase.case_alias} entered clinician review.` }],
    });

    return NextResponse.json({ case: careCase, assessment, triage }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to persist the care case." }, { status: 502 });
  }
}

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session || !["clinician", "care_coordinator", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "Clinician review access is required." }, { status: 403 });
  }

  try {
    const cases = await supabaseRestRequest<CareCaseRow[]>("/care_case?status=in.(review,open)&select=*&order=created_at.desc", { accessToken: session.accessToken });
    return NextResponse.json({ cases });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load the care queue." }, { status: 502 });
  }
}
