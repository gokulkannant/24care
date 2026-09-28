"use client";

import { useMemo, useState } from "react";
import type { Priority, StaffMember } from "@/lib/types";

export interface CoverageCase {
  id: string;
  caseAlias: string;
  priority: Priority;
  locality: string;
  x: number;
  y: number;
  etaMinutes: number;
  assignee: string | null;
  status: string;
}

interface CoverageMapProps {
  cases: CoverageCase[];
  staff: StaffMember[];
  onAssignNurse?: (caseId: string, nurseName: string | null) => void;
}

const priorityRank: Record<Priority, number> = {
  immediate_clinician_review: 0,
  urgent_review: 1,
  same_day_queue: 2,
  routine_queue: 3,
  insufficient_information: 4,
};

const priorityTone: Record<Priority, string> = {
  immediate_clinician_review: "critical",
  urgent_review: "urgent",
  same_day_queue: "same-day",
  routine_queue: "routine",
  insufficient_information: "unknown",
};

const priorityLabel: Record<Priority, string> = {
  immediate_clinician_review: "Immediate review",
  urgent_review: "Urgent review",
  same_day_queue: "Same-day queue",
  routine_queue: "Routine queue",
  insufficient_information: "Information needed",
};

export function CoverageMap({ cases, staff, onAssignNurse }: CoverageMapProps) {
  const [selectedId, setSelectedId] = useState(cases[0]?.id ?? null);
  const [routePlanned, setRoutePlanned] = useState(false);
  const selectedCase = cases.find((item) => item.id === selectedId) ?? cases[0] ?? null;
  const routeCases = useMemo(
    () => [...cases].sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority] || left.etaMinutes - right.etaMinutes),
    [cases],
  );
  const routePoints = routeCases.map((item) => `${item.x},${item.y}`).join(" ");
  const urgentCount = cases.filter((item) => item.priority === "immediate_clinician_review" || item.priority === "urgent_review").length;
  const availableCount = staff.filter((member) => member.status === "available" && member.role !== "Duty clinician").length;
  const availableNurses = staff.filter((member) => member.role !== "Duty clinician");

  function exportToWhatsApp() {
    const text = [
      "🏥 *IPM 24 Care - Nurse Visit Itinerary*",
      "📍 Care Hub: Kozhikode Medical College",
      "",
      ...routeCases.map(
        (item, index) =>
          `${index + 1}. *${item.caseAlias}* (${priorityLabel[item.priority]})\n   Locality: ${item.locality} (ETA ~${item.etaMinutes}m)\n   Staff: ${item.assignee ?? "Pending assignment"}`
      ),
      "",
      "_Sent from IPM 24 Care Desk_",
    ].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  function exportToGoogleMaps() {
    const stops = [
      "Kozhikode+Medical+College",
      ...routeCases.map((item) => encodeURIComponent(`${item.locality}, Kozhikode, Kerala`)),
    ];
    window.open(`https://www.google.com/maps/dir/${stops.join("/")}`, "_blank");
  }

  function shareCaseToWhatsApp(c: CoverageCase) {
    const text = [
      `📋 *IPM Care Assignment: ${c.caseAlias}*`,
      `Priority: ${priorityLabel[c.priority]}`,
      `Locality: ${c.locality} (ETA ~${c.etaMinutes} mins)`,
      `Assigned Nurse: ${c.assignee ?? "Unassigned"}`,
      `Status: ${c.status.replaceAll("_", " ")}`,
      "",
      "_Please confirm arrival via IPM care desk._",
    ].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }
  return (
    <section className="panel coverage-map-panel" aria-labelledby="coverage-map-title">
      <div className="coverage-map-heading">
        <div>
          <p className="eyebrow">Coverage planning</p>
          <h2 id="coverage-map-title">Case map</h2>
          <p className="subtle">Prioritise visits by severity, then hand the plan to the available care team.</p>
        </div>
        <div className="coverage-map-actions" aria-label="Route planning actions">
          <button
            className={routePlanned ? "secondary-button" : "primary-button"}
            type="button"
            onClick={() => setRoutePlanned((current) => !current)}
            aria-pressed={routePlanned}
          >
            {routePlanned ? "Clear route plan" : "Plan priority route"}
          </button>
        </div>
      </div>

      <div className="coverage-map-stats" aria-label="Coverage summary">
        <span><strong>{cases.length}</strong> active cases</span>
        <span><strong>{urgentCount}</strong> urgent markers</span>
        <span><strong>{availableCount}</strong> available field staff</span>
      </div>

      <div className="coverage-map-layout">
        <div className="coverage-map-canvas" role="img" aria-label="Fictional coverage map showing case severity markers and the care hub">
          <svg className="coverage-map-svg" viewBox="0 0 100 70" aria-hidden="true" preserveAspectRatio="none">
            <defs>
              <pattern id="coverage-grid" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M 8 0 L 0 0 0 8" fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth=".35" />
              </pattern>
            </defs>
            <rect width="100" height="70" fill="url(#coverage-grid)" />
            <path className="coverage-map-water" d="M0 8 C18 16 15 28 29 32 C43 36 38 51 50 54 C66 58 70 47 81 51 C91 55 94 64 100 68 L100 70 L0 70 Z" />
            <path className="coverage-map-road" d="M7 59 C18 48 22 31 37 27 C49 24 59 31 67 23 C76 14 85 18 95 8" />
            <path className="coverage-map-road coverage-map-road--secondary" d="M19 9 C26 18 31 22 43 39 C49 47 61 52 82 60" />
            {routePlanned ? <polyline className="coverage-map-route" points={`50,36 ${routePoints}`} /> : null}
            <circle className="coverage-map-hub" cx="50" cy="36" r="2.6" />
          </svg>
          <span className="coverage-map-hub-label">Care hub</span>
          {cases.map((item) => (
            <button
              className={`coverage-map-marker coverage-map-marker--${priorityTone[item.priority]} ${selectedCase?.id === item.id ? "is-selected" : ""}`}
              key={item.id}
              type="button"
              style={{ left: `${item.x}%`, top: `${(item.y / 70) * 100}%` }}
              onClick={() => setSelectedId(item.id)}
              aria-label={`${item.caseAlias}, ${priorityLabel[item.priority]}, ${item.locality}`}
              aria-pressed={selectedCase?.id === item.id}
            >
              <span className="coverage-map-marker-dot" aria-hidden="true" />
              <span className="coverage-map-marker-label">{item.caseAlias}</span>
            </button>
          ))}
          <span className="coverage-map-note">Fictional demo locations</span>
        </div>

        <div className="coverage-map-details">
          {selectedCase ? (
            <article className="coverage-map-selected" aria-live="polite">
              <div className="coverage-map-selected-topline">
                <span className={`priority-pill priority-pill--${priorityTone[selectedCase.priority]}`}>{priorityLabel[selectedCase.priority]}</span>
                <span className="microcopy">{selectedCase.etaMinutes} min from hub</span>
              </div>
              <h3>{selectedCase.caseAlias}</h3>
              <p>{selectedCase.locality}</p>
              <dl>
                <div><dt>Assignment</dt><dd>{selectedCase.assignee ?? "Unassigned"}</dd></div>
                <div><dt>Visit state</dt><dd>{selectedCase.status.replaceAll("_", " ")}</dd></div>
              </dl>
              {onAssignNurse ? (
                <div className="coverage-map-assign-box">
                  <label htmlFor={`assign-nurse-${selectedCase.id}`}>Assign field nurse</label>
                  <div className="assign-controls">
                    <select
                      id={`assign-nurse-${selectedCase.id}`}
                      value={selectedCase.assignee ?? ""}
                      onChange={(e) => onAssignNurse(selectedCase.id, e.target.value || null)}
                      aria-label={`Assign nurse for ${selectedCase.caseAlias}`}
                    >
                      <option value="">-- Unassigned --</option>
                      {availableNurses.map((nurse) => (
                        <option key={nurse.id} value={nurse.name}>
                          {nurse.name} ({nurse.status})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => shareCaseToWhatsApp(selectedCase)}
                      title="Share case brief to nurse on WhatsApp"
                    >
                      WhatsApp brief
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          ) : <p className="empty-copy">No cases have location data yet.</p>}

          <div className="coverage-map-legend" aria-label="Severity legend">
            <p className="eyebrow">Severity legend</p>
            {(Object.keys(priorityLabel) as Priority[]).slice(0, 4).map((priority) => (
              <span key={priority}><i className={`coverage-legend-dot coverage-legend-dot--${priorityTone[priority]}`} aria-hidden="true" />{priorityLabel[priority]}</span>
            ))}
          </div>
        </div>
      </div>

      {routePlanned ? (
        <div className="coverage-route-plan" role="status">
          <div>
            <p className="eyebrow">Suggested visit order</p>
            <p>Start at the care hub, address the highest-severity cases first, and confirm each handoff with the assigned staff member.</p>
          </div>
          <ol>
            {routeCases.map((item) => (
              <li key={item.id}>
                <strong>{item.caseAlias}</strong>
                <span>{item.locality} · {priorityLabel[item.priority]} (ETA ~{item.etaMinutes}m) · {item.assignee ?? "Unassigned"}</span>
              </li>
            ))}
          </ol>
          <div className="coverage-route-actions">
            <button type="button" className="secondary-button" onClick={exportToWhatsApp}>
              📲 Share itinerary via WhatsApp
            </button>
            <button type="button" className="secondary-button" onClick={exportToGoogleMaps}>
              🗺️ Open route in Google Maps
            </button>
          </div>
        </div>
      ) : null}

      <p className="coverage-map-disclaimer">MVP preview only. Locations and route order are fictional; this view does not dispatch staff or provide navigation.</p>
    </section>
  );
}
