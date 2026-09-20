# API reference

All routes are relative to the Next.js origin, for example `http://localhost:3000`. JSON responses use `Content-Type: application/json`. Unless a route says otherwise, errors have this shape:

```json
{
  "error": "Human-readable explanation"
}
```

## Authentication and sessions

### GET `/api/auth/google`

Starts the custom Google OAuth flow. The server creates a PKCE verifier and state cookie, then redirects to Google. The callback is derived from the incoming host, so configure both local and public redirect URIs.

Required server configuration:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET` for the callback exchange
- `AUTH_JWT_SECRET` with at least 32 characters
- Supabase server credentials for `app_user` and `app_session`

### GET `/api/auth/google/callback`

Consumes Google's authorization code, verifies the stored PKCE state, upserts the application user, rotates application sessions, and redirects to `/`. Do not call this route directly from application code.

### GET `/api/auth/session`

Returns the authenticated application user and refreshes the access cookie when necessary.

```json
{
  "user": {
    "id": "uuid",
    "name": "Meera Krishnan",
    "role": "patient",
    "email": "patient@example.test"
  }
}
```

An unauthenticated request returns:

```json
{ "user": null }
```

The browser receives HTTP-only `care_access_token` and `care_refresh_token` cookies; it does not receive a Supabase service-role key.

### GET, POST, DELETE `/api/session`

Demo-only role session. This route is not an authentication substitute.

`GET` returns the demo user selected by the `care_demo_user` cookie. `POST` accepts one of `patient`, `caretaker`, or `clinician`:

```json
{ "role": "patient" }
```

`DELETE` clears the demo cookie. Demo mode is useful for the local workflow and must be disabled or isolated before a pilot.

### GET `/api/health`

Unauthenticated liveness check:

```json
{
  "status": "ok",
  "service": "24-care-triage-demo",
  "mode": "demo_only"
}
```

## Assessment and cases

### POST `/api/assess`

Assesses a non-empty transcript with the deterministic policy engine. The route can run without authentication when no `caseId` is provided.

Request:

```json
{
  "transcript": "Caller reports that the pain suddenly became much worse.",
  "caseId": "optional-case-uuid"
}
```

Response includes `assessment`, `triage`, and policy metadata:

```json
{
  "mode": "demo_only",
  "policy": {
    "version": "demo-policy-2026-09",
    "approvalStatus": "fictional_training_only"
  },
  "assessment": {},
  "triage": {}
}
```

If `caseId` is included, the caller must be authenticated and authorized for that case. Invalid JSON, an empty transcript, missing authentication for persistence, or inaccessible cases return `400`, `401`, or `403`.

### POST `/api/cases`

Creates a persisted case for an authenticated `patient` or `caretaker`. The server recomputes the assessment and policy result; clients cannot choose the priority.

Request:

```json
{
  "caseAlias": "Meera Krishnan",
  "relationship": "Patient",
  "callback": "+91 masked callback",
  "transcript": "Caller describes what is happening.",
  "intakeConsent": true,
  "patientId": "optional-patient-uuid-for-an-authorized-caretaker"
}
```

The route creates:

1. `care_case` with status `review`.
2. `consent_record` with intake consent and recording consent false.
3. A final `transcript_segment`.
4. An `assessment` containing the policy result.
5. An `audit_event` recording submission.

Success returns `201` with `case`, `assessment`, and `triage`. Authentication, consent, relationship authorization, or input failures return `400`, `401`, or `403`.

### GET `/api/cases`

Returns cases with status `review` or `open` for authenticated `clinician`, `care_coordinator`, or `admin` users. Results are ordered newest first.

### GET `/api/cases/{id}`

Returns one persisted case, its ordered transcript segments, and the latest assessment. Requires a review role. Returns `404` when the case does not exist.

### POST `/api/cases/{id}/transcript`

Appends a transcript segment to an accessible case. The route accepts text, optional language (`ml`, `en`, or `mixed`), status (`partial` or `final`), speaker, and optional provider item ID. Empty text and invalid values are rejected.

### POST `/api/cases/{id}/decision`

Records the required human confirmation step. Requires `clinician`, `care_coordinator`, or `admin`.

Request:

```json
{
  "outcome": "confirmed",
  "note": "Reviewed the evidence and current policy version."
}
```

`outcome` must be `confirmed` or `overridden`; `note` must be non-empty. The route writes a `clinical_decision`, updates the case status, creates a `care_task`, and appends an `audit_event` as one server-side workflow. It returns `502` if persistence fails.

## Audio and live voice

### POST `/api/recordings`

Creates a recording metadata row. Requires an authenticated care account and `consent: true`.

Request:

```json
{
  "consent": true,
  "caseId": "optional-case-uuid",
  "contentType": "audio/webm;codecs=opus"
}
```

Supported content types are `audio/webm`, `audio/webm;codecs=opus`, `audio/ogg`, and `audio/mp4`. The response is `201` and contains the recording ID and private storage prefix.

### POST `/api/recordings/{id}/chunks`

Accepts `multipart/form-data`:

| Field | Required | Description |
| --- | --- | --- |
| `audio` | Yes | Browser audio `File` |
| `sequence` | Yes | Non-negative integer; unique within the recording |
| `durationMs` | No | Elapsed recording duration |
| `transcriptSoFar` | No | Prior transcript context for the provider |
| `isFinal` | No | Marks the chunk as final when true |

The server verifies ownership or review access, writes the raw object below `{userId}/{recordingId}/`, records chunk metadata, and processes the chunk unless the query string contains `rawOnly=true`. A normal response contains `recordingId`, `sequence`, `transcript`, `nextPrompt`, and status.

### POST `/api/recordings/{id}/complete`

Marks an owned or review-authorized recording `ready` and stores its duration. Accepts:

```json
{
  "durationMs": 12500,
  "caseId": "optional-case-uuid"
}
```

### POST `/api/live/session`

Creates a short-lived live provider session. Requires an authenticated care account and `consent: true`.

For Gemini, the response contains:

```json
{
  "provider": "gemini",
  "gatewayUrl": "ws://127.0.0.1:8787/live",
  "gatewayToken": "short-lived-jwt",
  "model": "gemini-3.8-live",
  "instructions": "provider system instructions"
}
```

The gateway token expires after two minutes and is valid only for the Gemini gateway audience. For OpenAI, the route returns a short-lived `clientSecret` instead of a gateway token. Long-lived provider credentials are never returned.

### POST `/api/calls/session`

Optional LiveKit transport experiment. Requires authenticated consent and `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`. Returns a ten-minute room token and dispatches the `24-care-intake` worker. This route is not required by the first-party patient recording path.

## Error handling

| Status | Meaning in this application |
| ---: | --- |
| `400` | Malformed JSON, missing consent, invalid enum, or empty required text |
| `401` | No authenticated application session |
| `403` | Authenticated but role or case authorization is insufficient |
| `404` | Case or recording does not exist or is not visible |
| `502` | Upstream Supabase or provider failure after request validation |
| `503` | Provider or transport is not configured or unavailable |

## Security notes for API clients

- Send cookies with same-origin browser requests; do not copy access or refresh tokens into local storage.
- Do not call Supabase directly from the browser for this workflow.
- Do not trust client-supplied priority, role, policy output, or case ownership.
- Treat transcript and audio as sensitive health-related data.
- Record consent before creating live sessions or recordings.
