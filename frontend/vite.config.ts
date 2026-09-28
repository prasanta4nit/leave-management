import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    // amazon-cognito-identity-js expects a Node-style `global`.
    define: { global: 'globalThis' },
    server: {
      port: 5173,
      // Local FastAPI backend (uvicorn app.main:app --port 8000)
      proxy: { '/api': env.VITE_API_PROXY_TARGET || 'http://localhost:8000' },
    },
  };
});
