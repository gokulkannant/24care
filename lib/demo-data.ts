import type { AuditEvent, BenchmarkRun, CareTask, StaffMember, TranscriptSegment } from "./types";

export const seededRoster: StaffMember[] = [
  {
    id: "staff-01",
    name: "Dr. Anjana R.",
    role: "Duty clinician",
    serviceArea: "Medical College / North zone",
    shift: "19:00–07:00",
    contactMethod: "Internal duty phone",
    status: "available",
  },
  {
    id: "staff-02",
    name: "Nurse Fathima K.",
    role: "Palliative nurse",
    serviceArea: "City zone",
    shift: "19:00–01:00",
    contactMethod: "Internal duty phone",
    status: "available",
  },
  {
    id: "staff-03",
    name: "Nurse Nikhil V.",
    role: "Palliative nurse",
    serviceArea: "Outer zone",
    shift: "19:00–07:00",
    contactMethod: "Internal duty phone",
    status: "engaged",
  },
  {
    id: "staff-04",
    name: "Liya S.",
    role: "Care coordinator",
    serviceArea: "All zones",
    shift: "19:00–23:00",
    contactMethod: "Internal dashboard",
    status: "available",
  },
];

export const seededTasks: CareTask[] = [
  {
    id: "task-01",
    caseAlias: "Demo case #18",
    priority: "same_day_queue",
    assignee: "Liya S.",
    action: "Confirm transport-support details.",
    state: "assigned",
    createdAt: "2026-09-19T18:42:00.000Z",
  },
  {
    id: "task-02",
    caseAlias: "Demo case #17",
    priority: "urgent_review",
    assignee: null,
    action: "Duty clinician review pending.",
    state: "unassigned_urgent",
    createdAt: "2026-09-19T18:35:00.000Z",
  },
];

export const seededAudit: AuditEvent[] = [
  {
    id: "audit-01",
    at: "2026-09-19T18:42:00.000Z",
    actor: "Duty clinician",
    action: "Confirmed task",
    detail: "Demo case #18 was assigned to care coordination.",
  },
  {
    id: "audit-02",
    at: "2026-09-19T18:35:00.000Z",
    actor: "Call handler",
    action: "Submitted intake",
    detail: "Demo case #17 entered clinician review queue.",
  },
];

export const demoSegments: TranscriptSegment[] = [
  {
    id: "demo-segment-1",
    text: "എന്റെ അമ്മയുടെ വേദന കൂടുന്നു. The pain has increased since this evening.",
    status: "final",
    language: "mixed",
    createdAt: "2026-09-19T19:12:00.000Z",
  },
  {
    id: "demo-segment-2",
    text: "The dressing supplies are low; we need supplies today. Please call us back.",
    status: "final",
    language: "mixed",
    createdAt: "2026-09-19T19:12:14.000Z",
  },
];

export interface DemoScenario {
  id: string;
  title: string;
  malayalamTitle: string;
  alias: string;
  relationship: string;
  locality: string;
  transcript: string;
  concern: string;
  change: string;
  support: string;
  priorityNote: string;
  patientRecordNumber: string;
  age: number;
  gender: "Male" | "Female";
  primaryDiagnosis: string;
  palliativePerformanceScore: string;
  activeMedications: string[];
  knownAllergies: string;
  resuscitationStatus: string;
  emergencyContact: string;
}

