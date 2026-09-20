# 24 Care documentation

This directory documents the 24 Care triage assistant MVP: how to run it, how a request moves through the system, which API routes exist, how authentication and storage are enforced, and what must change before a pilot.

## Read this first

1. [Operations and local setup](./operations.md) — install, environment variables, Google OAuth, Supabase, ADC, voice gateway, and troubleshooting.
2. [Architecture](./architecture.md) — runtime components, call and persistence flows, provider boundaries, and data lifecycle.
3. [API reference](./api.md) — route contracts, required authentication, request bodies, responses, and common errors.

## Product boundary

24 Care is a clinician-reviewed intake workflow, not a diagnostic, emergency-dispatch, referral, or autonomous-care system. The application can collect consented information, transcribe or assess it, prepare a policy result, and place the case in a clinician queue. A clinician must confirm or override the prepared action before a care task is created.

The current repository is an MVP. It contains demo role switching, a custom Google OAuth session, Supabase persistence, private Supabase Storage audio, Gemini/OpenAI provider adapters, and a browser voice surface. It does not provide a telephone carrier, real emergency dispatch, a production retention worker, or a production-grade clinical policy.

## Documentation conventions

- Commands assume PowerShell on Windows and Bun unless the section says otherwise.
- Paths are relative to the repository root.
- Secrets are represented by descriptive values; never commit real credentials.
- `demo_only` means the result is intentionally fictional or local and must not be treated as clinical advice.
- API errors are JSON objects with an `error` string unless noted otherwise.

## Source of truth

Implementation is the source of truth for behavior. When documentation and code disagree, verify the route or component before changing either. Database changes are migration-first: review the files under `supabase/migrations/` and apply them with the Supabase CLI rather than editing `supabase/schema.sql` directly.
