import type {
  Assessment,
  ClinicalPolicy,
  PolicyRule,
  SignalEvidence,
  TriageResult,
} from "./types";

export function extractDemoSignals(text: string, policy: ClinicalPolicy): SignalEvidence[] {
  const normalized = text.toLocaleLowerCase();

  return policy.signals.flatMap((signal) => {
    const excerpts = signal.patterns.filter((pattern) => normalized.includes(pattern.toLocaleLowerCase()));
    return excerpts.length ? [{ signalId: signal.id, label: signal.label, excerpts }] : [];
  });
}

export function assessDemoTranscript(text: string, policy: ClinicalPolicy): Assessment {
  const signals = extractDemoSignals(text, policy);
  const uncertainty = signals.length === 0 ? "high" : signals.length === 1 ? "moderate" : "low";

  return {
    provider: "Local deterministic demo assessor",
    signals,
    uncertainty,
    missingQuestions:
      signals.length === 0
        ? ["Record the caller's stated concern in their own words.", "Confirm a safe callback number."]
        : ["Confirm callback number and location before clinician review."],
    createdAt: new Date().toISOString(),
    note: "Training output only. A clinician must validate all information and actions.",
  };
}

function defaultRule(policy: ClinicalPolicy): PolicyRule {
  return {
    id: "insufficient-information",
    title: "Insufficient information",
    priority: "insufficient_information",
    action: "Ask approved follow-up questions and request clinician review.",
    destinationType: "Duty clinician review queue",
    requiredFollowUps: [
      "Record the caller's concern in their own words.",
      "Confirm a callback number and location.",
      "Request clinician review before classifying the case.",
    ],
    signalIds: [],
    sortOrder: Number.MAX_SAFE_INTEGER,
  };
}

export function applySeverityPolicy(assessment: Assessment, policy: ClinicalPolicy): TriageResult {
  const presentIds = new Set(assessment.signals.map((signal) => signal.signalId));
  const matchingRule = [...policy.rules]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .find((rule) => rule.signalIds.some((id) => presentIds.has(id)));
  const rule = matchingRule ?? defaultRule(policy);

  return {
    priority: rule.priority,
    ruleId: rule.id,
    ruleTitle: rule.title,
    action: rule.action,
    destinationType: rule.destinationType,
    requiredFollowUps: [...new Set([...rule.requiredFollowUps, ...assessment.missingQuestions])],
    matchedSignals: assessment.signals.filter((signal) => rule.signalIds.includes(signal.signalId)),
    uncertainty: assessment.uncertainty,
    policyVersion: policy.version,
    requiresClinicianConfirmation: true,
  };
}

export function assessAndTriage(text: string, policy: ClinicalPolicy): { assessment: Assessment; triage: TriageResult } {
  const assessment = assessDemoTranscript(text, policy);
  return { assessment, triage: applySeverityPolicy(assessment, policy) };
}
