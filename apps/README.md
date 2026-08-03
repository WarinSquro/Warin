# Platform apps

| App | Package | Role |
|-----|---------|------|
| [oneview-api](./oneview-api) | `@oneview/api` | NestJS REST API (`/api/v1`) |
| [oneview-worker](./oneview-worker) | `@oneview/worker` | BullMQ mail + heartbeat |

```bash
npm run packages:build
npm run api:dev
npm run worker:dev
# or
docker compose up -d --build
```

React UI remains at repo root (`npm run dev`). Point `VITE_API_BASE_URL` at `http://localhost:8080/api/v1` (nginx) or `http://localhost:3001/api/v1`.
