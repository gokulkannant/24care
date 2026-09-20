# 24 Care Triage Assistant

## Overview

24 Care Triage Assistant is a safety-first web MVP for IPM's 24×7 palliative-care support workflow. It helps a patient, caretaker, or call handler capture consented concerns in Malayalam, English, or mixed language; prepares a transparent, policy-based priority draft; and routes that draft to a duty clinician for confirmation.

The system is intentionally **not** a diagnostic, referral, or dispatch system. A clinician must confirm or override every proposed action before a care task is created.

## Problem Statement

IPM's 24×7 support line has limited staff availability, so not every incoming concern can receive the same immediate response. Call handlers need a consistent way to capture policy-relevant information, make incomplete information visible, and place the most concerning cases in front of a duty clinician without allowing an AI system to make clinical decisions.

## Solution

The project provides role-aware patient, caretaker, and clinician workspaces. A caller completes a consented, guided intake or uses the recorded-call path. The system produces a transcript, extracts only configured policy signals, and applies a deterministic severity policy. It shows the rule, evidence excerpts, missing follow-up questions, and uncertainty to the duty clinician. Only after clinician confirmation or an audited override does the coordinator task queue update.

## Features

- Consent gate before transcription or audio capture begins.
- Malayalam, English, and code-switched guided intake with typed fallback.
- Deterministic, versioned policy engine with evidence, rule IDs, uncertainty, and missing questions.
- Clinician-only confirmation or override before a care task can be created.
- Patient, caretaker, clinician, and coordinator workflow views.
- Supabase-ready authentication, case persistence, audit records, and role/case-scoped RLS migrations.
- Gemini on Vertex AI using Application Default Credentials (ADC) for the server-side audio-processing path.
- Manual staff availability and an unassigned urgent queue.
- Provider benchmark view and Playwright browser-flow coverage.

## Tech Stack

- *Frontend:* Next.js 16, React 19, TypeScript, responsive custom CSS.
- *Backend:* Next.js App Router route handlers; optional Node.js LiveKit agent worker.
- *Database:* Supabase Postgres, Auth, Storage, and Row Level Security migrations.
- *APIs / Services:* Google Gemini on Vertex AI with ADC, Supabase, and optional LiveKit WebRTC transport.
- *Hosting / Deployment:* Not deployed yet; designed for a Node-compatible deployment with server-only environment variables.
- *Other Tools:* Playwright, TypeScript, Bun, npm, and Docker Compose for local LiveKit experimentation.

## Codex / OpenAI Usage

Codex was used throughout the hackathon for ideation, architecture planning, implementation, UI/UX iteration, debugging, test design, and documentation. It helped turn the workflow into a safe system boundary: generative AI can transcribe audio and ask one intake question, while deterministic policy and clinician confirmation control the actual triage workflow.

Codex also generated and verified the Playwright end-to-end journey covering consent, policy evidence, clinician confirmation, task creation, and mobile layout. The app's runtime audio path uses Gemini through Vertex AI with ADC; it does not use an OpenAI API key.

## Why OpenAI Credits Would Help

OpenAI credits would let us evaluate and operate the repository's existing OpenAI provider path alongside the Gemini ADC path. The goal is not to hand clinical judgement to a model. It is to find the transcription and structured-intake experience that helps an overstretched care team notice the right information sooner, while a clinician remains responsible for every decision.

### What the credits would fund

- **Malayalam and mixed-language speech evaluation:** Run clinician-approved synthetic or explicitly consented test calls through OpenAI transcription and realtime voice, then compare the output with the Gemini path. We would measure word accuracy, preservation of clinically relevant phrases, latency, interruptions, noise tolerance, and recovery after a dropped connection.
- **Safer guided intake:** Use the realtime path to ask one plain-language follow-up at a time when essential context is missing, such as the caller's preferred language, symptoms already described, or a callback detail. The scripted policy—not the model—still determines the priority band and required questions.
- **Structured evidence extraction experiments:** Test whether AI can reliably turn a final transcript into constrained evidence fields for the deterministic policy engine. Outputs are shown to the clinician with transcript excerpts, uncertainty, missing information, and rule IDs; they do not directly create a task or referral.
- **A provider benchmark for IPM:** Generate a transparent comparison for IPM clinicians so they can choose the provider that performs best for their approved Malayalam/English test material rather than choosing based on a generic claim or a single demo.
- **Cost and reliability testing:** Estimate per-call cost, response time, and failure behaviour before a supervised pilot, so the service remains practical when staff availability is limited.

### How this can help people

- **Patients and caregivers** can describe a concern in Malayalam, English, or a natural mix of both, with less need to repeat themselves while waiting for a human response.
- **Call handlers** get a legible transcript and a checklist of missing information, helping them capture a consistent handoff even during busy shifts.
- **Duty clinicians** receive the policy evidence, context, and uncertainty in one review screen, allowing them to focus their limited attention on confirming the right next action.
- **Coordinators** see only clinician-confirmed tasks and available staff, reducing the chance that an unreviewed AI suggestion becomes a care assignment.

### Safety commitments for any credit-funded work

- Use only synthetic calls or calls covered by IPM-approved, explicit consent during development and evaluation.
- Keep API credentials on the server; browser clients receive only short-lived, scoped session material where required.
- Do not use model output for autonomous diagnosis, emergency decisions, hospital referrals, care dispatch, or medical advice.
- Do not persist patient recordings until IPM has approved retention, access, deletion, encryption, audit, and incident-response procedures.
- Treat low confidence, incomplete details, provider failure, or a broken connection as a prompt for human follow-up—not a low-priority outcome.

