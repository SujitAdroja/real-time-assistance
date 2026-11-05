import "dotenv/config";
import { createServer } from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import type { RawData } from "ws";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const server = createServer(app);
const webSocketServer = new WebSocketServer({ server, path: "/ws" });

app.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "interview-assistant-server" });
});

webSocketServer.on("connection", (socket, request) => {
  const clientAddress = request.socket.remoteAddress ?? "unknown client";

  console.log(`WebSocket client connected: ${clientAddress}`);

  socket.on("message", (data, isBinary) => {
    try {
      if (isBinary) {
        console.log(`Received audio chunk: ${getByteLength(data)} bytes`);
        return;
      }

      handleControlMessage(data);
    } catch (error) {
      console.error("Failed to handle WebSocket message:", error);
    }
  });

  socket.on("error", (error) => {
    console.error("WebSocket client error:", error);
  });

  socket.on("close", (code, reason) => {
    console.log(
      `WebSocket client disconnected (code ${code}): ${reason.toString() || "no reason"}`,
    );
  });
});

webSocketServer.on("error", (error) => {
  console.error("WebSocket server error:", error);
});

function handleControlMessage(data: RawData): void {
  const message = JSON.parse(data.toString()) as unknown;

  if (!isControlMessage(message)) {
    console.warn("Ignoring invalid WebSocket control message");
    return;
  }

  if (message.type === "session-start") {
    console.log(`Audio session started with MIME type: ${message.mimeType}`);
    return;
  }

  console.log("Audio session stopped");
}

function isControlMessage(
  message: unknown,
): message is { type: "session-start"; mimeType: string } | { type: "session-stop" } {
  if (typeof message !== "object" || message === null || !("type" in message)) {
    return false;
  }

  if (message.type === "session-stop") {
    return true;
  }

  return message.type === "session-start" && "mimeType" in message && typeof message.mimeType === "string";
}

function getByteLength(data: RawData): number {
  if (Array.isArray(data)) {
    return data.reduce((total, chunk) => total + chunk.length, 0);
  }

  return data.byteLength;
}

server.listen(port, () => {
  console.log(`API server listening at http://localhost:${port}`);
});
