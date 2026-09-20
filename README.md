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

## Additional Notes

- The current policy phrases are fictional demonstration content. IPM must supply and approve the real severity rubric, consent language, and referral pathways before any pilot.
- The app fails closed when Google ADC or required server configuration is unavailable.
- The repository includes recording-storage scaffolding, but real patient audio must remain disabled until IPM approves retention, deletion, encryption, access review, and incident procedures.
- The Supabase audio migration requires a small correction before it is applied: `public.call_record` should be `public.call_recording` in the grant statement.
- This project must never be used for autonomous diagnosis, emergency decisions, hospital referral, care dispatch, or clinical advice.
