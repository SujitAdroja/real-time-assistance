"use client";

import { useEffect, useRef } from "react";
import type { ConnectionStatus, RecordingStatus, TranscriptSegment } from "@/types/interview";

type TranscriptPanelProps = {
  segments: TranscriptSegment[];
  interimTranscript: string;
  recordingStatus: RecordingStatus;
  connectionStatus: ConnectionStatus;
  sttStatus: string;
};

const AUTO_SCROLL_THRESHOLD = 96;

export function TranscriptPanel({
  segments,
  interimTranscript,
  recordingStatus,
  connectionStatus,
  sttStatus,
}: TranscriptPanelProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript && shouldStickToBottomRef.current) {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }, [segments, interimTranscript]);

  return (
    <section
      aria-label="Live transcript"
      className="flex min-h-[32rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-950">Live transcript</h2>
            {recordingStatus === "recording" && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-rose-600" /> Recording
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">Recognized speech appears here in real time.</p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-slate-500">
          {segments.length} {segments.length === 1 ? "line" : "lines"}
        </span>
      </header>

      <div
        className="min-h-[27rem] flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6"
        onScroll={(event) => {
          const element = event.currentTarget;
          shouldStickToBottomRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            AUTO_SCROLL_THRESHOLD;
        }}
        ref={transcriptRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label="Transcript messages"
      >
        {segments.length === 0 && !interimTranscript && (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
            <span aria-hidden="true" className="mb-4 flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.5a6 6 0 0 0 6-6v-1m-12 0v1a6 6 0 0 0 6 6Zm0 0v3m-4 0h8M12 2.5a3 3 0 0 0-3 3v7a3 3 0 1 0 6 0v-7a3 3 0 0 0-3-3Z" /></svg>
            </span>
            <p className="text-sm font-medium text-slate-800">
              {connectionStatus === "error" || connectionStatus === "disconnected"
                ? "Waiting for a server connection"
                : recordingStatus === "recording"
                  ? "Listening for speech"
                  : "Your transcript will appear here"}
            </p>
            <p className="mt-1 max-w-xs text-sm leading-6 text-slate-500">
              {connectionStatus === "error" || connectionStatus === "disconnected"
                ? "Reconnect to the interview server to begin transcription."
                : sttStatus === "connecting" || recordingStatus === "starting"
                  ? "Connecting to transcription. This should only take a moment."
                  : "Start recording and speak naturally. Recognized speech will appear as it is processed."}
            </p>
          </div>
        )}

        {segments.map((segment) => (
          <article className="flex gap-3" key={segment.id}>
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-400" />
            <div className="min-w-0 border-b border-slate-100 pb-4">
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                {segment.text}
              </p>
              {segment.speechFinal && <span className="mt-1 inline-block text-[10px] font-medium uppercase tracking-wide text-slate-400">Final</span>}
            </div>
          </article>
        ))}

        {interimTranscript && (
          <article className="flex gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-4 py-3">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 animate-pulse rounded-full bg-indigo-600" />
            <div className="min-w-0">
              <p className="whitespace-pre-wrap text-sm leading-7 text-indigo-950">
                {interimTranscript}
              </p>
              <span className="mt-1 inline-block text-[10px] font-medium uppercase tracking-wide text-indigo-700">Interim · may change</span>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
