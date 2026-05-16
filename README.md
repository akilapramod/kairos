# Kairos

**"Apply less. Land more."** · Team Exitcode0 · Cursor Colombo Buildathon 2026

Kairos is a WhatsApp-first AI career agent. The conversational agent **Kairo** (OpenClaw + Baileys) coordinates job alerts, tailored CV generation, and cover letters. The web dashboard (Next.js + Supabase realtime) handles onboarding and tracking. Job matching and content generation use the **MiniMax** API; data lives in **Supabase** with **pgvector** for semantic matching when enabled.

---

## Monorepo layout

| Path | Purpose | Typical deploy |
|------|---------|----------------|
| `apps/web` | Next.js dashboard (Tailwind + shadcn/ui) | Vercel |
| `apps/poller` | 15-minute job polling worker | Railway |
| `apps/cv-pipeline` | CV YAML → PDF (RenderCV) + MiniMax content | Railway |
| `packages/db` | Supabase migrations, types, seeds | — |
| `packages/minimax` | Shared MiniMax client (scorer, CV, posts) | — |
| `packages/matcher` | Keyword filter, scoring orchestration, pgvector hooks | — |
| `packages/config` | Shared env validation, constants, types | — |
| `agents/kairo` | OpenClaw agent + Baileys WhatsApp runtime | Railway |

---

## Product brief

### The problem

The modern job market rewards speed over qualification. Many candidates discover listings hours after posting and spend hours tailoring documents—by then, strong roles are already screened.

### The solution

Kairos monitors job sources on a schedule, scores listings against a candidate profile (MiniMax + optional pgvector pre-filter), and sends an instant **WhatsApp** alert on strong matches. The user can reply with a single digit; **Kairo** generates a tailored **CV (PDF)** and optional **cover letter** in-thread. The **dashboard** updates in realtime via Supabase.

### Demo script (wow moment)

1. WhatsApp alert: e.g. "87% match — Junior Full-Stack Developer @ Wise. Posted 6 mins ago."
2. User replies: `1`
3. ~60s: `Kavindu_Perera_Wise_2026.pdf` in the thread.
4. Kairo asks about a cover letter; user says `Yes` → text reply.
5. Web dashboard shows the application logged without a manual refresh.

### Differentiators

| Typical tools | Kairos |
|---------------|--------|
| Email digests (slow) | WhatsApp push (minutes after post) |
| Generic templates | AI-tailored CV per job |
| Browser/app context switching | Primary flow in WhatsApp |
| No match score | 0–100 score + fit reasons |
| Manual tracking | Auto-logged dashboard |

---

## Technical architecture

### Layers

- **User**: WhatsApp (Baileys on a dedicated device) + Next.js dashboard (onboarding, jobs, tracker, drafts, sources).
- **Backend**:
  - **Kairo** (OpenClaw): parses WhatsApp intents, triggers CV/cover flows, orchestrates MiniMax where needed.
  - **Poller**: cron (~15 min) — LinkedIn guest API, Greenhouse, Lever, Remotive; dedupe; matching; alerts for score ≥ threshold.
  - **CV pipeline**: `(profile, job)` → MiniMax JSON → RenderCV (EngineeringResumes theme) → PDF.
- **Data**: Supabase + pgvector; embeddings optional for similarity pre-check.

### Matching engine (priority)

1. **Keyword pre-filter** — skills / target_roles vs title & description (cheap).
2. **MiniMax scoring** — structured `{ score, reasons[] }`; threshold default **70**.
3. **Batch scoring** — multiple jobs per call to reduce round-trips.
4. **pgvector** — cosine similarity pre-check before full scoring (when time permits).
5. **Cache** — avoid re-scoring same `(user_id, job_id)`.

### WhatsApp flow (Kairo)

```
Baileys message → OpenClaw intent
  • "1" / "yes" / "generate cv" → CV pipeline
  • "2" / "details" → job from Supabase
  • "3" / "skip" → skip job for user
  • cover-letter context + "yes" → MiniMax cover letter
  • else → Hermes / fallback conversational reply
→ Baileys send → write state to Supabase → dashboard realtime
```

**Baileys**: install only `@whiskeysockets/baileys` (verify package name; typosquat risk). Session dir: `WA_SESSION_PATH` (see `.env.example`). Implement reconnect for idle drops.

### CV pipeline

1. MiniMax: CV content JSON (`summary`, `experience[]`, `skills[]`, `projects[]`).
2. Merge into RenderCV YAML (theme: `EngineeringResumes`).
3. PDF binary → Baileys document; log `cv_version_url` on `applications`.

**Fallback**: if RenderCV fails or times out (~45s), serve a pre-rendered demo PDF.

### Supabase schema (reference)

- `users` — `phone` unique, timestamps.
- `profiles` — user skills, roles, JSON projects, optional `embedding vector(1536)`.
- `jobs` — source, title, company, location, url, description, posted/fetched times.
- `applications` — user/job FKs, `match_score`, `match_reasons[]`, `cv_version_url`, `cover_letter`, `status`.
- `sources` — integrations (Notion, Slack, etc.) with `config` JSONB.

Enable: `CREATE EXTENSION IF NOT EXISTS vector;`

### Environment variables

See [`.env.example`](./.env.example). Minimum: MiniMax keys, Supabase URL + keys, `WA_SESSION_PATH`, polling URL/interval, match threshold, `NEXT_PUBLIC_APP_URL`, RenderCV theme.

### Supabase

Migrations live in [`supabase/migrations/`](./supabase/migrations/). The `@kairos/db` package exports browser, server, and service-role clients.

