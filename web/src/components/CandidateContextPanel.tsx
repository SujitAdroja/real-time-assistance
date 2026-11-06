"use client";

import { useState } from "react";
import type { CandidateContextInput } from "@/hooks/useInterviewWebSocket";

type CandidateContextPanelProps = {
  context: CandidateContextInput;
  isSaved: boolean;
  onSave: (context: CandidateContextInput) => void;
};

export function CandidateContextPanel({
  context,
  isSaved,
  onSave,
}: CandidateContextPanelProps) {
  const [resume, setResume] = useState(context.resume);
  const [jobDescription, setJobDescription] = useState(context.jobDescription);

  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <summary className="cursor-pointer font-semibold text-slate-900">
        Candidate context (optional)
      </summary>
      <p className="mt-3 text-sm text-slate-600">
        Resume and job description text are sent to the backend for this
        connection only. They are kept in memory and used as reference data for
        generated answers.
      </p>
      <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="candidate-resume">
        Resume
      </label>
      <textarea
        className="mt-1 min-h-32 w-full rounded-lg border border-slate-300 p-3 text-sm"
        id="candidate-resume"
        maxLength={15_000}
        onChange={(event) => setResume(event.target.value)}
        placeholder="Paste relevant resume content (optional)"
        value={resume}
      />
      <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="job-description">
        Job description
      </label>
      <textarea
        className="mt-1 min-h-32 w-full rounded-lg border border-slate-300 p-3 text-sm"
        id="job-description"
        maxLength={15_000}
        onChange={(event) => setJobDescription(event.target.value)}
        placeholder="Paste the role's job description (optional)"
        value={jobDescription}
      />
      <div className="mt-4 flex items-center gap-3">
        <button
          className="rounded-lg bg-slate-800 px-4 py-2 font-semibold text-white hover:bg-slate-700"
          onClick={() => onSave({ resume, jobDescription })}
          type="button"
        >
          Save context
        </button>
        <span className="text-sm text-slate-600">
          {isSaved ? "Saved for this connection" : "Not saved to backend yet"}
        </span>
      </div>
    </details>
  );
}