### What success would look like

We would consider the credits useful if clinician review shows that the chosen provider preserves policy-relevant Malayalam/English phrases, reduces time spent preparing a handoff, and reliably surfaces missing information—without reducing clinician control or exposing unapproved patient data. Results would be documented in the benchmark view and used to inform an IPM-approved pilot decision.

## Demo

### Live Demo

Not deployed yet. Run locally using the instructions below.

### Demo / Pitch Video

Not recorded yet. The recommended video flow is: show the consent gate, complete a Malayalam/English intake, reveal the policy evidence, confirm the case as the duty clinician, and show the resulting task/audit entry.

## Screenshots

### Clinician review

![Clinician review with evidence and a required human confirmation](test-artifacts/clinician-review.png)

### Mobile coverage and task queue

![Mobile coverage and tasks layout](test-artifacts/mobile-coverage.png)

## How to Run Locally

```bash
git clone <repo-url>
cd <project-folder>
npm install
```

Copy `.env.example` to `.env.local`, then configure Supabase and LiveKit only if you need their authenticated paths. For Gemini through Vertex AI ADC, set a Google Cloud project and authenticate locally:

```bash
gcloud auth application-default login
```

```env
GOOGLE_CLOUD_PROJECT=your-google-cloud-project
GOOGLE_CLOUD_LOCATION=global
GOOGLE_GENAI_USE_VERTEXAI=true
```

Start the application:

```bash
npm run dev
```

Open `http://localhost:3000`.

Useful verification commands:

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
```

The optional LiveKit worker is started separately with:

```bash
npm run agent:dev
```

## Future Plans

This repository is a hackathon MVP, not a live clinical system. The next stages are deliberately centred on clinical governance, safe operations, and measurement before expanding automation.

### Phase 1 — Clinician-approved pilot foundation

- Replace the fictional demonstration policy with an IPM-approved, versioned severity rubric. Each rule will define its approved signals, follow-up questions, escalation destination type, and appropriate action.
- Co-design the consent notice, Malayalam/English language, emergency wording, and referral pathways with IPM clinicians and privacy stakeholders.
- Create a clinician-reviewed evaluation set that includes Malayalam, English, code-switched, noisy, interrupted, silent, incomplete, routine, urgent, and possible-emergency calls.
- Benchmark the supported transcription paths against that set for transcript accuracy, policy-relevant phrase recognition, response latency, and dropped-stream recovery. The provider chosen for a pilot will be recorded with its benchmark result.
- Continue to require a duty clinician to confirm or override every action. The system will never autonomously diagnose, refer a patient, dispatch care, select a hospital, or give clinical advice.

### Phase 2 — Privacy, security, and governance

- Replace demo cookies and browser-local workflow data with enforced authenticated accounts, role assignment, and organization-scoped access control.
- Review every Supabase Row Level Security policy, case relationship, audit record, and staff assignment path against IPM's operating model.
- Keep provider credentials server-side and continue to fail closed if Google ADC, the selected provider, or essential configuration is unavailable.
- Finalise an IPM-approved audio and transcript retention policy before handling real patient data: private storage, encryption, authorized playback, retention duration, deletion, legal holds, access reviews, and incident response.
- Add privacy-safe monitoring and security procedures: secret rotation, access auditing, error tracking that avoids raw audio and unnecessary health data, and tested incident-handling runbooks.

### Phase 3 — Reliable care operations

- Add resilient upload and stream handling, including retry, reconnection, reconciliation, duplicate prevention, and cleanup for incomplete recordings or orphaned records.
- Build a supervised operational dashboard for duty rosters, service areas, availability, unassigned urgent cases, callbacks, and confirmed task outcomes.
- Add explicit failure workflows so a call handler can capture notes and notify a clinician when transcription, connectivity, or a provider is unavailable.
- Support clinician feedback on transcript quality, extracted evidence, policy matches, overrides, and care outcomes. That feedback will guide policy updates and accuracy reviews rather than silently changing clinical decisions.
- Explore approved telephone-system integration only after the browser-microphone workflow, consent process, privacy controls, and clinical review process have passed a supervised pilot.

### Phase 4 — Deployment and continuous evaluation

- Deploy the web application and gateway with separate development, staging, and production configuration, server-only secrets, health checks, backups, and controlled release procedures.
- Run a limited, supervised pilot using explicitly consented calls. Review clinician agreement with proposed priority, time-to-review, task completion, false escalations, missed policy signals, and provider reliability.
- Publish regular safety and quality reviews with IPM. Policy changes will be versioned, traceable to approval, and evaluated before they are used in a live workflow.
- Expand to additional languages, caregiver handoff tools, and community-care coordination only when the core triage workflow demonstrates safety, usefulness, and operational fit.

## Additional Notes

- The current policy phrases are fictional demonstration content. IPM must supply and approve the real severity rubric, consent language, and referral pathways before any pilot.
- The app fails closed when Google ADC or required server configuration is unavailable.
- The repository includes recording-storage scaffolding, but real patient audio must remain disabled until IPM approves retention, deletion, encryption, access review, and incident procedures.
- The Supabase audio migration requires a small correction before it is applied: `public.call_record` should be `public.call_recording` in the grant statement.
- This project must never be used for autonomous diagnosis, emergency decisions, hospital referral, care dispatch, or clinical advice.
