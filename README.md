# 24 Care triage assistant

24 Care is a safety-first web MVP for a clinician-reviewed care-intake workflow. Patients and caretakers can submit a guided request or start a consented browser voice call. The system stores evidence, prepares a deterministic policy result, and routes the case to a clinician. A care task is created only after a clinician confirms or overrides the proposed action.

> **Safety boundary:** This is not a diagnostic system, emergency dispatcher, telephone helpline, referral engine, or autonomous care system. The current policy is fictional training data. Do not use this repository with real patient data without clinical, privacy, security, retention, and legal approval.

## Quick start

### Web application

```powershell
bun install
bun run dev
```

Open:

```text
http://localhost:3000
```

### Gemini Live gateway

The browser live-call path uses a server-side Bun gateway. Start it in a second terminal after configuring ADC and `.env.local`:

```powershell
gcloud auth application-default login
bun run voice:dev
```

The default local gateway is:

```text
ws://127.0.0.1:8787/live
```

### Checks

```powershell
bun run typecheck
bun run agent:typecheck
bun run test
bun run test:e2e
bun run build
```

## Documentation map

- [Documentation index](./docs/README.md)
- [Architecture and data flows](./docs/architecture.md)
- [API reference](./docs/api.md)
- [Operations, configuration, and troubleshooting](./docs/operations.md)
- [UI source register](./sources.md)

Start with the operations guide for a clean machine setup. Read the architecture guide before changing authentication, audio, provider, or persistence boundaries.

## Demo workflow

1. The default screen is the clinician workspace. Use the role selector to switch to **Patient** or **Caretaker**.
2. Enter a case alias and callback reference.
3. Accept the intake notice.
4. Choose guided intake, recorded AI intake, or live AI call when authenticated and configured.
5. Answer the structured questions or speak naturally. Live and recorded AI prompts are Malayalam-first; mixed Malayalam/English callers receive Malayalam replies unless they request English.
6. Submit the request for clinician review.
7. Switch to **Clinician**, open the review queue, and inspect transcript, assessment, policy signals, and follow-ups.
8. Confirm or override the prepared action with a note.
9. Open **Coverage & tasks** to see the task and audit trail.

Without an authenticated account, the role selector uses a demo-only HTTP-only cookie and local browser state. Demo mode is for UI evaluation only; it is not an identity system.

## What is implemented

- Next.js responsive web application with installable manifest.
- Mobile-first patient, caretaker, and clinician surfaces.
- Custom Google OAuth with PKCE, short-lived access JWTs, rotating refresh sessions, and HTTP-only cookies.
- Supabase PostgreSQL persistence through server-side REST calls.
- Supabase private `care-audio` Storage bucket for consented raw audio chunks.
- Consent-gated guided intake with typed answers and browser speech synthesis.
- Browser live-call UI with duration, mute, cancel, red end-call action, transcript, and completion state.
- Gemini Vertex AI ADC provider path using `gemini-3.8-flash` for recorded processing and `gemini-3.8-live` for native audio Live API calls.
- Optional OpenAI recorded and Realtime provider path behind `AI_PROVIDER=openai`.
- Optional LiveKit transport experiment under `agent/`; it is not required by the first-party patient recording path.
- Deterministic fictional policy engine for immediate, urgent, same-day, routine, and insufficient-information outcomes.
- Clinician confirmation/override gate before task creation.
- Audit trail and review queue.

## Technology and runtime

| Layer | Implementation |
| --- | --- |
| Web runtime | Next.js 16, React 19, TypeScript |
| Package/runtime tooling | Bun; npm remains compatible |
| Authentication | Custom Google OAuth and application sessions |
| Database | Supabase PostgreSQL with RLS migrations |
| Object storage | Supabase Storage, private `care-audio` bucket |
| Live voice | Gemini Live through local Bun gateway, or OpenAI Realtime WebRTC |
| Recorded processing | Gemini Vertex ADC or OpenAI provider adapter |
| Optional transport | LiveKit client, server SDK, and worker |
| Testing | Node test runner through `tsx`, Playwright smoke script, TypeScript |

## Configuration summary

Copy the template:

```powershell
Copy-Item .env.example .env.local
```

Gemini/Vertex ADC configuration:

