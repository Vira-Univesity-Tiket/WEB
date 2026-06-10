const toBool = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
};

const toNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const asList = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/+$/, '');

const normalizePath = (value, fallback) => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return raw.startsWith('/') ? raw : `/${raw}`;
};

let lastLoggedSignature = '';

const buildTrustedOrigins = (env) => {
  const explicit = [
    ...asList(env.FRONTEND_URL),
    ...asList(env.CORS_ALLOWED_ORIGINS)
  ].map(normalizeOrigin).filter(Boolean);

  const defaultOrigins = asList(env.CORS_DEFAULT_ORIGINS || 'https://vira.bog.co.ir,https://www.vira.bog.co.ir')
    .map(normalizeOrigin)
    .filter(Boolean);
  explicit.push(...defaultOrigins);

  const addLocal = toBool(env.CORS_INCLUDE_LOCALHOST, true);
  if (addLocal) {
    const localPort = toNumber(env.FRONTEND_DEV_PORT, 3000);
    explicit.push(
      `http://localhost:${localPort}`,
      `http://127.0.0.1:${localPort}`,
      'http://localhost',
      'http://127.0.0.1'
    );
  }

  return Array.from(new Set(explicit));
};

const buildRuntimeFlags = (env) => {
  const nodeEnv = String(env.BACKEND_NODE_ENV || env.NODE_ENV || 'development').trim().toLowerCase();
  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isDevelopment: nodeEnv !== 'production',
    inDocker: toBool(env.DOCKER, false) || toBool(env.CONTAINER, false),
    trustProxy: env.TRUST_PROXY === undefined ? true : toBool(env.TRUST_PROXY, true),
    debugEnv: toBool(env.ENV_DEBUG, false)
  };
};

const buildServerConfig = (env) => ({
  port: toNumber(env.PORT, 5005),
  apiBasePath: normalizePath(env.API_BASE_PATH, '/api'),
  healthPath: normalizePath(env.HEALTH_PATH, '/healthz'),
  healthHtmlEnabled: toBool(env.HEALTH_HTML_ENABLED, true)
});

const buildCorsConfig = (env, runtime) => {
  const allowNoOrigin = toBool(env.CORS_ALLOW_NO_ORIGIN, true);
  const allowOriginRegex = asList(env.CORS_ALLOWED_ORIGIN_REGEX).map((item) => {
    try {
      return new RegExp(item);
    } catch {
      return null;
    }
  }).filter(Boolean);

  const allowedOrigins = buildTrustedOrigins(env);
  const methods = asList(env.CORS_ALLOWED_METHODS).length
    ? asList(env.CORS_ALLOWED_METHODS)
    : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
  const allowedHeaders = asList(env.CORS_ALLOWED_HEADERS).length
    ? asList(env.CORS_ALLOWED_HEADERS)
    : ['Content-Type', 'Authorization', 'X-Vira-Session'];

  return {
    credentials: toBool(env.CORS_ALLOW_CREDENTIALS, true),
    allowNoOrigin,
    allowedOrigins,
    allowOriginRegex,
    methods,
    allowedHeaders,
    maxAge: toNumber(env.CORS_MAX_AGE_SECONDS, runtime.isProduction ? 3600 : 0)
  };
};

export const loadBackendConfig = (env = process.env) => {
  const runtime = buildRuntimeFlags(env);
  const server = buildServerConfig(env);
  const cors = buildCorsConfig(env, runtime);
  const config = { runtime, server, cors };
  const signature = JSON.stringify({
    nodeEnv: runtime.nodeEnv,
    port: server.port,
    apiBasePath: server.apiBasePath,
    healthPath: server.healthPath,
    origins: cors.allowedOrigins,
    allowNoOrigin: cors.allowNoOrigin,
    debugEnv: runtime.debugEnv
  });
  if (signature !== lastLoggedSignature) {
    if (runtime.debugEnv) {
      console.info('[VIRA_CONFIG][backend]', {
        runtime,
        server,
        cors: {
          ...cors,
          allowOriginRegex: cors.allowOriginRegex.map((item) => item.toString())
        }
      });
    } else {
      console.info(
        `[VIRA_CONFIG][backend] env=${runtime.nodeEnv} port=${server.port} apiBasePath=${server.apiBasePath} origins=${cors.allowedOrigins.length}`
      );
    }
    lastLoggedSignature = signature;
  }
  return config;
};

export const createCorsOriginValidator = (corsConfig) => {
  return (origin) => {
    if (!origin) {
      return corsConfig.allowNoOrigin;
    }
    const cleanOrigin = normalizeOrigin(origin);
    if (corsConfig.allowedOrigins.includes(cleanOrigin)) {
      return true;
    }
    return corsConfig.allowOriginRegex.some((regex) => regex.test(cleanOrigin));
  };
};
