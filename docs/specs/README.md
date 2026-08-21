# Phase-1 product specs (FRD / UI)

Canonical location for OneView Phase-1 **Functional Requirements Documents (FRD)** and **UI** PDFs.

These files are the **product source of truth** when behavior is ambiguous (UI mock, code, or DB disagree). They are **design-time** specs — the running app does not load them at runtime.

## Inventory

| File | Covers | App routes / areas |
|------|--------|--------------------|
| `RMS-FRD-v1.pdf` | Full RMS FRD (org, employees, planning, confirmations, utilization, RBAC, etc.) | Masters, Employees, Projects, Planner, Availability, Utilization, Confirmations, Settings |
| `phase1-cockpit-frd.pdf` | Executive Cockpit / My Workspace FRD | `/cockpit` |
| `phase1-cockpit-ui.pdf` | Cockpit UI reference | `/cockpit` |
| `phase1-report1-frd.pdf` | Resource Deployment Report (RDR) | `/reports/deployment` |
| `phase1-report1-ui.pdf` | RDR UI | `/reports/deployment` |
| `phase1-report2-frd.pdf` | Resource Performance Report | `/reports/performance` |
| `phase1-report2-ui.pdf` | Performance UI | `/reports/performance` |
| `phase1-report3-frd.pdf` | Project Execution Report | `/reports/execution` |
| `phase1-report3-ui.pdf` | Execution UI | `/reports/execution` |
| `phase1-weeklyci-frd.pdf` | Weekly Check-In FRD | `/my-team/weekly-check-in*`, `/masters/weekly-check-in` |
| `phase1-weeklyci-ui.pdf` | Weekly Check-In UI | same |
| `phase1-workdaysummary-frd.pdf` | Workday Summary Report | `/reports/workday-summary` |
| `phase1-emp2prj-frd.pdf` | Map Employees to Projects utility | `/projects` (Map Employees modal); Work Allocation project filter |

## How agents should use FRD

See **[How to use FRD](./HOW-TO-USE-FRD.md)** and the living gap list **[`docs/frd-gap-checklist.md`](../frd-gap-checklist.md)**.

## Precedence

1. Explicit user instruction for this prompt  
2. FRD / UI PDF for the affected module (this folder)  
3. `AGENTS.md` + `.cursor/skills/oneview-dev/` + `.cursor/rules/`  
4. Existing implemented behavior (preserve unless FRD says otherwise and the user asked to align)
