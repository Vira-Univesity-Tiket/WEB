import express from 'express';
import cors from 'cors';

import router from './routes.js';
import { initDB } from './db.js';

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
  loadBackendEnv,
  logEnvironmentWarnings,
  validateCriticalEnv
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

const PORT = backendConfig.server.port;

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
      return callback(null, true);
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
    req.rawBody = buf
      ? buf.toString('utf8')
      : '';
  }
}));

/**
 * Body size validation
 */
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
      `[REQUEST] ${req.method} ${req.url}`
    );

    next();
  });
}

/**
 * Health routes
 */
const attachHealthRoutes = () => {

  const handler = (req, res) => {

    res.json({
      ok: true,
      service: 'vira-backend',
      nodeEnv: backendConfig.runtime.nodeEnv,
      apiBasePath: backendConfig.server.apiBasePath,
      time: new Date().toISOString()
    });
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
    `[404 ERROR] Route not found: ${req.method} ${req.url}`
  );

  res.status(404).json(
    notFoundPayload(req)
  );
});

/**
 * Global error handler
 */
app.use(errorHandler);

/**
 * Bootstrap
 */
const bootstrap = async () => {

  console.log(
    `Starting server on port ${PORT}...`
  );

  validateCriticalEnv();

  logEnvironmentWarnings();

  await initDB();

  app.listen(PORT, () => {

    console.log(
      `🚀 Backend server running on port ${PORT}`
    );

    console.log(
      `🌐 API Base Path: ${backendConfig.server.apiBasePath}`
    );

    console.log(
      `❤️ Health Check: /api/healthz`
    );
  });
};

bootstrap().catch((error) => {

  console.error(
    '❌ Backend bootstrap failed:',
    error?.message || error
  );

  process.exit(1);
});