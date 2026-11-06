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
      className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-6"
      aria-label="Detected interview question"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">
          Latest detected question
        </h2>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-indigo-800">
          {getDetectionStatus(status)}
        </span>
      </div>

      {question ? (
        <div className="mt-4">
          <p className="text-lg leading-7 text-slate-900">{question.text}</p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
            <div>
              <dt className="inline font-medium">Category: </dt>
              <dd className="inline capitalize">{question.category}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Detected: </dt>
              <dd className="inline">
                {new Date(question.detectedAt).toLocaleTimeString()}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="mt-4 text-slate-600">
          A completed interview question will appear here. Greetings and other
          small talk are filtered out.
        </p>
      )}
      {status && <p className="mt-3 text-sm text-slate-600">{status.reason}</p>}
    </section>
  );
}
