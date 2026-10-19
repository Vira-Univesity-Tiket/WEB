const normalizePath = (value: unknown): string | null => {
  if (typeof value !== 'string' || !/^\/[a-zA-Z0-9/_-]*$/.test(value)) return null;
  return value.replace(/\/+$/, '') || '/api1';
};
const buildPath = normalizePath(import.meta.env?.VITE_API_BASE_PATH || import.meta.env?.VITE_API_BASE_URL);
let cachedConfig = { apiBasePath: buildPath || '/api1', retryCount: 1 };
let initialization: Promise<void> | undefined;

export function initializeFrontendConfig(): Promise<void> {
  initialization ??= (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch('/runtime-config.json', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) return;
      const config = await response.json();
      cachedConfig = {
        apiBasePath: buildPath || normalizePath(config.apiBasePath || config.apiBaseUrl) || '/api1',
        retryCount: Math.min(2, Math.max(0, Number(import.meta.env?.VITE_API_RETRY_COUNT ?? config.retryCount) || 0))
      };
    } catch {
      // The bundled same-origin default also works without runtime config.
    } finally { clearTimeout(timer); }
  })();
  return initialization;
}

export const buildApiUrl = (path: string): string => `${cachedConfig.apiBasePath}${path.startsWith('/') ? path : `/${path}`}`;
export const getApiRetryCount = (): number => cachedConfig.retryCount;
