import { db } from './db.js';

// Simple in-memory cache for dynamic settings (per process).
// Backward compatible: if setting missing, callers should handle defaults.

const CACHE_TTL_MS = Number(process.env.SETTINGS_CACHE_TTL_MS || 5_000);
const cache = new Map(); // key -> { value: string, expiresAt: number }

export const getSetting = async (key, executor = db) => {
  // Reuse an existing transaction connection; acquiring another can exhaust the pool.
  if (executor !== db) {
    const [rows] = await executor.query('SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1', [key]);
    return rows?.[0]?.setting_value ?? null;
  }
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const [rows] = await db.query(
    'SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1',
    [key]
  );
  const value = rows?.[0]?.setting_value ?? null;
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
};

export const setSetting = async (key, value) => {
  await db.query(
    `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, String(value)]
  );
  // Invalidate cache immediately to apply real-time without restart.
  cache.delete(key);
};

export const invalidateSetting = (key) => {
  cache.delete(key);
};
