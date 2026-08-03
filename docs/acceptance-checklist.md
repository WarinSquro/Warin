# Production acceptance checklist (OneView RMS)

Mapped from ONE PROMPT — desktop/mobile monitoring excluded.

**FRD functional cases:** see `[docs/frd-test-matrix.md](./frd-test-matrix.md)` (run Auto rows + Manual P0 before sign-off).

- [x] All Phase-1 RMS UI screens reachable with JWT session
- [x] PostgreSQL schema (BIGINT PKs + business keys + audit) migrated & seeded
- [x] `docker compose up -d` starts postgres, redis, api, worker, nginx, pgadmin, monitoring
- [x] `POST /api/v1/auth/login` with email + 5-digit PIN returns JWT
- [x] Forgot-PIN + reset-PIN flows work (mail dry-run acceptable in local)
- [x] Masters / employees / projects / settings / access-rights / cockpit APIs respond
- [x] RBAC uses `navConfig` permission keys
- [x] Storage put/get works (filesystem default)
- [ ] Backup script produces a dump; restore documented
- [ ] Prometheus + Grafana + Loki containers healthy
- [ ] OpenAPI at `/api/docs`
- [ ] Unit + e2e smoke tests pass (with API up for auth e2e) — `npm run test:unit` / `npm run test:e2e`
- [ ] FRD test matrix P0 Auto green; Manual P0 walked once (`docs/frd-test-matrix.md`)
- [ ] No unresolved TODOs in shipped Phase paths
- [ ] Docs: database, monorepo, docker-deployment, api-contract updated