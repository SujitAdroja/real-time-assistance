"use client";

import { StatusIndicator } from "@/components/ui/StatusIndicator";
import type { RecordingStatus } from "@/types/interview";

type RecordingControlsProps = {
  status: RecordingStatus;
  durationSeconds: number;
  mimeType: string | null;
  canStart: boolean;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
};

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function getRecordingTone(status: RecordingStatus): "success" | "warning" | "neutral" {
  if (status === "recording") {
    return "success";
  }

  if (status === "starting" || status === "stopping") {
    return "warning";
  }

  return "neutral";
}

function getRecordingLabel(status: RecordingStatus): string {
  switch (status) {
    case "starting":
      return "Starting";
    case "recording":
      return "Recording";
    case "stopping":
      return "Stopping";
    default:
      return "Stopped";
  }
}

export function RecordingControls({
  status,
  durationSeconds,
  mimeType,
  canStart,
  error,
  onStart,
  onStop,
}: RecordingControlsProps) {
  return (
    <section
      aria-label="Recording controls"
      className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">Recording</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <StatusIndicator
              label="Microphone"
              status={getRecordingLabel(status)}
              tone={getRecordingTone(status)}
            />
            <p
              aria-label={`Session duration ${formatDuration(durationSeconds)}`}
              className="font-mono text-base font-semibold tabular-nums text-slate-800"
            >
              {formatDuration(durationSeconds)}
            </p>
          </div>
        </div>

        <div className="flex w-full gap-2 sm:w-auto">
          <button
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md bg-indigo-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:flex-none"
            disabled={!canStart || status !== "idle"}
            onClick={onStart}
            type="button"
          >
            {status === "starting" ? (
              <>
                <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Connecting…
              </>
            ) : (
              <>
                <span aria-hidden="true" className="size-2.5 rounded-full bg-white" />
                Start recording
              </>
            )}
          </button>
          <button
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:cursor-not-allowed disabled:text-slate-400 sm:flex-none"
            disabled={status !== "recording"}
            onClick={onStop}
            type="button"
          >
            <span aria-hidden="true" className="size-2.5 rounded-sm bg-current" />
            Stop
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
        <p>Audio streams through the backend for transcription.</p>
        {mimeType && <p className="font-mono">Audio format: {mimeType}</p>}
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
