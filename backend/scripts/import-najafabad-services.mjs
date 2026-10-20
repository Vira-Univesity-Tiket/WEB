import { readFile, stat, mkdir, mkdtemp, open, unlink, rmdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import mysql from 'mysql2/promise';
import { loadBackendEnv } from '../config/env.js';
import { importNajafabadCatalog, validateNajafabadCatalog } from '../services/najafabadCatalogService.js';

const help = `Najafabad university services (explicit import, no automatic seeding)
  npm run catalog:najafabad -- --file /private/catalog.json --validate
  npm run catalog:najafabad -- --file /private/catalog.json
  npm run catalog:najafabad -- --file /private/catalog.json --apply --confirm-database database_name

Default mode checks the configured database and rolls back without writing.
--validate checks only the input file and does not connect to a database.
Declared new drivers receive random passwords saved only to a private local file.
Existing drivers must be active; their plates and capacities must match.
DB_* values are loaded from the existing ignored environment configuration.
See docs/NAJAFABAD-SERVICES.md before applying.`;

let pool; let credentialsFile; let credentialsWritten = false;
try {
  const { values } = parseArgs({ options: {
    file: { type: 'string' }, apply: { type: 'boolean', default: false },
    validate: { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
    'confirm-database': { type: 'string' }
  } });
  if (values.help) console.info(help);
  else {
    if (!values.file || (values.apply && values.validate) || (!values.apply && values['confirm-database'])) throw new Error('INVALID_OPTIONS: use --help');
    if ((await stat(values.file)).size > 2 * 1024 * 1024) throw new Error('CATALOG_FILE_TOO_LARGE');
    const manifest = JSON.parse(await readFile(values.file, 'utf8'));
    const catalog = validateNajafabadCatalog(manifest);
    if (values.validate) console.info(JSON.stringify({ mode: 'validated', stations: catalog.stations.length, drivers: catalog.drivers.length, services: catalog.services.length }));
    else {
      loadBackendEnv();
      if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME || process.env.DB_PASSWORD === undefined) throw new Error('DATABASE_ENV_REQUIRED');
      if (values.apply && values['confirm-database'] !== process.env.DB_NAME) throw new Error('DATABASE_CONFIRMATION_MISMATCH');
      pool = mysql.createPool({
        host: process.env.DB_HOST.trim(), port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER.trim(), password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME.trim(), connectionLimit: 1, connectTimeout: 10000,
        decimalNumbers: true, charset: 'utf8mb4', timezone: '+03:30'
      });
      let credentialsHandle;
      if (values.apply && catalog.drivers.length) {
        const privateRoot = path.join(os.homedir(), '.vira-private');
        await mkdir(privateRoot, { recursive: true, mode: 0o700 });
        const privateDirectory = await mkdtemp(path.join(privateRoot, 'najafabad-'));
        credentialsFile = path.join(privateDirectory, 'driver-credentials.json');
        credentialsHandle = await open(credentialsFile, 'wx', 0o600);
      }
      try {
        const result = await importNajafabadCatalog(pool, manifest, {
          apply: values.apply, confirmDatabase: values['confirm-database'],
          persistCredentials: async credentials => {
            await credentialsHandle.writeFile(JSON.stringify({ credentials }, null, 2));
            await credentialsHandle.sync();
            credentialsWritten = true;
          }
        });
        console.info(JSON.stringify(result));
      } finally {
        await credentialsHandle?.close();
        if (credentialsWritten) console.info(`Private driver credentials: ${credentialsFile}`);
        else if (credentialsFile) { await unlink(credentialsFile); await rmdir(path.dirname(credentialsFile)); }
      }
    }
  }
} catch (error) {
  // Do not print SQL, connection URLs, credentials or local file contents.
  const message = error instanceof SyntaxError ? 'INVALID_CATALOG_JSON' : error.code ? String(error.code) : error.message;
  console.error(`Catalog import failed: ${message}`);
  process.exitCode = 1;
} finally { if (pool) await pool.end(); }
