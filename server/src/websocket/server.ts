import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import type { ServerConfig } from "../config/environment.js";
import { handleInterviewConnection } from "./interview-session.js";

export function attachInterviewWebSocketServer(
  server: Server,
  config: ServerConfig,
): WebSocketServer {
  const webSocketServer = new WebSocketServer({ server, path: "/ws" });

  webSocketServer.on("connection", (socket, request) => {
    handleInterviewConnection(socket, request, config);
  });

  webSocketServer.on("error", (error) => {
    console.error("WebSocket server error:", error);
  });

  return webSocketServer;
}
