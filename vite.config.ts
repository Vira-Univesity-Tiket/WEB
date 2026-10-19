
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_');
  return {
    server: {
      port: 3000,
      host: '127.0.0.1',
      proxy: Object.fromEntries(['/api1', '/api'].map(base => [base, {
        target: env.VITE_DEV_API_TARGET || 'http://127.0.0.1:5005',
        changeOrigin: false
      }]))
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.')
      }
    }
  };
});
