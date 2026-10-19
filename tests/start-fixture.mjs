import { createLocalDatabase } from './localDatabase.mjs';
const fixture = await createLocalDatabase();
const { default: app } = await import('../backend/app.js');
const server = app.listen(5017, '127.0.0.1', () => console.info('Local browser fixture ready on 5017'));
let closing = false;
const close = () => {
  if (closing) return;
  closing = true;
  server.close(async () => { await fixture.cleanup(); process.exit(0); });
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
