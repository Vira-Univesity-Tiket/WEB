import { createLocalDatabase } from "./localDatabase.mjs";
import http from "node:http";
const port = Number(process.env.VIRA_BROWSER_FIXTURE_PORT || 5017);
if (![5017, 5018].includes(port))
  throw new Error("INVALID_BROWSER_FIXTURE_PORT");
const fixture = await createLocalDatabase();
const { default: app } = await import("../backend/app.js");
let cleanupPromise;
const cleanup = () => (cleanupPromise ||= fixture.cleanup());
const server = http.createServer(async (req, res) => {
  // This endpoint belongs only to the loopback test fixture, never to the application.
  if (req.method !== "POST" || req.url !== "/__fixture/shutdown")
    return app(req, res);
  res.setHeader("Content-Type", "application/json");
  const key = process.env.VIRA_BROWSER_FIXTURE_KEY;
  if (!key || req.headers["x-vira-fixture-key"] !== key) {
    res.writeHead(403).end(JSON.stringify({ ok: false }));
    return;
  }
  try {
    // Finish cleanup before responding: Windows process termination skips signal handlers.
    await cleanup();
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    console.error(
      "Browser fixture cleanup failed:",
      error.code || "CLEANUP_FAILED",
    );
    res.writeHead(500).end(JSON.stringify({ ok: false }));
  }
  close();
});
server.listen(port, "127.0.0.1", () =>
  console.info(`Local browser fixture ready on ${port}`),
);
let closing = false;
const close = () => {
  if (closing) return;
  closing = true;
  server.close(async () => {
    try {
      await cleanup();
      process.exit(0);
    } catch (error) {
      console.error(
        "Browser fixture cleanup failed:",
        error.code || "CLEANUP_FAILED",
      );
      process.exit(1);
    }
  });
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
