# Operations and local setup

## Prerequisites

Install the following before starting:

- Windows PowerShell.
- Bun compatible with the repository lockfile.
- A Google Cloud project with Vertex AI enabled when using Gemini ADC.
- Google Cloud CLI (`gcloud`) for local ADC.
- A Supabase project and Supabase CLI for database/storage migrations.
- A Google OAuth Web application client for real sign-in.
- Docker only if the optional self-hosted LiveKit path is used.

The default local workflow does not need LiveKit. It needs Next.js, Supabase configuration, Google OAuth for persistent accounts, and the Gemini gateway for live voice.

## Install and run the web app

From the repository root:

```powershell
bun install
bun run dev
```

Open:

```text
http://localhost:3000
```

The production-shaped local check is:

```powershell
bun run build
bun run start
```

Use one package manager in a checkout. `npm install` and `npm run dev` are supported, but mixing `npm` and `bun` lockfiles can produce inconsistent dependency resolution.

## Environment configuration

Copy the template and fill only server-side values:

```powershell
Copy-Item .env.example .env.local
```

| Variable | Required for | Default | Purpose |
| --- | --- | --- | --- |
| `AI_PROVIDER` | AI paths | `gemini` | Selects `gemini` or `openai` |
| `GEMINI_MODEL` | Gemini recorded path | `gemini-3.8-flash` | Recorded transcription and text processing |
| `GEMINI_LIVE_MODEL` | Gemini live path | `gemini-3.8-live` | Native audio-to-audio Live API model |
| `GEMINI_LIVE_VOICE` | Optional LiveKit/Gemini setup | `Puck` | Provider voice preference where supported |
| `GOOGLE_CLOUD_PROJECT` | Gemini | none | Vertex project ID |
| `GOOGLE_CLOUD_LOCATION` | Gemini | `us-central1` | Vertex region |
| `GOOGLE_GENAI_USE_VERTEXAI` | Gemini | `true` | Documents Vertex/ADC mode |
| `LIVE_GATEWAY_URL` | Gemini live | `ws://127.0.0.1:8787/live` | Browser-to-gateway WebSocket URL |
| `LIVE_GATEWAY_PORT` | Gemini live | `8787` | Bun gateway listener |
| `SUPABASE_SECRET_KEY` | Authenticated persistence | none | Modern server-only Supabase secret key |
| `SUPABASE_SERVICE_ROLE_KEY` | Authenticated persistence | none | Legacy server-only Supabase service-role fallback |
| `SUPABASE_STORAGE_BUCKET` | Audio | `care-audio` | Private raw audio bucket |
| `GOOGLE_CLIENT_ID` | Google sign-in | none | OAuth web client ID |
| `GOOGLE_CLIENT_SECRET` | Google sign-in | none | OAuth web client secret |
| `NEXT_PUBLIC_APP_URL` | Public deployment | none | Canonical app URL; do not use this for secrets |
| `AUTH_JWT_SECRET` | Custom auth and Gemini gateway | none | At least 32 random characters |
| `AUTH_REFRESH_SECRET` | Custom auth | none | At least 32 independent random characters |
| `OPENAI_API_KEY` | OpenAI provider | none | Server-only OpenAI credential |
| `OPENAI_MODEL` | OpenAI recorded path | `gpt-4.1-mini` | Responses API model |
| `OPENAI_TRANSCRIPTION_MODEL` | OpenAI recorded path | `gpt-4o-mini-transcribe` | Audio transcription model |
| `OPENAI_LIVE_MODEL` | OpenAI live path | `gpt-realtime` | Realtime model |
| `OPENAI_REALTIME_VOICE` | OpenAI live path | `marin` | Realtime output voice |
| `LIVEKIT_URL` | Optional LiveKit | none | Server LiveKit URL |
| `NEXT_PUBLIC_LIVEKIT_URL` | Optional LiveKit | none | Browser LiveKit URL |
| `LIVEKIT_API_KEY` | Optional LiveKit | none | Server LiveKit API key |
| `LIVEKIT_API_SECRET` | Optional LiveKit | none | Server-only LiveKit secret |

Never prefix a secret with `NEXT_PUBLIC_`. Next.js exposes variables with that prefix to the browser bundle.

## Configure custom Google OAuth

Create a Google OAuth **Web application** client. Register both origins:

```text
https://24care.busundo.org
http://localhost:3000
```

Register both redirect URIs:

```text
https://24care.busundo.org/api/auth/google/callback
http://localhost:3000/api/auth/google/callback
```

Copy the JSON client's `web.client_id` and `web.client_secret` into `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

The application uses Google only for identity verification. It creates and manages its own `app_user` and `app_session` records. Supabase Auth provider configuration is not required for this custom session flow.

## Configure Supabase

Link the local repository to the target project, then review migrations before applying them:

```powershell
supabase login
supabase init
supabase link --project-ref <project-ref>
supabase db push
```

The migration sequence creates:

1. Care workflow tables, role functions, and RLS.
2. Authorization hardening in the private schema.
3. The private `care-audio` bucket and recording/chunk tables.
4. Custom application user and refresh-session tables.

Verify that the bucket is private and that the service key is not present in browser-exposed variables. The canonical schema file is intentionally non-executable; migration history is the source of truth.

