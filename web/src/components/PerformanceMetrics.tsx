import type { GeneratedAnswer } from "@/hooks/useInterviewWebSocket";

type PerformanceMetricsProps = {
  answers: GeneratedAnswer[];
};

function formatLatency(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} ms`;
}

export function PerformanceMetrics({ answers }: PerformanceMetricsProps) {
  const latestMeasuredAnswer = answers.find(
    (answer) =>
      answer.status === "complete" &&
      (answer.timeToFirstTokenMs !== null ||
        answer.llmRequestLatencyMs !== null ||
        answer.totalMs !== null),
  );

  return (
    <section
      aria-label="Answer performance metrics"
      className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-slate-700">Response performance</h2>
          {latestMeasuredAnswer && (
            <span className="hidden text-[11px] text-slate-400 sm:inline">Latest completed answer</span>
          )}
        </div>
        {latestMeasuredAnswer ? (
          <dl className="grid grid-cols-3 gap-3 sm:flex sm:items-center sm:gap-7">
            <Metric label="First token" value={formatLatency(latestMeasuredAnswer.timeToFirstTokenMs)} />
            <Metric label="LLM request" value={formatLatency(latestMeasuredAnswer.llmRequestLatencyMs)} />
            <Metric label="Total response" value={formatLatency(latestMeasuredAnswer.totalMs)} />
          </dl>
        ) : (
          <p className="text-xs text-slate-500">Metrics will appear after an answer completes.</p>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-slate-100 pl-3 first:border-0 first:pl-0 sm:first:border-l sm:first:pl-0">
      <dt className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-[11px]">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800">{value}</dd>
    </div>
  );
}
