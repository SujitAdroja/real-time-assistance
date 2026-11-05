"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

type SessionStartMessage = {
  type: "session-start";
  mimeType: string;
};

type SessionStopMessage = {
  type: "session-stop";
};

type ControlMessage = SessionStartMessage | SessionStopMessage;

export function useInterviewWebSocket(url: string) {
  const socketRef = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const disconnect = useCallback(() => {
    const socket = socketRef.current;

    if (socket) {
      socketRef.current = null;
      socket.close(1000, "Client disconnected");
    }

    setConnectionStatus("disconnected");
  }, []);

  const connect = useCallback((): Promise<boolean> => {
    const existingSocket = socketRef.current;

    if (existingSocket?.readyState === WebSocket.OPEN) {
      return Promise.resolve(true);
    }

    if (existingSocket?.readyState === WebSocket.CONNECTING) {
      return Promise.resolve(false);
    }

    setConnectionStatus("connecting");
    setConnectionError(null);

    return new Promise((resolve) => {
      const socket = new WebSocket(url);
      socketRef.current = socket;
      let settled = false;

      const finish = (connected: boolean) => {
        if (!settled) {
          settled = true;
          resolve(connected);
        }
      };

      socket.onopen = () => {
        setConnectionStatus("connected");
        finish(true);
      };

      socket.onerror = () => {
        setConnectionStatus("error");
        setConnectionError("Unable to connect to the audio server.");
        finish(false);
      };

      socket.onclose = (event) => {
        if (socketRef.current !== socket) {
          return;
        }

        socketRef.current = null;

        if (event.code === 1000) {
          setConnectionStatus("disconnected");
        } else {
          setConnectionStatus("error");
          setConnectionError(`Audio server connection closed (code ${event.code}).`);
        }

        finish(false);
      };
    });
  }, [url]);

  const sendControlMessage = useCallback((message: ControlMessage): boolean => {
    const socket = socketRef.current;

    if (socket?.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const sendAudioChunk = useCallback((audioChunk: Blob): boolean => {
    const socket = socketRef.current;

    if (socket?.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(audioChunk);
    return true;
  }, []);

  useEffect(() => disconnect, [disconnect]);

  return {
    connect,
    connectionError,
    connectionStatus,
    disconnect,
    sendAudioChunk,
    sendControlMessage,
  };
}