export const demoScenarios: DemoScenario[] = [
  {
    id: "severe-pain",
    title: "Breakthrough cancer pain",
    malayalamTitle: "അതീവ കാൻസർ വേദന",
    alias: "Sukumaran Nair",
    relationship: "Caregiver",
    locality: "North zone (Kozhikode Medical College)",
    transcript: "എന്റെ അച്ഛന് കഠിനമായ വേദനയുണ്ട്. രാവിലെ മുതൽ Morphine കൊടുത്തിട്ടും വേദന കുറയുന്നില്ല. The pain has escalated severely and he cannot lie down.",
    concern: "എന്റെ അച്ഛന് കഠിനമായ വേദനയുണ്ട്. Morphine കൊടുത്തിട്ടും കുറയുന്നില്ല. Severe breakthrough pain.",
    change: "It suddenly became much worse",
    support: "Clinical review",
    priorityNote: "Immediate review cue: uncontrolled breakthrough pain despite morphine",
    patientRecordNumber: "IPM-CLT-2024-4109",
    age: 68,
    gender: "Male",
    primaryDiagnosis: "Carcinoma Tongue (Stage IV) with cervical lymphadenopathy",
    palliativePerformanceScore: "PPS 40% (Mainly in bed / extensive disease)",
    activeMedications: ["Tab. Morphine 10mg Q4H", "Syr. Lactulose 15ml HS", "Tab. Haloperidol 1.5mg SOS", "Tab. Pantoprazole 40mg OD"],
    knownAllergies: "NKDA (No Known Drug Allergies)",
    resuscitationStatus: "DNR / Allow Natural Death (Confirmed with Family)",
    emergencyContact: "+91 94471 28910 (Son - Arun)",
  },
  {
    id: "catheter-block",
    title: "Catheter blockage & retention",
    malayalamTitle: "യൂറിൻ കത്തീറ്റർ തടസ്സം",
    alias: "Mariamma Joseph",
    relationship: "Family member",
    locality: "City zone (Mavoor Road)",
    transcript: "യൂറിൻ ബാഗിൽ മൂത്രം ശേഖരിക്കപ്പെടുന്നില്ല. Catheter is blocked since 3 hours, and she has lower abdominal swelling and discomfort.",
    concern: "യൂറിൻ ബാഗിൽ മൂത്രം വരുന്നില്ല. Catheter appears blocked, severe discomfort.",
    change: "It has increased today",
    support: "Clinical review",
    priorityNote: "Urgent review cue: acute urinary retention / blocked catheter",
    patientRecordNumber: "IPM-CLT-2023-8821",
    age: 74,
    gender: "Female",
    primaryDiagnosis: "Metastatic Ca Cervix with bilateral hydronephrosis",
    palliativePerformanceScore: "PPS 50% (Considerable disease / mainly seated)",
    activeMedications: ["Tab. Paracetamol 650mg Q6H", "Tab. Tramadol 50mg BD", "Tab. Ondansetron 4mg SOS"],
    knownAllergies: "Sulfa antibiotics (Urticaria)",
    resuscitationStatus: "DNR Recorded",
    emergencyContact: "+91 98460 55123 (Daughter - Mini)",
  },
  {
    id: "dressing-supplies",
    title: "Routine wound dressing supplies",
    malayalamTitle: "ഡ്രസ്സിംഗ് സാധനങ്ങൾ",
    alias: "Abdul Rahman",
    relationship: "Caregiver",
    locality: "Outer zone (Feroke)",
    transcript: "ഡ്രസ്സിംഗ് മാറ്റാൻ ആവശ്യമായ ഗാസ് റോളും നോർമൽ സലൈനും തീർന്നുപോയി. We need fresh dressing supplies delivered for routine ulcer care.",
    concern: "ഗാസ് റോളും ക്ലീനിംഗ് ലോഷനും തീർന്നു. We need dressing supplies delivered.",
    change: "It is stable or routine",
    support: "Supplies today",
    priorityNote: "Routine queue: scheduled palliative dressing replenishment",
    patientRecordNumber: "IPM-CLT-2024-1054",
    age: 62,
    gender: "Male",
    primaryDiagnosis: "Malignant fungating chest wall ulcer (Metastatic Sarcoma)",
    palliativePerformanceScore: "PPS 60% (Reduced ambulation / self care)",
    activeMedications: ["Tab. Metronidazole 400mg TDS (odor control)", "Tab. Diclofenac 50mg PRN", "Topical Metronidazole Gel"],
    knownAllergies: "NKDA",
    resuscitationStatus: "Full Support (Hospital preference)",
    emergencyContact: "+91 97455 12098 (Spouse - Fatima)",
  },
];
export const illustrativeBenchmarks: BenchmarkRun[] = [
  {
    provider: "OpenAI live transcription",
    clinicianReviewedAccuracy: 91,
    policyCueRecall: 94,
    medianFinalLatencyMs: 740,
    codeSwitching: 90,
    droppedStreamRecovery: 100,
    evaluatedCalls: 12,
    isIllustrative: true,
  },
  {
    provider: "Gemini live transcription",
    clinicianReviewedAccuracy: 89,
    policyCueRecall: 92,
    medianFinalLatencyMs: 680,
    codeSwitching: 93,
    droppedStreamRecovery: 100,
    evaluatedCalls: 12,
    isIllustrative: true,
  },
];
