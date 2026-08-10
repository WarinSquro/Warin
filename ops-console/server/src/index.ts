import fs from "node:fs";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { config, ensureDirs, OPS_ROOT } from "./config.js";
import { loadStore } from "./store.js";
import { api } from "./routes/api.js";

ensureDirs();
loadStore(); // seed auth hash into ops-console data (not WARIN DB)

const app = express();
app.disable("x-powered-by");
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser(config.sessionSecret));

app.get("/api/ops/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "ops-console",
    platform: process.platform,
    isEc2Layout: config.isEc2Layout,
    storageBoundary: "ops-console-json-independent-of-warin-db",
    dataDir: config.dataDir,
  });
});

app.use("/api/ops", api);

const distIndex = path.join(config.webDist, "index.html");
if (config.serveStatic && fs.existsSync(distIndex)) {
  app.use(express.static(config.webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(distIndex);
  });
} else {
  app.get("/", (_req, res) => {
    res
      .status(200)
      .type("html")
      .send(`<!doctype html><html><body style="font-family:system-ui;padding:2rem">
<h1>Ops Console API</h1>
<p>UI bundle not served. Either:</p>
<ul>
<li>Build UI: <code>cd ops-console && npm run build</code> then restart, or</li>
<li>Dev UI: <code>npm run dev</code> and open <a href="http://127.0.0.1:5191">http://127.0.0.1:5191</a></li>
</ul>
<p>API health: <a href="/api/ops/health">/api/ops/health</a></p>
</body></html>`);
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[ops-console]", err);
  res.status(500).json({ error: "Internal error" });
});

app.listen(config.port, config.bind, () => {
  console.log(`[ops-console] listening on http://${config.bind}:${config.port}`);
  console.log(`[ops-console] platform=${process.platform} isEc2Layout=${config.isEc2Layout}`);
  console.log(`[ops-console] OPS_ROOT=${OPS_ROOT}`);
  console.log(`[ops-console] dataDir=${config.dataDir} (NOT Warin Postgres)`);
  console.log(`[ops-console] warinAppDir=${config.warinAppDir}`);
  console.log(`[ops-console] backupRoot=${config.backupRoot}`);
  console.log(`[ops-console] environment=${config.environmentLabel}`);
});
