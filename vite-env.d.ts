// Removed reference to vite/client to prevent "Cannot find type definition" error
// /// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_BASE_PATH?: string;
  readonly VITE_API_RETRY_COUNT?: string;
  readonly VITE_ENV_DEBUG?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
