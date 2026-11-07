"use client";

import type {
  DetectedQuestion,
  QuestionDetectionStatus,
} from "@/hooks/useInterviewWebSocket";

type DetectedQuestionPanelProps = {
  question: DetectedQuestion | null;
  status: QuestionDetectionStatus | null;
};

function getDetectionStatus(status: QuestionDetectionStatus | null): string {
  if (!status) {
    return "Waiting for a completed utterance.";
  }

  if (status.shouldTriggerAnswer) {
    return "Interview question detected.";
  }

  switch (status.classification) {
    case "SMALL_TALK":
      return "Small talk ignored.";
    case "INCOMPLETE":
      return "Incomplete utterance ignored.";
    case "AMBIGUOUS":
      return "Ambiguous utterance ignored.";
    default:
      return "No interview question detected.";
  }
}

export function DetectedQuestionPanel({
  question,
  status,
}: DetectedQuestionPanelProps) {
  return (
    <section
      aria-live="polite"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
      aria-label="Detected interview question"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-indigo-700">Detected question</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-950">Interview question</h2>
        </div>
        <span className="rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
          {getDetectionStatus(status)}
        </span>
      </header>

      {question ? (
        <div className="px-5 py-4">
          <p className="border-l-2 border-indigo-600 pl-3 text-sm font-medium leading-6 text-slate-900">
            {question.text}
          </p>
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
            <div className="flex gap-1">
              <dt>Category</dt>
              <dd className="font-medium capitalize text-slate-700">{question.category}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Detected</dt>
              <dd className="font-medium text-slate-700">
                {new Date(question.detectedAt).toLocaleTimeString()}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="mx-5 my-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm leading-6 text-slate-500">
          A detected interview question will appear here. Greetings and small talk are filtered out.
        </p>
      )}
      {status && <p className="px-5 pb-4 text-xs leading-5 text-slate-500">{status.reason}</p>}
    </section>
  );
}