```env
AI_PROVIDER=gemini
GEMINI_MODEL=gemini-3.8-flash
GEMINI_LIVE_MODEL=gemini-3.8-live
GOOGLE_CLOUD_PROJECT=<project-id>
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_GENAI_USE_VERTEXAI=true
LIVE_GATEWAY_URL=ws://127.0.0.1:8787/live
LIVE_GATEWAY_PORT=8787
AUTH_JWT_SECRET=<at-least-32-random-characters>
AUTH_REFRESH_SECRET=<different-at-least-32-random-characters>
```

Server-only persistence and OAuth values:

```env
SUPABASE_SECRET_KEY=<server-only-supabase-secret>
SUPABASE_STORAGE_BUCKET=care-audio
GOOGLE_CLIENT_ID=<oauth-web-client-id>
GOOGLE_CLIENT_SECRET=<oauth-web-client-secret>
NEXT_PUBLIC_APP_URL=https://24care.busundo.org
```

OpenAI is optional:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=<server-only-openai-key>
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_LIVE_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=marin
```

Never expose service keys, provider API keys, OAuth client secrets, ADC files, refresh tokens, or `AUTH_*` secrets through `NEXT_PUBLIC_*` variables.

## Google OAuth URLs

For the public domain and local development, configure these Google OAuth Web application values.

Authorized JavaScript origins:

```text
https://24care.busundo.org
http://localhost:3000
```

Authorized redirect URIs:

```text
https://24care.busundo.org/api/auth/google/callback
http://localhost:3000/api/auth/google/callback
```

The callback is `/api/auth/google/callback`, not `/auth/callback`. Google verifies identity; the application creates its own `app_user`, profile role, access token, and refresh session. Supabase Auth provider configuration is not required.

## Supabase setup

Link the target project and apply reviewed migrations:

```powershell
supabase login
supabase init
supabase link --project-ref <project-ref>
supabase db push
```

The migration history creates the care workflow schema, custom application sessions, RLS authorization functions, recording metadata, and the private `care-audio` bucket. `supabase/schema.sql` is intentionally non-executable; migrations are canonical.

## Live provider behavior

### Gemini

The default path uses Google ADC, not a browser API key:

```powershell
gcloud auth application-default login
```

- `gemini-3.8-flash`: recorded audio/text processing and follow-up generation.
- `gemini-3.8-live`: low-latency audio-to-audio conversation through `voice-gateway.ts`.
- `voice-gateway.ts`: verifies a two-minute application JWT, opens the Vertex Live session, forwards 16 kHz PCM input, and returns 24 kHz response audio/transcripts.
- Malayalam is the default live response language; English is used only when requested or clearly spoken throughout.

### OpenAI

The OpenAI path requires a server-only `OPENAI_API_KEY`. The live browser path receives a short-lived client secret from `POST /api/live/session`; the long-lived key never reaches the browser.

The provider-independent safety boundary remains in application code: consent, authorization, deterministic policy assessment, clinician confirmation, task creation, and auditing do not depend on the model vendor.

## Audio and data handling

For an authenticated recorded or live call:

1. The API creates a `call_recording` metadata row after consent.
2. The browser records audio with `MediaRecorder`.
3. Chunks are uploaded sequentially to private Supabase Storage under `{userId}/{recordingId}/`.
4. Chunk metadata and processed transcript fragments are persisted in PostgreSQL.
5. On call end, queued uploads finish and the recording is marked ready.
6. The transcript is assessed and submitted to the clinician review queue.

Raw audio is sensitive health-related data. The MVP does not yet provide a complete retention/deletion worker, legal hold model, incident response process, or production access-review workflow.

## Production boundary

Before a pilot, the team must:

- Replace demo role switching and local storage with fully enforced organization-aware authorization.
- Review patient/caretaker relationship workflows and every RLS policy.
- Configure private bucket retention, deletion, encryption, access review, and audit export.
- Add upload retry, orphan-record reconciliation, provider timeout handling, and outage fallback.
- Test Malayalam, mixed-language, noisy, incomplete, silent, urgent, and possible-emergency calls with clinician-approved evaluation data.
- Define callback, clinician escalation, emergency, and service-outage procedures.
- Keep raw audio, transcripts, tokens, and health data out of routine logs.
- Obtain clinical, privacy, security, and legal approval before real patient use.

The system must never be represented to a caller as a doctor, emergency service, guaranteed response, or autonomous decision-maker.
