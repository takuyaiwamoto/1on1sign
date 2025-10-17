import "dotenv/config";

import http from "node:http";

import express from "express";
import next from "next";

import { SignalingHub } from "./signalingHub";

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const dev = process.env.NODE_ENV !== "production";

async function main() {
  if (!process.env.ROOM_SECRET) {
    // Surface the configuration requirement early.
    throw new Error("ROOM_SECRET が設定されていません。env を確認してください。");
  }

  const nextApp = next({ dev, dir: "." });
  const handle = nextApp.getRequestHandler();
  const upgrade = nextApp.getUpgradeHandler();
  await nextApp.prepare();

  const app = express();
  const server = http.createServer(app);

  const signalingHub = new SignalingHub();
  signalingHub.initialize();

  app.disable("x-powered-by");

  app.get("/healthz", (_req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      environment: process.env.NODE_ENV ?? "development"
    });
  });

  app.all("*", (req, res) => handle(req, res));

  server.on("upgrade", (request, socket, head) => {
    if (request.url?.startsWith("/ws")) {
      signalingHub.upgrade(request, socket, head);
    } else {
      upgrade(request, socket, head);
    }
  });

  server.listen(PORT, () => {
    console.log(`[online-sign] server started on http://localhost:${PORT} (dev=${dev})`);
  });

  const shutdown = () => {
    signalingHub.dispose();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
