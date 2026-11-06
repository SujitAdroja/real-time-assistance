"use client";

type StatusTone = "success" | "warning" | "error" | "neutral";

type StatusIndicatorProps = {
  label: string;
  status: string;
  tone: StatusTone;
};

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  error: "bg-rose-50 text-rose-800 ring-rose-200",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
};

const DOT_CLASSES: Record<StatusTone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-rose-500",
  neutral: "bg-slate-400",
};

export function StatusIndicator({ label, status, tone }: StatusIndicatorProps) {
  return (
    <span
      aria-label={`${label}: ${status}`}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${DOT_CLASSES[tone]}`} />
      <span>{label}</span>
      <span className="font-medium opacity-80">{status}</span>
    </span>
  );
}
