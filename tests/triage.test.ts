import assert from "node:assert/strict";
import test from "node:test";
import { demoClinicalPolicy } from "../lib/clinical-policy";
import { applySeverityPolicy, assessDemoTranscript, assessAndTriage } from "../lib/triage";

test("a fictional urgent cue prepares urgent review and never removes clinician confirmation", () => {
  const { triage } = assessAndTriage("The pain has increased.", demoClinicalPolicy);
  assert.equal(triage.priority, "urgent_review");
  assert.equal(triage.requiresClinicianConfirmation, true);
  assert.match(triage.action, /Notify duty clinician/);
});

test("an unknown transcript remains insufficient information", () => {
  const { triage } = assessAndTriage("Caller wants to speak with the care team.", demoClinicalPolicy);
  assert.equal(triage.priority, "insufficient_information");
  assert.equal(triage.uncertainty, "high");
  assert.ok(triage.requiredFollowUps.length >= 2);
});

test("the highest-priority matching rule wins when several fictional signals appear", () => {
  const assessment = assessDemoTranscript("The pain has increased and we need help now.", demoClinicalPolicy);
  const triage = applySeverityPolicy(assessment, demoClinicalPolicy);
  assert.equal(triage.priority, "immediate_clinician_review");
  assert.equal(triage.ruleId, "demo-immediate");
});

test("Malayalam scripted cues pass through the same configured policy", () => {
  const { triage } = assessAndTriage("വേദന കൂടുന്നു", demoClinicalPolicy);
  assert.equal(triage.priority, "urgent_review");
});
