# How to use FRD (for agents and humans)

## What FRD is

An **FRD** (Functional Requirements Document) describes *what* Phase-1 OneView must do: screens, fields, roles, calculations, business rules, and exceptions. **UI PDFs** show intended layout and interaction.

They do **not** replace code, Prisma schema, or APIs. They guide implementation and gap analysis against the **already-built** app.

## Where specs live

All Phase-1 PDFs: [`docs/specs/`](./README.md)  
Gap checklist (living): [`docs/frd-gap-checklist.md`](../frd-gap-checklist.md)

## When to open an FRD

- Behavior is ambiguous (mock vs live vs “what should happen?”)
- Implementing or fixing a feature tied to a FR ID (e.g. `ECP-013`, `WCI-012`, `RDR-003`)
- User asks to “align with FRD” or “check against requirements”
- UI and data disagree — **FRD wins** unless the user explicitly overrides

## How to apply FRD to developed code

FRD is applied by **compliance / gap analysis**, not by loading PDFs into Postgres.

1. **Pick the module PDF** from the inventory in `docs/specs/README.md`.
2. **Map FR rows → routes / APIs / tables** (use `reference.md`, `routes.tsx`, Prisma).
3. **Classify each Must requirement:** Match | Partial | Missing | Differs.
4. **Implement only what the user asked** — prefer smallest change; do not mass-refactor to “match FRD” unprompted.
5. **Update `docs/frd-gap-checklist.md`** when a gap closes or a new FRD divergence is confirmed.
6. **Verify** with UI + DB (or API smoke), then prompt-log.

### Prompt patterns

```text
Read docs/specs/phase1-weeklyci-frd.pdf for WCI queue rules.
Compare to current Weekly Check-In implementation.
Fix only: [specific gap]. Preserve other behavior.
```

```text
Per docs/specs/phase1-cockpit-frd.pdf ECP-005–012,
wire Daily Operational Snapshot cards to live data.
Do not change Weekly Operational Excellence (already live).
```

## What not to do

- Do not invent runtime “FRD sync” or store PDF text in the database
- Do not redesign brand/theme because a UI PDF looks different from `docs/theme.md` unless asked
- Do not treat Should/Could priorities as Must unless the user says so
- Do not delete working screens that exceed FRD without asking

## Related docs

- `AGENTS.md` — agent entrypoint (points here)
- `.cursor/skills/oneview-dev/SKILL.md` + `reference.md`
- `docs/acceptance-checklist.md` — production readiness
- `docs/screen-data-persistence-audit.md` — persistence wiring status
