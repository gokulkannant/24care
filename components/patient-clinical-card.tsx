"use client";

import { useState } from "react";
import {
  FileText,
  AlertCircle,
  Pill,
  HeartPulse,
  Phone,
  User,
  ShieldAlert,
  Send,
  CheckCircle,
  Copy,
  Download,
  Stethoscope,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { DemoScenario } from "@/lib/demo-data";
import type { Priority } from "@/lib/types";

interface PatientClinicalCardProps {
  scenario: DemoScenario | null;
  alias: string;
  relationship: string;
  callback: string;
  priority: Priority;
  triageAction?: string;
  matchedRuleId?: string;
  onDispatchAction?: (actionText: string) => void;
}

export function PatientClinicalCard({
  scenario,
  alias,
  relationship,
  callback,
  priority,
  triageAction,
  matchedRuleId,
  onDispatchAction,
}: PatientClinicalCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sbarModalOpen, setSbarModalOpen] = useState(false);
  const [copiedSbar, setCopiedSbar] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Fallback defaults if caller was entered manually
  const mrn = scenario?.patientRecordNumber ?? "IPM-CLT-2024-REG";
  const diagnosis = scenario?.primaryDiagnosis ?? "Palliative Care Registered Patient (Advanced Chronic Illness)";
  const pps = scenario?.palliativePerformanceScore ?? "PPS 50% (Ambulatory with Assistance)";
  const medications = scenario?.activeMedications ?? [
    "Tab. Morphine 10mg Q4H SOS",
    "Tab. Paracetamol 500mg TDS",
    "Syr. Lactulose 15ml HS",
  ];
  const allergies = scenario?.knownAllergies ?? "No Known Drug Allergies (NKDA)";
  const resuscitation = scenario?.resuscitationStatus ?? "DNR / Allow Natural Death Recorded";
  const contact = scenario?.emergencyContact ?? `${callback} (${relationship})`;

  const sbarContent = [
    `INSTITUTE OF PALLIATIVE MEDICINE (IPM) - CLINICAL HANDOVER (SBAR)`,
    `Generated: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
    `Patient: ${alias} | MRN: ${mrn}`,
    ``,
    `[S] SITUATION:`,
    `Caller: ${relationship} (${callback})`,
    `Reported Acute Concern: ${scenario?.concern ?? "Escalation in symptoms reported via telephone."}`,
    `CDS Recommended Priority: ${priority.toUpperCase().replaceAll("_", " ")}`,
    ``,
    `[B] BACKGROUND:`,
    `Primary Diagnosis: ${diagnosis}`,
    `Performance Status: ${pps}`,
    `Active Regimen: ${medications.join(", ")}`,
    `Allergies: ${allergies}`,
    `Care Goals / Resuscitation: ${resuscitation}`,
    ``,
    `[A] ASSESSMENT:`,
    `Policy Rule Matched: ${matchedRuleId ?? "demo-rule"}`,
    `Automated Clinical Assessment: ${triageAction ?? "Clinician evaluation recommended."}`,
    ``,
    `[R] RECOMMENDATION & ACTION PLAN:`,
    `- Immediate telephonic confirmation with caregiver (${contact}).`,
    `- Authorize oral breakthrough analgesia / catheter relief protocol if indicated.`,
    `- Deploy zone palliative home care nurse for verification and physical comfort measures.`,
    `- Handover to morning shift team (07:00 IST) for ongoing surveillance.`,
  ].join("\n");

  function copySbar() {
    navigator.clipboard.writeText(sbarContent);
    setCopiedSbar(true);
    setTimeout(() => setCopiedSbar(false), 2000);
  }

  function handleAction(text: string) {
    setActionNotice(text);
    if (onDispatchAction) onDispatchAction(text);
    setTimeout(() => setActionNotice(null), 4000);
  }

  return (
    <section className="patient-ehr-card" aria-label="Patient Electronic Health Record Card">
      <div className="ehr-card-header">
        <div className="ehr-patient-title">
          <div className="ehr-avatar" aria-hidden="true">
            <User size={18} />
          </div>
          <div>
            <div className="ehr-name-row">
              <h3>{alias}</h3>
              <span className="ehr-mrn-badge">{mrn}</span>
              <span className="ehr-age-tag">
                {scenario ? `${scenario.age}y / ${scenario.gender}` : "Adult"}
              </span>
            </div>
            <p className="ehr-diagnosis-preview">{diagnosis}</p>
          </div>
        </div>

        <div className="ehr-header-actions">
          <button
            type="button"
            className="ehr-sbar-btn"
            onClick={() => setSbarModalOpen(true)}
            title="Generate SBAR Shift Handover Note"
          >
            <FileText size={13} />
            <span>SBAR Handover</span>
          </button>
          <button
            type="button"
            className="ehr-toggle-expand"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse EHR Summary" : "Expand EHR Summary"}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="ehr-action-toast" role="status">
          <CheckCircle size={14} />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Quick compact row visible in all views */}
      <div className="ehr-quick-vitals">
        <div className="vital-chip">
          <HeartPulse size={12} className="vital-icon" />
          <span className="vital-label">Status:</span>
          <strong>{pps.split("(")[0]}</strong>
        </div>
        <div className="vital-chip">
          <Pill size={12} className="vital-icon" />
          <span className="vital-label">Active Rx:</span>
          <strong>{medications[0]}</strong>
          {medications.length > 1 && <span className="vital-plus">+{medications.length - 1}</span>}
        </div>
        <div className="vital-chip vital-chip--code">
          <ShieldAlert size={12} className="vital-icon" />
          <span className="vital-label">Code:</span>
          <strong>{resuscitation.split("/")[0].trim()}</strong>
        </div>
      </div>

      {/* Collapsible in-depth clinical background */}
      {isExpanded && (
        <div className="ehr-expanded-body">
          <div className="ehr-grid-details">
            <div className="ehr-detail-block">
              <span className="ehr-block-label">
                <Pill size={11} /> Current Palliative Regimen
              </span>
              <ul className="ehr-med-list">
                {medications.map((med, idx) => (
                  <li key={idx}>{med}</li>
                ))}
              </ul>
            </div>

            <div className="ehr-detail-block">
              <span className="ehr-block-label">
                <AlertCircle size={11} /> Allergies & Precautions
              </span>
              <p className="ehr-allergy-text">{allergies}</p>
              <div className="ehr-contact-row">
                <Phone size={11} />
                <span>Primary: {contact}</span>
              </div>
            </div>
          </div>

          <div className="ehr-quick-actions">
            <span className="actions-label">Clinician Protocol Actions:</span>
            <div className="action-buttons-row">
              <button
                type="button"
                className="ehr-clinical-action-btn"
                onClick={() =>
                  handleAction(`Clinician authorized oral morphine breakthrough dose (5mg) per protocol for ${alias}.`)
                }
              >
                <Stethoscope size={13} />
                <span>Authorize Breakthrough Dose</span>
              </button>
              <button
                type="button"
                className="ehr-clinical-action-btn"
                onClick={() =>
                  handleAction(`Initiated emergency palliative catheter replacement dispatch for ${alias}.`)
                }
              >
                <Send size={13} />
                <span>Dispatch Acute Home Visit</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SBAR Handover Modal */}
      {sbarModalOpen && (
        <div className="sbar-modal-shell" role="dialog" aria-modal="true" aria-labelledby="sbar-title">
          <div className="sbar-modal-card">
            <div className="sbar-header">
              <div>
                <p className="eyebrow">Clinical Handover Protocol</p>
                <h2 id="sbar-title">SBAR Shift Handover Note</h2>
              </div>
              <button type="button" className="sbar-close-btn" onClick={() => setSbarModalOpen(false)}>
                ✕
              </button>
            </div>

            <div className="sbar-body">
              <pre className="sbar-text-preview">{sbarContent}</pre>
            </div>

            <div className="sbar-footer">
              <span className="sbar-footnote-text">IPM Quality Standard 4.2 · Tamper-evident handover export</span>
              <div className="sbar-btn-group">
                <button type="button" className="secondary-action-btn" onClick={copySbar}>
                  {copiedSbar ? <CheckCircle size={14} /> : <Copy size={14} />}
                  <span>{copiedSbar ? "Copied to Clipboard" : "Copy SBAR Note"}</span>
                </button>
                <button
                  type="button"
                  className="primary-action-btn"
                  onClick={() => {
                    copySbar();
                    handleAction(`Exported SBAR Handover note for ${alias} (${mrn}).`);
                    setSbarModalOpen(false);
                  }}
                >
                  <Download size={14} />
                  <span>Copy & Log Handover</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
