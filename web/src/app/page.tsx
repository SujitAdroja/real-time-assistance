"use client";

import { useEffect } from "react";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { AnswerPanel } from "@/features/answer-generation/AnswerPanel";
import { CandidateContextPanel } from "@/features/candidate-context/CandidateContextPanel";
import { DetectedQuestionPanel } from "@/features/question-detection/DetectedQuestionPanel";
import { PerformanceMetrics } from "@/features/performance/PerformanceMetrics";
import { RecordingControls } from "@/features/recording/RecordingControls";
import { useAudioRecording } from "@/features/recording/useAudioRecording";
import { TranscriptPanel } from "@/features/transcription/TranscriptPanel";
import { useInterviewWebSocket } from "@/hooks/useInterviewWebSocket";

const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function Home() {
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
  const {
    canStart,
    durationSeconds: sessionDurationSeconds,
    isConnecting,
    isRecording,
    recordingError,
    recordingMimeType,
    recordingStatus,
    startRecording,
    stopRecording,
  } = useAudioRecording({
    connect,
    connectionStatus,
    sendAudioChunk,
    sendControlMessage,
    sttStatus,
  });

  useEffect(() => {
    const connectionTimer = window.setTimeout(() => {
      void connect();
    }, 0);

    return () => window.clearTimeout(connectionTimer);
  }, [connect]);

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
