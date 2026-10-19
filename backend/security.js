import { t } from './i18n.js';
import crypto from 'crypto';

const MAX_BODY_STRING_LENGTH = 7_000_100;

const base64Url = (input) => Buffer.from(input).toString('base64url');

const getSecret = () => {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) throw new Error('JWT_SECRET is required');
  return secret;
};

const sign = (value) => crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');

export const issueAuthToken = (payload) => {
  const now = Math.floor(Date.now() / 1000);
  const DEFAULT_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 60 * 60 * 8);
  const USER_DRIVER_TOKEN_TTL_SECONDS = Number(process.env.USER_DRIVER_ACCESS_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 30);
  const ttlSeconds = payload?.role === 'user' || payload?.role === 'driver'
    ? USER_DRIVER_TOKEN_TTL_SECONDS
    : DEFAULT_TOKEN_TTL_SECONDS;
  const body = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
    jti: crypto.randomBytes(16).toString('hex')
  };
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const encodedPayload = base64Url(JSON.stringify(body));
  return `${header}.${encodedPayload}.${sign(`${header}.${encodedPayload}`)}`;
};

export const verifyAuthToken = (token) => {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    if (parsedHeader.alg !== 'HS256' || parsedHeader.typ !== 'JWT' || !Number.isFinite(decoded.exp) || decoded.exp <= Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
};

export const authenticate = (req, res, next) => {
  const authHeader = req.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const token = bearer || req.get('x-vira-session');
  const session = verifyAuthToken(token);

  if (!session) {
    return res.status(401).json({ error: t('AUTH_REQUIRED'), code: 'AUTH_REQUIRED' });
  }

  req.auth = session;
  next();
};

export const optionalAuth = (req, _res, next) => {
  const authHeader = req.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  req.auth = verifyAuthToken(bearer || req.get('x-vira-session')) || null;
  next();
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.auth || !roles.includes(req.auth.role)) {
    return res.status(403).json({ error: t('FORBIDDEN'), code: 'FORBIDDEN' });
  }
  next();
};

export const enforceReadOnlyRole = (role, allowedMethods = ['GET', 'HEAD', 'OPTIONS']) => (req, res, next) => {
  if (req.auth?.role === role && !allowedMethods.includes(req.method)) {
    return res.status(403).json({ error: t('FORBIDDEN'), code: 'FORBIDDEN' });
  }
  next();
};

export const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
  return `scrypt$${salt}$${derived.toString('hex')}`;
};

export const verifyPassword = async (password, storedPassword) => {
  const stored = String(storedPassword || '');
  if (!stored.startsWith('scrypt$')) {
    return { ok: false, needsRehash: false };
  }

  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return { ok: false, needsRehash: false };
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(derived.toString('hex'), 'hex');
  return { ok: a.length === b.length && crypto.timingSafeEqual(a, b), needsRehash: false };
};

export const securityHeaders = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Driver QR scanner needs camera access on the same origin.
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');
  next();
};

export const createRateLimiter = ({ windowMs, max, keyPrefix = 'default', keyResolver }) => {
  const hits = new Map();
  let lastCleanup = 0;
  return (req, res, next) => {
    let keySource = '';
    if (typeof keyResolver === 'function') {
      try {
        keySource = String(keyResolver(req) || '').trim();
      } catch {
        keySource = '';
      }
    }
    if (!keySource) keySource = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${keySource}`;
    const now = Date.now();
    if (now - lastCleanup >= Math.min(windowMs, 60_000)) {
      for (const [oldKey, value] of hits) if (value.resetAt <= now) hits.delete(oldKey);
      lastCleanup = now;
    }
    if (!hits.has(key) && hits.size >= 20_000) return res.status(429).json({ error: t('TOO_MANY_REQUESTS'), code: 'TOO_MANY_REQUESTS' });
    const current = hits.get(key) || { count: 0, resetAt: now + windowMs };
    if (current.resetAt <= now) {
      current.count = 0;
      current.resetAt = now + windowMs;
    }
    current.count += 1;
    hits.set(key, current);
    if (current.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
      return res.status(429).json({ error: t('TOO_MANY_REQUESTS'), code: 'TOO_MANY_REQUESTS' });
    }
    next();
  };
};

export const validateBodySize = (req, res, next) => {
  const stack = [{ value: req.body, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    if (++nodes > 10_000 || depth > 32 || (typeof value === 'string' && value.length > MAX_BODY_STRING_LENGTH)) {
      return res.status(413).json({ error: t('PAYLOAD_TOO_LARGE'), code: 'PAYLOAD_TOO_LARGE' });
    }
    if (value && typeof value === 'object') {
      for (const item of Object.values(value)) stack.push({ value: item, depth: depth + 1 });
    }
  }
  next();
};

export const isSafeText = (value, max = 255) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export const auditLog = async (db, req, action, entityType, entityId = null, details = {}) => {
  try {
    await db.query(
      `INSERT INTO audit_logs (actor_role, actor_id, action, entity_type, entity_id, ip_address, user_agent, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.auth?.role || 'anonymous',
        req.auth?.sub ? String(req.auth.sub) : null,
        action,
        entityType,
        entityId ? String(entityId) : null,
        req.ip || '',
        req.get('user-agent') || '',
        JSON.stringify(details).slice(0, 4000)
      ]
    );
  } catch (error) {
    console.warn('Audit log failed:', error.code || 'AUDIT_WRITE_FAILED');
  }
};
