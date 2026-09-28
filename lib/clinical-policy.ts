import type { ClinicalPolicy } from "./types";

/**
 * DEMO ONLY. These fictional phrases demonstrate the policy engine contract.
 * An IPM clinician must replace and approve every signal before live use.
 */
export const demoClinicalPolicy: ClinicalPolicy = {
  id: "ipm-demo-policy",
  version: "0.1-demo",
  name: "IPM training policy — not for clinical use",
  isDemoOnly: true,
  approvalStatus: "demo_only",
  signals: [
    {
      id: "demo_immediate_review",
      label: "Scripted immediate-review cue",
      description: "A fictional training cue used only to demonstrate an alert workflow.",
      patterns: ["suddenly much worse", "need help now", "പെട്ടെന്ന് വഷളായി", "breakthrough pain", "escalated severely", "കഠിനമായ വേദന", "intolerable"],
    },
    {
      id: "demo_urgent_review",
      label: "Scripted urgent-review cue",
      description: "A fictional training cue used only to demonstrate clinician review.",
      patterns: ["pain has increased", "urgent review", "വേദന കൂടുന്നു", "catheter is blocked", "catheter", "കത്തീറ്റർ തടസ്സം", "യൂറിൻ"],
    },
    {
      id: "demo_same_day_support",
      label: "Scripted same-day support cue",
      description: "A fictional coordination cue used only to demonstrate task creation.",
      patterns: ["supplies are low", "need supplies today", "സാധനങ്ങൾ തീരുന്നു", "dressing supplies", "ഡ്രസ്സിംഗ് സാധനങ്ങൾ", "ഗാസ് റോൾ"],
    },
    {
      id: "demo_routine_follow_up",
      label: "Scripted routine follow-up cue",
      description: "A fictional routine coordination cue.",
      patterns: ["routine follow-up", "scheduled update", "സാധാരണ ഫോളോ അപ്പ്"],
    },
  ],
  rules: [
    {
      id: "demo-immediate",
      title: "Immediate clinician review",
      priority: "immediate_clinician_review",
      action: "Alert duty clinician; prepare a draft review case.",
      destinationType: "Clinician decides the approved pathway",
      requiredFollowUps: [
        "Confirm caller location and callback number.",
        "Ask the duty clinician to review the complete call evidence.",
      ],
      signalIds: ["demo_immediate_review"],
      sortOrder: 1,
    },
    {
      id: "demo-urgent",
      title: "Urgent clinician review",
      priority: "urgent_review",
      action: "Notify duty clinician; prepare a priority care task.",
      destinationType: "Clinician-reviewed IPM care queue",
      requiredFollowUps: [
        "Confirm the caller can be reached.",
        "Ask the clinician to validate the reported change.",
      ],
      signalIds: ["demo_urgent_review"],
      sortOrder: 2,
    },
    {
      id: "demo-same-day",
      title: "Same-day coordination review",
      priority: "same_day_queue",
      action: "Prepare a same-day coordination task for clinician confirmation.",
      destinationType: "Approved IPM care coordination queue",
      requiredFollowUps: ["Confirm the requested support and callback details."],
      signalIds: ["demo_same_day_support"],
      sortOrder: 3,
    },
    {
      id: "demo-routine",
      title: "Routine follow-up review",
      priority: "routine_queue",
      action: "Prepare a routine follow-up task for clinician confirmation.",
      destinationType: "Approved IPM follow-up queue",
      requiredFollowUps: ["Confirm the preferred follow-up window."],
      signalIds: ["demo_routine_follow_up"],
      sortOrder: 4,
    },
  ],
};
