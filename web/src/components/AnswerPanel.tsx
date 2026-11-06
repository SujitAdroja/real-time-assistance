"use client";

import { useState } from "react";
import type { GeneratedAnswer } from "@/hooks/useInterviewWebSocket";

type AnswerPanelProps = {
  answers: GeneratedAnswer[];
  onCancel: (questionId: string) => void;
};

function getStatusLabel(answer: GeneratedAnswer): string {
  switch (answer.status) {
    case "generating":
      return "Generating answer…";
    case "complete":
      return "Answer complete";
    case "error":
      return answer.error ?? "Answer generation failed.";
    case "cancelled":
      return "Answer cancelled.";
  }
}

export function AnswerPanel({ answers, onCancel }: AnswerPanelProps) {
  const [copyStatusByQuestion, setCopyStatusByQuestion] = useState<
    Record<string, "copied" | "error">
  >({});

  const copyAnswer = async (answer: GeneratedAnswer) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable in this browser.");
      }

      await navigator.clipboard.writeText(answer.content);
      setCopyStatusByQuestion((previous) => ({
        ...previous,
        [answer.questionId]: "copied",
      }));
    } catch (error) {
      console.error("Could not copy generated answer:", error);
      setCopyStatusByQuestion((previous) => ({
        ...previous,
        [answer.questionId]: "error",
      }));
    }
  };

  return (
    <section
      aria-live="polite"
      aria-label="Generated answers"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-950">Suggested answer</h2>
          <p className="mt-1 text-xs text-slate-500">
            Generated from the detected question and saved candidate context
          </p>
        </div>
        {answers.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {answers.length} {answers.length === 1 ? "answer" : "answers"}
          </span>
        )}
      </header>

      {answers.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-700">No answer yet</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            When an interview question is detected, its answer will appear here.
          </p>
        </div>
      ) : (
        <div className="mt-4 max-h-[34rem] space-y-4 overflow-y-auto">
          {answers.map((answer) => (
            <article
              className="rounded-xl border border-slate-200 bg-white p-4"
              key={answer.questionId}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="min-w-0 flex-1 text-sm font-semibold leading-6 text-slate-900">
                  {answer.question}
                </p>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    answer.status === "complete"
                      ? "bg-emerald-50 text-emerald-800"
                      : answer.status === "error"
                        ? "bg-rose-50 text-rose-800"
                        : answer.status === "generating"
                          ? "bg-indigo-50 text-indigo-800"
                          : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {getStatusLabel(answer)}
                </span>
              </div>

              {answer.content ? (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {answer.content}
                  {answer.status === "generating" && (
                    <span aria-label="Generating" className="ml-1 animate-pulse text-indigo-600">
                      ▍
                    </span>
                  )}
                </p>
              ) : answer.status === "generating" ? (
                <p className="mt-3 text-sm text-slate-500">Waiting for the first answer tokens…</p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-500">Model: {answer.model}</p>
                <div className="flex items-center gap-3">
                  {copyStatusByQuestion[answer.questionId] === "copied" && (
                    <span className="text-xs font-medium text-emerald-700" role="status">
                      Copied
                    </span>
                  )}
                  {copyStatusByQuestion[answer.questionId] === "error" && (
                    <span className="text-xs text-rose-700" role="status">
                      Copy failed. Select and copy the text instead.
                    </span>
                  )}
                  <button
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:cursor-not-allowed disabled:text-slate-400"
                    disabled={answer.status !== "complete" || !answer.content}
                    onClick={() => void copyAnswer(answer)}
                    type="button"
                  >
                    Copy answer
                  </button>
                </div>
              </div>

              {answer.status === "generating" && (
                <button
                  className="mt-3 text-xs font-semibold text-rose-700 underline underline-offset-2"
                  onClick={() => onCancel(answer.questionId)}
                  type="button"
                >
                  Cancel answer
                </button>
              )}
              {answer.status === "complete" && (
                <p className="mt-3 text-xs text-slate-500">
                  {answer.timeToFirstTokenMs === null
                    ? "First-token timing unavailable"
                    : `First token: ${answer.timeToFirstTokenMs} ms`}
                  {answer.totalMs === null ? "" : ` · Total: ${answer.totalMs} ms`}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
