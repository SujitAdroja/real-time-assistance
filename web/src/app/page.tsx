"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInterviewWebSocket } from "@/hooks/useInterviewWebSocket";

const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";
const CHUNK_INTERVAL_MS = 250;
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
] as const;

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

export default function Home() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingMimeType, setRecordingMimeType] = useState<string | null>(null);
  const {
    connect,
    connectionError,
    connectionStatus,
    disconnect,
    sendAudioChunk,
    sendControlMessage,
  } = useInterviewWebSocket(WEBSOCKET_URL);

  const stopRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      return;
    }

    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (mediaRecorderRef.current || isRecording) {
      return;
    }

    setRecordingError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingError("This browser does not support microphone capture.");
      return;
    }

    const connected = await connect();

    if (!connected) {
      setRecordingError("Connect to the audio server before recording.");
      return;
    }

    let stream: MediaStream | null = null;
    let sessionStarted = false;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
          setRecordingError("Audio server connection was lost. Stop and start recording again.");
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
        setIsRecording(false);
        sendControlMessage({ type: "session-stop" });
        disconnect();
      };

      if (!sendControlMessage({ type: "session-start", mimeType: selectedMimeType })) {
        throw new Error("The audio server connection closed before recording could start.");
      }

      sessionStarted = true;
      mediaRecorder.start(CHUNK_INTERVAL_MS);
      setRecordingMimeType(selectedMimeType);
      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
      stopMediaStream(stream);
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;

      if (sessionStarted) {
        sendControlMessage({ type: "session-stop" });
      }

      setRecordingError(getMicrophoneError(error));
    }
  }, [connect, disconnect, isRecording, sendAudioChunk, sendControlMessage]);

  useEffect(() => stopRecording, [stopRecording]);

  const isStarting = connectionStatus === "connecting";
  const statusLabel = connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-700">
        Proof of concept · Milestone 2
      </p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
        Browser Audio Streaming
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
        Capture microphone audio in the browser and stream short binary chunks to the local Node.js server.
      </p>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-slate-500">WebSocket</dt>
            <dd className="mt-1 font-semibold text-slate-900">{statusLabel}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500">Recording</dt>
            <dd className="mt-1 font-semibold text-slate-900">
              {isRecording ? "Recording" : "Stopped"}
            </dd>
          </div>
          {recordingMimeType && (
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-slate-500">Captured format</dt>
              <dd className="mt-1 font-mono text-sm text-slate-900">{recordingMimeType}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={isRecording || isStarting}
            onClick={startRecording}
            type="button"
          >
            {isStarting ? "Connecting…" : "Start recording"}
          </button>
          <button
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={!isRecording}
            onClick={stopRecording}
            type="button"
          >
            Stop recording
          </button>
        </div>

        {(connectionError || recordingError) && (
          <p className="mt-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">
            {recordingError ?? connectionError}
          </p>
        )}
      </section>
    </main>
  );
}
