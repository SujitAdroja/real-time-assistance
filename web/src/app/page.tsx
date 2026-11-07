"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerPanel } from "@/components/AnswerPanel";
import { CandidateContextPanel } from "@/components/CandidateContextPanel";
import { DetectedQuestionPanel } from "@/components/DetectedQuestionPanel";
import { PerformanceMetrics } from "@/components/PerformanceMetrics";
import { RecordingControls, type RecordingStatus } from "@/components/RecordingControls";
import { StatusIndicator } from "@/components/StatusIndicator";
import { TranscriptPanel } from "@/components/TranscriptPanel";
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

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function Home() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const startOperationRef = useRef(0);
  const recordingStartedAtRef = useRef<number | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>("idle");
  const [sessionDurationSeconds, setSessionDurationSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingMimeType, setRecordingMimeType] = useState<string | null>(null);
  const {
    connect,
    answers,
    cancelAnswer,
    candidateContext,
    candidateContextError,
    candidateContextRevision,
    candidateContextStatus,
    connectionError,
    connectionStatus,
    detectedQuestion,
    finalTranscripts,
    interimTranscript,
    questionDetectionStatus,
    saveCandidateContext,
    sendAudioChunk,
    sendControlMessage,
    sttError,
    sttStatus,
  } = useInterviewWebSocket(WEBSOCKET_URL);
  const isRecording = recordingStatus === "recording";
  const isConnecting = connectionStatus === "connecting" || recordingStatus === "starting";

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
      setSessionDurationSeconds(
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
    setSessionDurationSeconds(0);

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
          setSessionDurationSeconds(
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
  }, [
    connect,
    recordingStatus,
    sendAudioChunk,
    sendControlMessage,
  ]);

  useEffect(() => {
    const connectionTimer = window.setTimeout(() => {
      void connect();
    }, 0);

    return () => window.clearTimeout(connectionTimer);
  }, [connect]);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const updateDuration = () => {
      const startedAt = recordingStartedAtRef.current;
      if (startedAt !== null) {
        setSessionDurationSeconds(Math.floor((Date.now() - startedAt) / 1000));
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

  const canStart = recordingStatus === "idle" && connectionStatus !== "connecting";
  const liveStatus = isRecording
    ? "Recording"
    : isConnecting
      ? "Connecting"
      : connectionStatus === "error" || connectionStatus === "disconnected"
        ? "Disconnected"
        : "Ready";
  const liveTone = isRecording
    ? "success"
    : isConnecting
      ? "warning"
      : connectionStatus === "error" || connectionStatus === "disconnected"
        ? "error"
        : "neutral";

  return (
    <main className="min-h-screen bg-[#f5f6f8] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/90 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-700 text-xs font-bold tracking-tight text-white">IA</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-slate-950">Interview Assistant</p>
              <p className="hidden text-xs text-slate-500 sm:block">Live interview workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
              <span className="size-1.5 rounded-full bg-slate-300" aria-hidden="true" />
              Backend <span className="font-medium text-slate-700">{formatStatus(connectionStatus)}</span>
            </div>
            <div className="hidden items-center gap-2 text-xs text-slate-500 md:flex">
              <span className="size-1.5 rounded-full bg-slate-300" aria-hidden="true" />
              Transcription <span className="font-medium text-slate-700">{formatStatus(sttStatus)}</span>
            </div>
            <StatusIndicator label="Session" status={liveStatus} tone={liveTone} />
            <span className="hidden border-l border-slate-200 pl-4 font-mono text-sm font-medium tabular-nums text-slate-700 sm:inline" aria-label={`Session duration ${Math.floor(sessionDurationSeconds / 60).toString().padStart(2, "0")}:${(sessionDurationSeconds % 60).toString().padStart(2, "0")}`}>
              {Math.floor(sessionDurationSeconds / 60).toString().padStart(2, "0")}:{(sessionDurationSeconds % 60).toString().padStart(2, "0")}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <section className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-700">Interview session</p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[1.75rem]">Live assistance</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Follow the conversation and review suggested answers as they’re generated.</p>
          </div>
          <p className="text-xs text-slate-500">Your session is processed through the connected backend.</p>
        </section>

        <div className="space-y-4">
          <RecordingControls
            canStart={canStart}
            durationSeconds={sessionDurationSeconds}
            error={
              recordingError ??
              sttError ??
              connectionError ??
              (isRecording && sttStatus === "closed"
                ? "The transcription session ended. Stop and start a new recording session."
                : null)
            }
            mimeType={recordingMimeType}
            onStart={() => void startRecording()}
            onStop={stopRecording}
            status={recordingStatus}
          />

          <PerformanceMetrics answers={answers} />

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.04fr)_minmax(390px,0.96fr)]">
            <TranscriptPanel
              connectionStatus={connectionStatus}
              interimTranscript={interimTranscript}
              recordingStatus={recordingStatus}
              segments={finalTranscripts}
              sttStatus={sttStatus}
            />

            <div className="space-y-4">
              <DetectedQuestionPanel
                question={detectedQuestion}
                status={questionDetectionStatus}
              />
              <AnswerPanel answers={answers} onCancel={cancelAnswer} />
            </div>
          </div>

          <CandidateContextPanel
            context={candidateContext}
            error={candidateContextError}
            key={candidateContextRevision}
            onSave={saveCandidateContext}
            status={candidateContextStatus}
          />
        </div>

        {isConnecting && <p aria-live="polite" className="sr-only">Connecting to the interview session.</p>}
      </div>
    </main>
  );
}
