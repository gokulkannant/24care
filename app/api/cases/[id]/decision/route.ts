import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/lib/server-session";
import { supabaseRestRequest } from "@/lib/supabase-rest";

interface CareCaseRow {
  id: string;
  case_alias: string;
  priority: string;
  triage_output: { action?: string };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthenticatedSession();
  if (!session || !["clinician", "care_coordinator", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "Clinician review access is required." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { outcome?: unknown; note?: unknown } | null;
  if (!body || (body.outcome !== "confirmed" && body.outcome !== "overridden") || typeof body.note !== "string" || !body.note.trim()) {
    return NextResponse.json({ error: "A decision outcome and note are required." }, { status: 400 });
  }

  try {
    const rows = await supabaseRestRequest<CareCaseRow[]>(`/care_case?id=eq.${encodeURIComponent(id)}&select=id,case_alias,priority,triage_output`, { accessToken: session.accessToken });
    const careCase = rows[0];
    if (!careCase) return NextResponse.json({ error: "Care case not found." }, { status: 404 });

    await supabaseRestRequest("/clinical_decision", {
      method: "POST",
      accessToken: session.accessToken,
      body: [{ case_id: id, clinician_id: session.userId, outcome: body.outcome, note: body.note.trim() }],
    });
    await supabaseRestRequest(`/care_case?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      accessToken: session.accessToken,
      body: { status: body.outcome === "confirmed" ? "confirmed" : "overridden", updated_at: new Date().toISOString() },
    });

    const action = body.outcome === "overridden" ? `Clinician override: ${body.note.trim()}` : careCase.triage_output.action ?? "Clinician-confirmed care review.";
    await supabaseRestRequest("/care_task", {
      method: "POST",
      accessToken: session.accessToken,
      body: [{
        case_id: id,
        priority: careCase.priority,
        action,
        state: careCase.priority === "urgent_review" || careCase.priority === "immediate_clinician_review" ? "unassigned_urgent" : "awaiting_clinician",
      }],
    });
    await supabaseRestRequest("/audit_event", {
      method: "POST",
      accessToken: session.accessToken,
      body: [{ case_id: id, actor_id: session.userId, action: body.outcome === "confirmed" ? "Confirmed proposed action" : "Overrode proposed action", detail: body.note.trim() }],
    });

    return NextResponse.json({ ok: true, status: body.outcome === "confirmed" ? "confirmed" : "overridden" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to persist the clinical decision." }, { status: 502 });
  }
}