## Configure Google ADC and Gemini Live

Authenticate ADC on the machine running the gateway:

```powershell
gcloud auth application-default login
gcloud auth application-default print-access-token
```

Set at minimum:

```env
AI_PROVIDER=gemini
GOOGLE_CLOUD_PROJECT=<project-id>
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_GENAI_USE_VERTEXAI=true
GEMINI_MODEL=gemini-3.8-flash
GEMINI_LIVE_MODEL=gemini-3.8-live
LIVE_GATEWAY_URL=ws://127.0.0.1:8787/live
LIVE_GATEWAY_PORT=8787
AUTH_JWT_SECRET=<32-or-more-random-characters>
AUTH_REFRESH_SECRET=<32-or-more-different-random-characters>
```

Start the gateway in a second terminal:

```powershell
bun run voice:dev
```

Expected output includes the gateway port and selected model. The gateway must be running before an authenticated user starts a Gemini Live call. Restart it after changing `GEMINI_LIVE_MODEL` because the model is read at process startup.

## Run the optional LiveKit path

The patient recording path does not need LiveKit. To run the optional local transport:

```powershell
docker compose -f docker-compose.livekit.yml up -d
bun run agent:dev
```

Configure:

```env
LIVEKIT_URL=ws://127.0.0.1:7880
NEXT_PUBLIC_LIVEKIT_URL=ws://127.0.0.1:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

Stop it with:

```powershell
docker compose -f docker-compose.livekit.yml down
```

A production LiveKit deployment needs trusted TLS, public networking, TURN, monitoring, and a controlled agent deployment. Treat this path as experimental until those controls are tested.

## Validation commands

Run the checks that match the changed surface:

```powershell
bun run typecheck
bun run agent:typecheck
bun run test
bun run test:e2e
bun run build
```

The end-to-end script exercises consent, policy preparation, clinician confirmation, task creation, and mobile layout. It does not prove production provider quality, Malayalam accuracy, emergency behavior, or storage retention.

## Troubleshooting

### Another Next.js server is running

Next.js writes the owning process and log path in the error. Use the existing server if it is the same checkout. Otherwise stop the reported process from PowerShell and start one server:

```powershell
taskkill /PID <reported-pid> /F
bun run dev
```

Do not kill an unverified process.

### Port 8787 is already in use

A Gemini gateway is already running or another process owns the port. Use the existing gateway if it was started from this checkout. Otherwise stop the process that owns the port, then run:

```powershell
bun run voice:dev
```

Changing only `LIVE_GATEWAY_PORT` is insufficient unless `LIVE_GATEWAY_URL` is changed to the same port and the Next.js process is restarted.

### Cloudflare hostname blocks Next.js HMR

For local development behind the `24care.busundo.org` tunnel, `next.config.ts` allows that development origin. Restart Next.js after changing the config. A `GET / 200` proves the tunnel reached the app; HMR warnings are separate from application routing.

### Google redirects with `redirect_uri_mismatch`

The redirect URI must exactly match the origin and path used by the browser:

```text
http://localhost:3000/api/auth/google/callback
https://24care.busundo.org/api/auth/google/callback
```

Do not register `/auth/callback`; this application uses `/api/auth/google/callback`.

### Google sign-in returns a server error about `app_user`

The custom-auth migration has not been applied to the linked Supabase project. Review and apply migrations, then retry sign-in:

```powershell
supabase db push
```

### Gemini Live cannot connect

Check all of the following:

1. `gcloud auth application-default login` completed on the gateway machine.
2. Vertex AI is enabled for `GOOGLE_CLOUD_PROJECT`.
3. The ADC identity can use Vertex AI.
4. `AUTH_JWT_SECRET` is at least 32 characters and identical between Next.js and the gateway.
5. `LIVE_GATEWAY_URL` points to the running gateway.
6. `GEMINI_LIVE_MODEL` is available in the configured Vertex location.
7. The browser has microphone permission.

The browser receives a provider error, but ADC credentials and provider keys must be debugged on the server/gateway rather than copied into the browser.

### Audio uploads return 401, 403, or 502

- `401`: the custom application session is missing or expired.
- `403`: the user does not own the recording/case and is not a review role.
- `502`: Supabase Storage, database, or the configured AI provider failed.

Check the private bucket name, service key, migration state, and server logs. Do not make the bucket public as a shortcut.

### Call ends without a case

The live path must have a non-empty transcript before assessment can be submitted. Inspect the live transcript and recording completion response. A production implementation needs an explicit fallback for silent calls, failed transcription, partial uploads, and provider disconnects.

## Production readiness checklist

Before real patient data or a public pilot:

- Replace demo role cookies and local storage with enforced authenticated workflows.
- Review every RLS policy and case relationship against the intended organization model.
- Configure private bucket retention, deletion, legal hold, and access auditing.
- Add upload retry/reconciliation and orphan-record cleanup.
- Evaluate Malayalam, mixed-language, noisy-audio, interruption, silence, and emergency scenarios with clinician-approved data.
- Establish human escalation, callback, outage, and emergency instructions.
- Add monitoring without logging raw audio, tokens, or unnecessary health information.
- Rotate secrets and document incident response.
- Obtain clinical, privacy, and legal approval for the policy and retention model.
