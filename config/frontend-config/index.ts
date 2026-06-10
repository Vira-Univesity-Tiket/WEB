let cachedConfig = {
  apiBasePath: '/api',
  apiBaseUrl: '',
  retryCount: 1
};

export async function initializeFrontendConfig(): Promise<void> {
  cachedConfig = {
    apiBasePath: '/api',
    apiBaseUrl: '',
    retryCount: 1
  };
}

export function buildApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (cachedConfig.apiBaseUrl) {
    return `${cachedConfig.apiBaseUrl}${cachedConfig.apiBasePath}${cleanPath}`;
  }
  return `${cachedConfig.apiBasePath}${cleanPath}`;
}

export function getApiRetryCount(): number {
  return cachedConfig.retryCount;
}
