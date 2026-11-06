"use client";

import { useEffect, useRef } from "react";
import type { TranscriptSegment } from "@/hooks/useInterviewWebSocket";

type TranscriptPanelProps = {
  segments: TranscriptSegment[];
  interimTranscript: string;
};

const AUTO_SCROLL_THRESHOLD = 96;

export function TranscriptPanel({
  segments,
  interimTranscript,
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
      className="flex min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <h2 className="font-semibold text-slate-950">Live transcript</h2>
          <p className="mt-1 text-xs text-slate-500">
            Finalized speech and the current interim phrase
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          {segments.length} {segments.length === 1 ? "segment" : "segments"}
        </span>
      </header>

      <div
        className="max-h-[34rem] min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6"
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
            <span
              aria-hidden="true"
              className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-indigo-50 text-xl text-indigo-700"
            >
              …
            </span>
            <p className="font-medium text-slate-800">Your transcript will appear here</p>
            <p className="mt-1 max-w-xs text-sm leading-6 text-slate-500">
              Start the session and speak naturally. Live speech is shown as it is recognized.
            </p>
          </div>
        )}

        {segments.map((segment) => (
          <article className="flex gap-3" key={segment.id}>
            <span
              aria-hidden="true"
              className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-500"
            />
            <div className="min-w-0">
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
                {segment.text}
              </p>
              <span className="mt-1 inline-block text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                Final
              </span>
            </div>
          </article>
        ))}

        {interimTranscript && (
          <article className="flex gap-3 rounded-xl bg-indigo-50/80 px-4 py-3">
            <span
              aria-hidden="true"
              className="mt-1.5 size-2 shrink-0 animate-pulse rounded-full bg-indigo-500"
            />
            <div className="min-w-0">
              <p className="whitespace-pre-wrap text-sm italic leading-7 text-indigo-900">
                {interimTranscript}
              </p>
              <span className="mt-1 inline-block text-[11px] font-medium uppercase tracking-wide text-indigo-700">
                Live · may change
              </span>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
