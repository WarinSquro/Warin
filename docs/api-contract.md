# OneView API contract (draft)

Draft HTTP contract for the upcoming API. Base URL: `VITE_API_BASE_URL` (default `http://localhost:3001/api`).

Status: **not implemented yet** — frontend still uses mocks. Align implementations with this doc and `data/navConfig.ts` permission keys.

## Conventions

| Topic | Rule |
|-------|------|
| Format | JSON (`Content-Type: application/json`) |
| Errors | `{ "error": { "code": "string", "message": "string" } }` |
| Auth | Session after login (prefer httpOnly cookie; Bearer token acceptable for early API) |
| IDs | Employee HRMS ids (`EMP-1042`), project ids (`PRJ-014`) as in seed |
| Permissions | Keys match `PERMISSION_PAGES` (e.g. `planner`, `reports.deployment`) |

### Error codes (initial)

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing/invalid session |
| `FORBIDDEN` | 403 | Authenticated but lacking permission |
| `INVALID_CREDENTIALS` | 401 | Bad email/PIN |
| `VALIDATION_ERROR` | 400 | Bad request body |
| `NOT_FOUND` | 404 | Unknown resource |

---

## Auth

### `POST /auth/login`

**Body**

```json
{ "email": "admin@acme.io", "pin": "12345" }
```

**200**

```json
{
  "user": {
    "id": "EMP-0001",
    "name": "Administrator",
    "email": "admin@acme.io",
    "isSuperAdmin": true,
    "permissionKeys": ["my_workspace", "planner"]
  }
}
```

For super admin, `permissionKeys` may be omitted or list all assignable keys; client treats `isSuperAdmin` as full access.

**401** — `INVALID_CREDENTIALS`  
Never return `pin` or `pin_hash`.

### `POST /auth/logout`

Clears session. **204** or **200**.

### `GET /auth/me`

**200** — same `user` shape as login. **401** if not signed in.

### `POST /auth/forgot-pin` (later)

```json
{ "email": "ravi.sharma@acme.io" }
```

Always return a generic success message (no email enumeration). Implementation TBD for local/dev.

---

## Masters

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| `GET` | `/departments` | `masters.departments` | Include inactive optional `?status=` |
| `POST` / `PATCH` | `/departments` | same | Disable via `status`, never hard-delete |
| `GET` | `/skills` | `masters.skills` | |
| `GET` | `/activities` | `masters.activities` | Include milestone join |
| `GET` | `/employees` | `employees` | Skills + resource owner |
| `POST` / `PATCH` | `/employees` | `employees` | Bulk upload later |
| `GET` | `/projects` | `projects` | Milestones + demand lines |
| `POST` / `PATCH` | `/projects` | `projects` | |

### Employee shape (response)

```json
{
  "id": "EMP-1042",
  "name": "Ravi Sharma",
  "email": "ravi.sharma@acme.io",
  "departmentId": "dept-1",
  "departmentName": "Engineering",
  "resourceOwnerId": "EMP-1088",
  "status": "active",
  "skills": ["React", "Node.js", "AWS"],
  "utilization": 110
}
```

---

## Access rights

| Method | Path | Permission |
|--------|------|------------|
| `GET` | `/access-rights/:employeeId` | `access_rights` (super admin) |
| `PUT` | `/access-rights/:employeeId` | same |

**PUT body**

```json
{ "permissionKeys": ["my_workspace", "planner", "confirmations"] }
```

---

## Settings

| Method | Path | Permission |
|--------|------|------------|
| `GET` | `/settings` | `settings` |
| `PUT` | `/settings` | `settings` |

Maps to `app_settings` + `company_off_days`.

---

## Planning / reports / weekly check-in

Endpoints will be added when those tables exist. Until then screens keep using `data/*` mocks.

Suggested future prefixes:

- `/planner/...`
- `/confirmations/...`
- `/reports/deployment|performance|execution|daily-work`
- `/weekly-check-in/...`

---

## OpenAPI

When the API server lands, export OpenAPI 3 from route definitions and link it here (`docs/openapi.yaml` or generated).
