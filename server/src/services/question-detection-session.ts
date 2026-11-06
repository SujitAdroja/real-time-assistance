import {
  CompletedUtterancePipeline,
  type FinalizedSegment,
  type QuestionCategory,
  type QuestionClassification,
} from "./question-detection.service.js";

export type QuestionDetectionEvent =
  | {
      type: "question:status";
      classification: QuestionClassification;
      reason: string;
      shouldTriggerAnswer: boolean;
    }
  | {
      type: "question:detected";
      id: string;
      text: string;
      category: QuestionCategory;
      detectedAt: number;
    };

export class QuestionDetectionSession {
  private readonly pipeline = new CompletedUtterancePipeline();
  private questionId = 0;

  constructor(
    private readonly sessionId: string,
    private readonly emit: (event: QuestionDetectionEvent) => void,
    private readonly now: () => number = Date.now,
  ) {}

  addFinalSegment(segment: FinalizedSegment): void {
    this.report(this.pipeline.addFinalSegment(segment));
  }

  signalUtteranceEnd(): void {
    this.report(this.pipeline.signalUtteranceEnd());
  }

  flush(): void {
    this.report(this.pipeline.flush());
  }

  private report(
    detection: ReturnType<CompletedUtterancePipeline["flush"]>,
  ): void {
    if (!detection) {
      return;
    }

    this.emit({
      type: "question:status",
      classification: detection.classification,
      reason: detection.reason,
      shouldTriggerAnswer: detection.shouldTriggerAnswer,
    });

    if (!detection.shouldTriggerAnswer || !detection.category) {
      return;
    }

    this.questionId += 1;
    this.emit({
      type: "question:detected",
      id: `question-${this.sessionId}-${this.questionId}`,
      text: detection.normalizedText,
      category: detection.category,
      detectedAt: this.now(),
    });
  }
}
