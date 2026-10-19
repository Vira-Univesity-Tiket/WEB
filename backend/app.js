import express from 'express';
import cors from 'cors';

import router from './routes.js';
import { probeDb } from './db.js';

import {
  securityHeaders,
  validateBodySize
} from './security.js';

import {
  errorHandler,
  notFoundPayload,
  responseLocalizer
} from './i18n.js';

import {
  loadBackendEnv
} from './config/env.js';

import {
  createCorsOriginValidator,
  loadBackendConfig
} from './config/backend-config/index.js';

loadBackendEnv();

const app = express();

const backendConfig = loadBackendConfig(process.env);

const corsOriginValidator = createCorsOriginValidator(
  backendConfig.cors
);


/**
 * Trust proxy
 */
if (backendConfig.runtime.trustProxy) {
  app.set('trust proxy', 1);
}

/**
 * CORS
 */
app.use(cors({

  credentials: backendConfig.cors.credentials,

  methods: backendConfig.cors.methods,

  allowedHeaders: backendConfig.cors.allowedHeaders,

  maxAge: backendConfig.cors.maxAge,

  origin(origin, callback) {

    /**
     * Allow:
     * - curl
     * - nginx
     * - monitoring systems
     * - server-to-server requests
     * - requests without Origin header
     */
    if (!origin) {
      return callback(null, backendConfig.cors.allowNoOrigin);
    }

    /**
     * Allow configured origins
     */
    if (corsOriginValidator(origin)) {
      return callback(null, true);
    }

    console.warn(
      `[CORS BLOCKED] origin=${origin}`
    );

return callback(null, false);
  }
}));

/**
 * Security middleware
 */
app.use(securityHeaders);

/**
 * JSON parser
 */
app.use(express.json({

  limit: '15mb',

  verify: (req, _res, buf) => {
    if (req.originalUrl.includes('/wallet/topup/callback')) req.rawBody = buf ? buf.toString('utf8') : '';
  }
}));

/**
 * Body size validation
 */
app.use((req, _res, next) => { req.body ??= {}; next(); });
app.use(validateBodySize);

/**
 * Localization middleware
 */
app.use(responseLocalizer);

/**
 * Request logger
 */
if (backendConfig.runtime.nodeEnv !== 'production') {

  app.use((req, res, next) => {

    console.log(
      `[REQUEST] ${req.method} ${req.path}`
    );

    next();
  });
}

/**
 * Health routes
 */
const attachHealthRoutes = () => {

  const handler = async (req, res) => {

    const result = await probeDb();
    res.status(result.ok ? 200 : 503).json({ ok: result.ok, service: 'vira-backend' });
  };

  /**
   * Main health endpoint
   */
  app.get(
    backendConfig.server.healthPath,
    handler
  );

  /**
   * Fallback health endpoints
   */
  if (backendConfig.server.healthPath !== '/healthz') {

    app.get('/healthz', handler);
  }

  app.get('/api/health', handler);

  app.get('/api/healthz', handler);

  app.get('/api1/health', handler);

  app.get('/api1/healthz', handler);
};

attachHealthRoutes();

/**
 * API routes
 * Supports:
 * - /api
 * - /api1
 * for backward compatibility
 */
const apiBasePaths = Array.from(
  new Set([
    backendConfig.server.apiBasePath,
    '/api',
    '/api1'
  ])
);

apiBasePaths.forEach((basePath) => {

  app.use(basePath, router);
});

/**
 * Root route
 */
app.get('/', (req, res) => {

  res.json({
    ok: true,
    service: 'vira-backend',
    status: 'running'
  });
});

/**
 * 404 handler
 */
app.use((req, res) => {

  console.log(
    `[404 ERROR] Route not found: ${req.method} ${req.path}`
  );

  res.status(404).json(
    notFoundPayload(req)
  );
});

/**
 * Global error handler
 */
app.use(errorHandler);


export default app;