| Variable | Where | Notes |
|----------|-------|-------|
| `SUPABASE_URL` | Server, workers | Same project URL as public var |
| `SUPABASE_ANON_KEY` | Server | RLS-scoped |
| `SUPABASE_SERVICE_KEY` | Poller, Kairo only | Bypasses RLS; never `NEXT_PUBLIC_*` |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser (`apps/web`) | Must match `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser | Must match `SUPABASE_ANON_KEY` |

**Link your cloud project** (one-time):

```bash
cd kairos
pnpm install
pnpm exec supabase login
pnpm db:link -- --project-ref <your-project-ref>
cp .env.example .env.local   # fill keys from Dashboard → Settings → API
pnpm db:push                 # apply migrations
pnpm db:types                # regenerate packages/db/src/types.ts
pnpm db:seed                 # Kavindu demo (needs service key in .env.local)
```

**Local development** (Docker required):

```bash
npx supabase start
npx supabase db reset        # migrations + supabase/seed.sql
```

**Verification checklist**

- Table Editor: `users`, `profiles`, `jobs`, `applications`, `sources`
- RLS enabled on all five tables
- Realtime: `jobs`, `applications` in `supabase_realtime`
- Auth: new Dashboard user → row in `public.users` + empty `profiles`
- Worker: service client can `INSERT` into `jobs`
- Web: authenticated client reads only own `applications`
- CV pipeline tables: `cv_uploads`, `parsed_cv_data`, `render_jobs`

### Edge Functions

Functions live in [`supabase/functions/`](./supabase/functions/). Heavy RenderCV runs on Railway (`apps/cv-pipeline`); Edge orchestrates storage, MiniMax parse, and callbacks.

| Function | Purpose |
|----------|---------|
| `health` | Liveness check |
| `auth-webhook` | Auth hook fallback for `public.users` / `profiles` |
| `extract-cv` | PDF text extraction → invokes `parse-cv` |
| `parse-cv` | MiniMax structured parse → syncs `profiles` → invokes `render-cv` |
| `render-cv` | Enqueues Railway `/render` |
| `render-callback` | Finalizes `render_jobs` + storage (Railway only) |
| `generate-application-cv` | Tailored CV for `applications` via Railway `/tailor` |

**Local dev:**

```bash
pnpm db:push
pnpm functions:serve          # Edge Functions on :54321/functions/v1/*
pnpm cv-pipeline:dev            # Railway worker locally on :3100
```

Set secrets: `pnpm exec supabase secrets set MINIMAX_API_KEY=... CV_PIPELINE_URL=... CV_PIPELINE_SECRET=...`

**Database webhook** (Dashboard → Database → Webhooks): on `cv_uploads` INSERT → `https://<project>.supabase.co/functions/v1/extract-cv` with service role auth.

**Auth hook** (Dashboard → Auth → Hooks): point to `auth-webhook` with `SUPABASE_AUTH_HOOK_SECRET`.

### Deployment (recommended for hackathon)

- **Vercel**: `apps/web`
- **Railway**: `agents/kairo`, `apps/poller`, `apps/cv-pipeline`
- **Supabase Cloud**: database + realtime
- **Tunnel** (ngrok / Cloudflare): fallback if hosted workers are blocked

---

## Dashboard screens

1. **Onboarding / profile** — uploads, parsing status, editable profile, WhatsApp number, activate CTA.
2. **Job matches + tracker** — live feed with score badges; application table; Supabase realtime; optional 7-day follow-up nudge.
3. **LinkedIn post drafts** — three variants (professional, conversational, technical); copy only, no auto-post.
4. **Sources & integrations** — cards with status (Notion + WhatsApp live where applicable; others "coming soon" but polished).

---

## Team ownership (sprint reference)

| Member | Focus |
|--------|--------|
| A | Next.js UI, Supabase realtime |
| B | Poller, LinkedIn guest API, schema + APIs |
| C | Kairo: OpenClaw, MiniMax wiring, Baileys flows |
| D | Deploy, RenderCV, parsers, demo data, rehearsal |

---

## Demo persona seed: Kavindu Perera

Pre-seed in Supabase before the clock. Example JSON (abbreviated):

```json
{
  "name": "Kavindu Perera",
  "current_role": "Junior Full-Stack Developer",
  "experience_years": 1.5,
  "employer": "PayEase LK",
  "skills": ["React", "Next.js", "TypeScript", "Node.js", "PostgreSQL", "Supabase", "Tailwind CSS"],
  "target_roles": ["Junior Full-Stack Developer", "Frontend Developer", "Full-Stack Engineer"],
  "work_preference": "Remote",
  "career_goal": "Land a remote role at a product-focused international startup paying in USD.",
  "demo_target_job": "Junior Full-Stack Developer @ Wise",
  "expected_match_score": 87
}
```

The PayEase → Wise fintech angle is intentional for a believable high match in demos.

---

## Risk register (summary)

| Risk | Mitigation |
|------|------------|
| LinkedIn rate limits | Cache last response; fall back to Greenhouse/Remotive |
| Baileys session drop | Reconnect logic; dedicated device for demo |
| RenderCV slow/fail | Static PDF fallback |
| MiniMax latency | User-facing "tailoring…" message; timeout + retry |
| Malicious npm typos | Only `@whiskeysockets/baileys` |
| Bad JSON from LLM | Validate + retry |

---

## Open decisions

1. Hosting: Railway vs tunnel mix for workers.
2. MiniMax embedding model for 1536-dim vectors (if using pgvector on profiles).
3. Batch size for multi-job scoring (start ~5).
4. Official judging criteria / pitch script.

---

*Kairos — Apply less. Land more.*  
*Agent: **Kairo** (OpenClaw + Baileys).*  
*Built by Exitcode0 · Cursor Colombo Buildathon 2026*

