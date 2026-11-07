import { createServer } from "node:http";
import express from "express";
import { loadEnvironment, readServerConfig } from "./config/environment.js";
import { attachInterviewWebSocketServer } from "./websocket/server.js";

loadEnvironment();
const config = readServerConfig();
const app = express();
const server = createServer(app);

app.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "interview-assistant-server" });
});

attachInterviewWebSocketServer(server, config);

server.listen(config.port, () => {
  console.log(`API server listening at http://localhost:${config.port}`);
});
