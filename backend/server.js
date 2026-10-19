import app from './app.js';
import { db, initDB } from './db.js';
import { logEnvironmentWarnings, validateCriticalEnv } from './config/env.js';
import { loadBackendConfig } from './config/backend-config/index.js';

const bootstrap = async () => {
  validateCriticalEnv();
  logEnvironmentWarnings();
  await initDB();
  const { server: config } = loadBackendConfig();
  const server = app.listen(config.port, () => console.info(`Vira backend listening on port ${config.port}`));
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const timeout = setTimeout(() => process.exit(1), 10_000);
    timeout.unref();
    server.close(async () => { await db.end(); clearTimeout(timeout); process.exit(0); });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};
bootstrap().catch(error => {
  console.error('Backend bootstrap failed:', error.code || error.message);
  process.exit(1);
});