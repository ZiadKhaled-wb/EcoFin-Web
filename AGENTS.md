# AGENTS.md — EcoTech Pro (client repo)

*Read by every coding agent (Claude Code, Codex, Gemini, Cursor, others). Fill the `<...>` parts after the audit.*

## STEP 0 — Setup first (mandatory)
Before reading your task, follow **`AGENT_SETUP.md`** exactly:
1. Check the mandatory tools and skills.
2. Install what's missing, or print the commands for the user and stop.
3. Ask the user whether to install the smart-tier tools.
4. Print the setup report and wait for the user's "go".

**No `STATUS: READY` and no "go" means no work.**

## What this is
EcoTech Pro: multi-tenant SaaS POS with in-house installments for Egyptian furniture and electronics shops. This repo is the **client**. The other repo is `EcoFin-API`.

## Then read
1. Your task file (slice, files you may touch, "Done when" checks).
2. The skill for your job:
   - building → `.claude/skills/ecotech-build/SKILL.md`
   - reviewing → `.claude/skills/ecotech-review/SKILL.md`
   (Claude Code loads these as skills; other agents read the files and follow them exactly.)
3. Only your slice in `docs/EcoTech_Pro_Slices.md`.
4. Database: **only** the tables your task names, in `docs/EcoTech_Pro_Data_Model.md` (the source of truth for tables, columns, enums and write functions). Big picture: `docs/EcoTech_Pro_Entities.md`. (Server repo only: don't use `docs/db/initialization-v2.1.sql`; it's deprecated.)
5. How to use each tool: the "How to use the tools" table in `AGENT_SETUP.md`.

## Finding code
- If `graphify-out/GRAPH_REPORT.md` exists, read it first (plain file, no install needed).
- Open only the files your task lists, plus what they import. Smart agents with the graphify CLI can use `graphify query/explain/path`.
- Never read whole folders. Never rebuild or commit `graphify-out/`; the maintainers do that.

## Commands
- Install: `npm ci`
- Dev: `npm run dev`
- Type-check: MISSING
- Lint: `npm run lint`
- Test: MISSING

## Structure
- `src/` — `main.tsx` (providers) and `App.tsx` (router + route guards)
- `src/pages/` — route pages (Dashboard, ModulePlaceholder, DesignSystem); `pages/auth/` holds the 6 auth pages
- `src/components/` — `auth/`, `guards/` (GuestOnly, RequireAuth, RequirePasswordChanged), `layout/` (shell), `ui/` (primitives)
- `src/config/` — `navigation.ts`: menu and role filter
- `src/lib/` — `api.ts` (axios client + token refresh), supabase client, number and validation helpers
- `src/services/` — API call wrappers (`authApi.ts`)
- `src/store/` — zustand stores (`authStore.ts`)
- `src/hooks/` — shared hooks (useCountdown, useTenantSlug)
- `src/types/` — TypeScript types (`auth.ts`, hand-copied from the server)

## Non-negotiable rules
Tenant from token only · decimal money · stock/cash only through ledger inserts · one transaction per multi-table write · idempotency keys · no editing issued documents · types from shared contracts · permission + audit on every write · schema only through new migrations · no hard-coded UI text. Full list: the `ecotech-build` skill.
