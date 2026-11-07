"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConnectionStatus,
  RecordingStatus,
  SessionControlMessage,
  SttStatus,
} from "@/types/interview";

const CHUNK_INTERVAL_MS = 250;
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
] as const;

type UseAudioRecordingInput = {
  connect: () => Promise<boolean>;
  connectionStatus: ConnectionStatus;
  sendAudioChunk: (audioChunk: Blob) => boolean;
  sendControlMessage: (message: SessionControlMessage) => boolean;
  sttStatus: SttStatus;
};

function stopMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function getMicrophoneError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone permission was denied. Allow access in your browser settings and try again.";
  }

  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone was found. Connect a microphone and try again.";
  }

  return "Unable to start microphone recording. Check the browser console for details.";
}

export function useAudioRecording({
  connect,
  connectionStatus,
  sendAudioChunk,
  sendControlMessage,
  sttStatus,
}: UseAudioRecordingInput) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const startOperationRef = useRef(0);
  const recordingStartedAtRef = useRef<number | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>("idle");
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingMimeType, setRecordingMimeType] = useState<string | null>(null);
  const isRecording = recordingStatus === "recording";
  const isConnecting = connectionStatus === "connecting" || recordingStatus === "starting";
  const canStart = recordingStatus === "idle" && connectionStatus !== "connecting";

  const stopRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      setRecordingStatus("stopping");
      mediaRecorder.stop();
      return;
    }

    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    if (recordingStartedAtRef.current !== null) {
      setDurationSeconds(
        Math.floor((Date.now() - recordingStartedAtRef.current) / 1000),
      );
    }
    recordingStartedAtRef.current = null;
    setRecordingStatus("idle");
  }, []);

  const startRecording = useCallback(async () => {
    if (mediaRecorderRef.current || recordingStatus !== "idle") {
      return;
    }

    const operationId = ++startOperationRef.current;
    let stream: MediaStream | null = null;
    let sessionStarted = false;
    let microphoneRequested = false;
    setRecordingStatus("starting");
    setRecordingError(null);
    setDurationSeconds(0);

    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingError("This browser does not support microphone capture.");
      setRecordingStatus("idle");
      return;
    }

    try {
      const connected = await connect();
      if (operationId !== startOperationRef.current) {
        return;
      }

      if (!connected) {
        throw new Error("The audio server connection is unavailable.");
      }

      microphoneRequested = true;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (operationId !== startOperationRef.current) {
        stopMediaStream(stream);
        return;
      }

      const mimeType = PREFERRED_MIME_TYPES.find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const selectedMimeType = mediaRecorder.mimeType || "browser default";

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && !sendAudioChunk(event.data)) {
          setRecordingError("The audio connection was lost. Stop and reconnect before trying again.");
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event.error);
        setRecordingError("The browser could not continue recording audio.");
      };

      mediaRecorder.onstop = () => {
        stopMediaStream(stream);

        if (mediaStreamRef.current === stream) {
          mediaStreamRef.current = null;
        }

        mediaRecorderRef.current = null;
        if (recordingStartedAtRef.current !== null) {
          setDurationSeconds(
            Math.floor((Date.now() - recordingStartedAtRef.current) / 1000),
          );
        }
        recordingStartedAtRef.current = null;
        setRecordingStatus("idle");
        if (!sendControlMessage({ type: "session-stop" })) {
          setRecordingError("The audio connection closed before the session could stop cleanly.");
        }
      };

      if (!sendControlMessage({ type: "session-start", mimeType: selectedMimeType })) {
        throw new Error("The audio server connection closed before recording could start.");
      }

      sessionStarted = true;
      mediaRecorder.start(CHUNK_INTERVAL_MS);
      setRecordingMimeType(selectedMimeType);
      recordingStartedAtRef.current = Date.now();
      setRecordingStatus("recording");
    } catch (error) {
      console.error("Failed to start recording:", error);
      stopMediaStream(stream);
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;

      if (sessionStarted) {
        sendControlMessage({ type: "session-stop" });
      }

      if (operationId !== startOperationRef.current) {
        return;
      }

      setRecordingStatus("idle");
      setRecordingError(
        microphoneRequested
          ? getMicrophoneError(error)
          : "Could not connect to the audio server. Check that the backend is running and try again.",
      );
    }
  }, [connect, recordingStatus, sendAudioChunk, sendControlMessage]);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const updateDuration = () => {
      const startedAt = recordingStartedAtRef.current;
      if (startedAt !== null) {
        setDurationSeconds(Math.floor((Date.now() - startedAt) / 1000));
      }
    };
    const timerId = window.setInterval(updateDuration, 250);
    return () => window.clearInterval(timerId);
  }, [isRecording]);

  useEffect(() => {
    if (
      isRecording &&
      (connectionStatus === "error" ||
        connectionStatus === "disconnected" ||
        sttStatus === "error" ||
        sttStatus === "closed")
    ) {
      stopRecording();
    }
  }, [connectionStatus, isRecording, sttStatus, stopRecording]);

  useEffect(
    () => () => {
      startOperationRef.current += 1;
      stopRecording();
    },
    [stopRecording],
  );

  return {
    canStart,
    durationSeconds,
    isConnecting,
    isRecording,
    recordingError,
    recordingMimeType,
    recordingStatus,
    startRecording,
    stopRecording,
  };
}
