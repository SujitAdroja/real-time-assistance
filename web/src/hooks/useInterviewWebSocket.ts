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

export type TranscriptSegment = {
  id: string;
  text: string;
  speechFinal: boolean;
};

type ServerMessage =
  | { type: "stt:connecting" }
  | { type: "stt:ready" }
  | { type: "stt:closed" }
  | { type: "stt:error"; message: string }
  | { type: "transcript:interim"; text: string }
  | { type: "transcript:final"; id: string; text: string; speechFinal: boolean };

type SttStatus = "disconnected" | "connecting" | "ready" | "closed" | "error";

function isServerMessage(message: unknown): message is ServerMessage {
  if (typeof message !== "object" || message === null || !("type" in message)) {
    return false;
  }

  if (message.type === "stt:connecting" || message.type === "stt:ready" || message.type === "stt:closed") {
    return true;
  }

  if (
    message.type === "stt:error" &&
    "message" in message &&
    typeof message.message === "string"
  ) {
    return true;
  }

  if (
    message.type === "transcript:interim" &&
    "text" in message &&
    typeof message.text === "string"
  ) {
    return true;
  }

  return (
    message.type === "transcript:final" &&
    "id" in message &&
    typeof message.id === "string" &&
    "text" in message &&
    typeof message.text === "string" &&
    "speechFinal" in message &&
    typeof message.speechFinal === "boolean"
  );
}

export function useInterviewWebSocket(url: string) {
  const socketRef = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sttStatus, setSttStatus] = useState<SttStatus>("disconnected");
  const [sttError, setSttError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscripts, setFinalTranscripts] = useState<TranscriptSegment[]>([]);

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

      socket.onmessage = (event) => {
        let message: unknown;

        try {
          message = JSON.parse(event.data) as unknown;
        } catch (error) {
          console.error("Received invalid WebSocket JSON:", error);
          setConnectionError("The audio server sent an invalid message.");
          return;
        }

        if (!isServerMessage(message)) {
          console.warn("Ignoring unrecognized audio server message.");
          return;
        }

        switch (message.type) {
          case "stt:connecting":
            setSttStatus("connecting");
            setSttError(null);
            break;
          case "stt:ready":
            setSttStatus("ready");
            setSttError(null);
            break;
          case "stt:closed":
            setSttStatus("closed");
            setInterimTranscript("");
            break;
          case "stt:error":
            setSttStatus("error");
            setSttError(message.message);
            break;
          case "transcript:interim":
            setInterimTranscript(message.text);
            break;
          case "transcript:final":
            setInterimTranscript("");
            setFinalTranscripts((previous) =>
              previous.some((segment) => segment.id === message.id)
                ? previous
                : [
                    ...previous,
                    {
                      id: message.id,
                      text: message.text,
                      speechFinal: message.speechFinal,
                    },
                  ],
            );
            break;
        }
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

    if (message.type === "session-start") {
      setSttStatus("connecting");
      setSttError(null);
      setInterimTranscript("");
      setFinalTranscripts([]);
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
    finalTranscripts,
    interimTranscript,
    sendAudioChunk,
    sendControlMessage,
    sttError,
    sttStatus,
  };
}
