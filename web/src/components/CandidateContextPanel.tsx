"use client";

import { type FormEvent, useState } from "react";
import type {
  CandidateContextInput,
  CandidateContextStatus,
} from "@/hooks/useInterviewWebSocket";

type CandidateContextPanelProps = {
  context: CandidateContextInput;
  status: CandidateContextStatus;
  error: string | null;
  onSave: (context: CandidateContextInput) => void;
};

const MAX_CONTEXT_CHARS = 15_000;

export function CandidateContextPanel({
  context,
  status,
  error,
  onSave,
}: CandidateContextPanelProps) {
  const [resume, setResume] = useState(context.resume);
  const [jobDescription, setJobDescription] = useState(context.jobDescription);
  const [isDirty, setIsDirty] = useState(false);

  const saveContext = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsDirty(false);
    onSave({ resume, jobDescription });
  };

  const clearContext = () => {
    setResume("");
    setJobDescription("");
    setIsDirty(false);
    onSave({ resume: "", jobDescription: "" });
  };

  const displayedStatus = isDirty && status !== "error" ? "unsaved" : status;
  const statusMessage = (() => {
    switch (displayedStatus) {
      case "saving":
        return "Saving candidate context to this interview session…";
      case "saved":
        return "Candidate context is saved for this interview session.";
      case "unsaved":
        return "Context is held in this page but has not reached the backend yet.";
      case "error":
        return error ?? "Candidate context could not be saved.";
      default:
        return "No candidate context is saved. Answers will use the interview conversation only.";
    }
  })();

  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <summary className="cursor-pointer font-semibold text-slate-900">
        Candidate context (optional)
      </summary>
      <p className="mt-3 text-sm text-slate-600">
        Resume and job description text are sent to the backend for this
        WebSocket session only. They stay in backend memory and are cleared when
        that session ends. Each field can contain up to{" "}
        {MAX_CONTEXT_CHARS.toLocaleString()} characters.
      </p>
      <form className="mt-4 space-y-4" onSubmit={saveContext}>
        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor="candidate-resume">
              Resume
            </label>
            <span className="text-xs tabular-nums text-slate-500">
              {resume.length.toLocaleString()} / {MAX_CONTEXT_CHARS.toLocaleString()}
            </span>
          </div>
          <textarea
            aria-describedby="candidate-context-status"
            className="mt-1 min-h-32 w-full rounded-lg border border-slate-300 p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
            id="candidate-resume"
            maxLength={MAX_CONTEXT_CHARS}
            onChange={(event) => {
              setResume(event.target.value);
              setIsDirty(true);
            }}
            placeholder="Paste relevant resume content (optional)"
            value={resume}
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor="job-description">
              Job description
            </label>
            <span className="text-xs tabular-nums text-slate-500">
              {jobDescription.length.toLocaleString()} / {MAX_CONTEXT_CHARS.toLocaleString()}
            </span>
          </div>
          <textarea
            aria-describedby="candidate-context-status"
            className="mt-1 min-h-32 w-full rounded-lg border border-slate-300 p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
            id="job-description"
            maxLength={MAX_CONTEXT_CHARS}
            onChange={(event) => {
              setJobDescription(event.target.value);
              setIsDirty(true);
            }}
            placeholder="Paste the role's job description (optional)"
            value={jobDescription}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded-lg bg-slate-800 px-4 py-2 font-semibold text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"
            type="submit"
          >
            Save context
          </button>
          <button
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
            onClick={clearContext}
            type="button"
          >
            Clear context
          </button>
          <p
            aria-live="polite"
            className={`text-sm ${displayedStatus === "error" ? "text-rose-700" : "text-slate-600"}`}
            id="candidate-context-status"
            role={displayedStatus === "error" ? "alert" : "status"}
          >
            {statusMessage}
          </p>
        </div>
      </form>
    </details>
  );
}
