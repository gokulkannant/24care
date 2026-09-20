import type { AuthenticatedSession } from "./server-session";
import { supabaseServerRestRequest } from "./supabase-rest";

const reviewerRoles = new Set(["clinician", "care_coordinator", "admin"]);

export function canReviewCases(session: AuthenticatedSession) {
  return reviewerRoles.has(session.role);
}

export async function canAccessCase(session: AuthenticatedSession, caseId: string) {
  if (canReviewCases(session)) return true;
  const cases = await supabaseServerRestRequest<Array<{ patient_id: string; initiated_by: string }>>(`/care_case?id=eq.${encodeURIComponent(caseId)}&select=patient_id,initiated_by`);
  const careCase = cases[0];
  if (!careCase) return false;
  if (careCase.patient_id === session.userId || careCase.initiated_by === session.userId) return true;
  if (session.role !== "caretaker") return false;
  const links = await supabaseServerRestRequest<Array<{ status: string }>>(`/caretaker_patient?caretaker_id=eq.${encodeURIComponent(session.userId)}&patient_id=eq.${encodeURIComponent(careCase.patient_id)}&status=eq.active&select=status`);
  return Boolean(links[0]);
}

export async function canInitiateForPatient(session: AuthenticatedSession, patientId: string) {
  if (session.role === "patient") return patientId === session.userId;
  if (session.role !== "caretaker") return false;
  if (patientId === session.userId) return true;
  const links = await supabaseServerRestRequest<Array<{ status: string }>>(`/caretaker_patient?caretaker_id=eq.${encodeURIComponent(session.userId)}&patient_id=eq.${encodeURIComponent(patientId)}&status=eq.active&select=status`);
  return Boolean(links[0]);
}
