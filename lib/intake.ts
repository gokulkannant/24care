import type { Assessment, TriageResult } from "./types";

export type IntakeAnswerKind = "text" | "choice";

export interface IntakeQuestion {
  id: "concern" | "change" | "support";
  label: string;
  prompt: string;
  helper: string;
  kind: IntakeAnswerKind;
  options?: string[];
}

export interface IntakeCaseDraft {
  caseAlias: string;
  relationship: string;
  callback: string;
  transcript: string;
  assessment: Assessment;
  triage: TriageResult;
  persistedCaseId?: string;
}
export const intakeQuestions: IntakeQuestion[] = [
  {
    id: "concern",
    label: "What do you need help with?",
    prompt: "Please tell me in your own words what is happening and what help you need today.",
    helper: "You can write in Malayalam, English, or both.",
    kind: "text",
  },
  {
    id: "change",
    label: "How has this changed?",
    prompt: "Which option best describes the change you are calling about?",
    helper: "Choose the closest description. A clinician will review it.",
    kind: "choice",
    options: ["It suddenly became much worse", "It has increased today", "It is stable or routine", "I am not sure"],
  },
  {
    id: "support",
    label: "What support is needed?",
    prompt: "What would you like the care team to help with?",
    helper: "Select the most important request for this call.",
    kind: "choice",
    options: ["Clinical review", "Supplies today", "Routine follow-up", "I am not sure"],
  },
];

export function buildIntakeTranscript(answers: Record<string, string>): string {
  const parts = [answers.concern, answers.change, answers.support].filter(Boolean);
  return parts.join(" ");
}
