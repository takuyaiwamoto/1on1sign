import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function buildHttpsConfig(env: Record<string, string>) {
  const keyPath = env.VITE_DEV_SSL_KEY;
  const certPath = env.VITE_DEV_SSL_CERT;
  if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(path.resolve(keyPath)),
      cert: fs.readFileSync(path.resolve(certPath))
    };
  }
  return true;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      __BUILD_TIME__: JSON.stringify(new Date().toISOString())
    },
    server: {
      https: buildHttpsConfig(env),
      host: true,
      port: Number(env.VITE_DEV_SERVER_PORT ?? 5173)
    },
    preview: {
      https: buildHttpsConfig(env),
      host: true
    }
  };
});
