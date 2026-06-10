import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');
let envLoaded = false;

const loadIfExists = (targetPath) => {
  dotenv.config({ path: targetPath, override: false });
};

const getBackendNodeEnv = () => {
  const raw = String(process.env.BACKEND_NODE_ENV || process.env.NODE_ENV || 'development').trim().toLowerCase();
  return raw || 'development';
};

export const loadBackendEnv = () => {
  if (envLoaded) return;
  // Single source of truth: load env files from project root.
  loadIfExists(path.resolve(projectRoot, '.env'));
  // Fallback for cPanel/backend-only deployments.
  loadIfExists(path.resolve(backendRoot, '.env'));
  dotenv.config({ path: path.resolve(projectRoot, '.env.local'), override: true });
  dotenv.config({ path: path.resolve(backendRoot, '.env.local'), override: true });
  envLoaded = true;
};

const isWeakPlaceholder = (value) => {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return true;
  return [
    'secret',
    'changeme',
    'change-me',
    'password',
    'admin',
    '123456',
    '177840',
    'mohd'
  ].includes(v);
};

export const validateCriticalEnv = () => {
  const missing = [];
  const invalid = [];

  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  const sessionSecret = String(process.env.SESSION_SECRET || '').trim();
  const adminUsername = String(process.env.ADMIN_USERNAME || '').trim();
  const adminPassword = String(process.env.ADMIN_PASSWORD || '').trim();

  if (!jwtSecret) missing.push('JWT_SECRET');
  if (!sessionSecret) missing.push('SESSION_SECRET');
  if (!adminUsername) missing.push('ADMIN_USERNAME');
  if (!adminPassword) missing.push('ADMIN_PASSWORD');

  if (jwtSecret) {
    if (jwtSecret.length < 32) invalid.push('JWT_SECRET must be at least 32 chars');
    if (isWeakPlaceholder(jwtSecret)) invalid.push('JWT_SECRET is weak placeholder');
  }
  if (sessionSecret) {
    if (sessionSecret.length < 32) invalid.push('SESSION_SECRET must be at least 32 chars');
    if (isWeakPlaceholder(sessionSecret)) invalid.push('SESSION_SECRET is weak placeholder');
  }
  if (adminUsername && adminUsername.length < 3) invalid.push('ADMIN_USERNAME must be at least 3 chars');
  if (adminPassword) {
    if (adminPassword.length < 12) invalid.push('ADMIN_PASSWORD must be at least 12 chars');
    if (isWeakPlaceholder(adminPassword)) invalid.push('ADMIN_PASSWORD is weak placeholder');
  }

  if (missing.length || invalid.length) {
    const reason = [
      missing.length ? `Missing: ${missing.join(', ')}` : '',
      invalid.length ? `Invalid: ${invalid.join(', ')}` : ''
    ].filter(Boolean).join(' | ');
    const mode = getBackendNodeEnv();
    const message = `Critical environment validation failed. ${reason}`;
    if (mode === 'production') {
      const error = new Error(message);
      error.code = 'CRITICAL_ENV_INVALID';
      throw error;
    }
    console.warn(`[ENV WARNING] ${message}`);
  }
};

export const logEnvironmentWarnings = () => {
  const warnings = [];
  if (!process.env.CORS_ALLOWED_ORIGINS && !process.env.FRONTEND_URL) {
    warnings.push('No explicit CORS origins configured. Set CORS_ALLOWED_ORIGINS for production.');
  }
  if (!process.env.PAYMENT_RETURN_URL) {
    warnings.push('PAYMENT_RETURN_URL is not set. Payment callback redirect may fail.');
  }
  warnings.forEach((warning) => console.warn(`[ENV WARNING] ${warning}`));
};
