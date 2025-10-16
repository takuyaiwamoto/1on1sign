import http from 'http';
import express from 'express';
import next from 'next';
import dotenv from 'dotenv';
import { attachSignalingHub } from './signalingHub';

dotenv.config();

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev, dir: process.cwd() });
const handle = nextApp.getRequestHandler();
const PORT = Number(process.env.PORT) || 3000;

async function main() {
  await nextApp.prepare();

  const app = express();

  app.get('/healthz', (_, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.all('*', (req, res) => {
    return handle(req, res);
  });

  const server = http.createServer(app);
  attachSignalingHub(server);

  server.listen(PORT, () => {
    console.log(`Server ready on http://localhost:${PORT}`);
  });
}

main().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
