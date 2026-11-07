export type QuestionClassification =
  | "INTERVIEW_QUESTION"
  | "SMALL_TALK"
  | "STATEMENT"
  | "INCOMPLETE"
  | "AMBIGUOUS";

export type QuestionCategory =
  | "technical"
  | "experience"
  | "behavioral"
  | "scenario"
  | "general";

export interface QuestionDetectionResult {
  classification: QuestionClassification;
  normalizedText: string;
  ruleScore: number;
  reason: string;
  shouldTriggerAnswer: boolean;
  category: QuestionCategory | null;
}

export interface FinalizedSegment {
  id: string;
  text: string;
  speechFinal: boolean;
}

const SMALL_TALK_PATTERNS = [
  /^(?:hi|hello|hey|good morning|good afternoon|good evening|nice to meet you)[.!?]*$/i,
  /^how are you(?: doing)?(?: today)?[.!?]*$/i,
  /^(?:how'?s it going|how do you do|what about you|and you)[.!?]*$/i,
  /^how (?:was|is) your (?:weekend|day|morning|afternoon|evening)[.!?]*$/i,
  /^(?:are you comfortable|can you hear me|is the audio okay)[.!?]*$/i,
  /^(?:thanks for joining|thank you for joining|how is your day going)[.!?]*$/i,
];

const CONVERSATIONAL_STATEMENTS = [
  /^okay[, ]+let'?s move ahead[.!?]*$/i,
  /^(?:okay|ok|alright|all right|understood|sounds good|that'?s interesting|interesting|great|thanks)[.!?]*$/i,
];

const INCOMPLETE_PROMPT =
  /^(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:explain|describe|tell me about|walk me through)(?:\s*(?:\.{3,}|…))?$/i;

const BEHAVIORAL_PATTERNS = [
  /^(?:tell me about a time|describe a (?:challenging|difficult|tough|conflict|failure|mistake|successful) (?:situation|project|experience|time))\b.+/i,
  /^give me an example of (?:a time|how you|when you) .+/i,
];

const EXPERIENCE_PATTERNS = [
  /^tell me about yourself[.!?]*$/i,
  /^tell me about (?:your|an? experience|the) .+/i,
  /^describe your (?:experience|background|previous|past|current|last) .+/i,
  /^describe (?:your )?(?:previous|past|current|last) (?:project|role|experience) .*/i,
  /^what experience do you have (?:with|in) .+/i,
];

const SCENARIO_PATTERNS = [
  /^how would you\b.+/i,
  /^what would you do if\b.+/i,
  /^(?:suppose|imagine)\s+(?:that\s+)?you\b.+/i,
];

const EXPLANATION_PATTERNS = [
  /^explain\s+.+/i,
  /^walk me through\s+.+/i,
];

const YES_NO_QUESTION =
  /^(?:have|has|do|does|did|can|could|would|will|are|is|were|was)\s+(?:you|your team|yourself)\b\s+\S.+/i;

const WH_QUESTION =
  /^(?:what|why|how|who|when|where|which|whose|whom)\b\s+.+/i;

function result(
  classification: QuestionClassification,
  normalizedText: string,
  ruleScore: number,
  reason: string,
  category: QuestionCategory | null = null,
): QuestionDetectionResult {
  return {
    classification,
    normalizedText,
    ruleScore,
    reason,
    shouldTriggerAnswer: classification === "INTERVIEW_QUESTION",
    category,
  };
}

export function normalizeUtterance(utterance: string): string {
  return utterance
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectQuestion(utterance: string): QuestionDetectionResult {
  const normalizedText = normalizeUtterance(utterance);

  if (!normalizedText) {
    return result("INCOMPLETE", normalizedText, 100, "The utterance is empty.");
  }

  if (
    INCOMPLETE_PROMPT.test(normalizedText) ||
    /^(?:what|why|how|who|when|where|which|can|could|would|will|do|does|did|have|has|is|are)\b.+(?:\.{3,}|…)$/.test(
      normalizedText,
    )
  ) {
    return result(
      "INCOMPLETE",
      normalizedText,
      95,
      "The utterance starts a question or request but does not contain a complete thought.",
    );
  }

  if (SMALL_TALK_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
    return result(
      "SMALL_TALK",
      normalizedText,
      95,
      "The utterance is a greeting, check-in, or other social exchange.",
    );
  }

  if (CONVERSATIONAL_STATEMENTS.some((pattern) => pattern.test(normalizedText))) {
    return result(
      "STATEMENT",
      normalizedText,
      90,
      "The utterance is a conversational acknowledgment rather than an interview question.",
    );
  }

  if (BEHAVIORAL_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
    return result(
      "INTERVIEW_QUESTION",
      normalizedText,
      94,
      "The utterance requests a concrete behavioral example or challenging experience.",
      "behavioral",
    );
  }

  if (EXPERIENCE_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
    return result(
      "INTERVIEW_QUESTION",
      normalizedText,
      95,
      "The utterance explicitly asks about the candidate's background or experience.",
      "experience",
    );
  }

  if (SCENARIO_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
    return result(
      "INTERVIEW_QUESTION",
      normalizedText,
      94,
      "The utterance presents a hypothetical scenario for the candidate to solve.",
      "scenario",
    );
  }

  if (EXPLANATION_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
    return result(
      "INTERVIEW_QUESTION",
      normalizedText,
      93,
      "The utterance explicitly requests an explanation or walkthrough.",
      "technical",
    );
  }

  if (YES_NO_QUESTION.test(normalizedText)) {
    return result(
      "INTERVIEW_QUESTION",
      normalizedText,
      88,
      "The utterance is a complete yes/no question addressed to the candidate.",
      "general",
    );
  }

  if (WH_QUESTION.test(normalizedText)) {
    return result(
      "INTERVIEW_QUESTION",
      normalizedText,
      85,
      "The utterance is a complete WH-question requesting a substantive answer.",
      "technical",
    );
  }

  if (normalizedText.endsWith("?")) {
    return result(
      "AMBIGUOUS",
      normalizedText,
      50,
      "The utterance is phrased as a question but does not match a clear interview-question pattern.",
    );
  }

  return result(
    "STATEMENT",
    normalizedText,
    80,
    "The utterance does not match a complete interview-question pattern.",
  );
}

export class CompletedUtterancePipeline {
  private readonly seenSegmentIds = new Set<string>();
  private readonly finalSegments: string[] = [];

  addFinalSegment(segment: FinalizedSegment): QuestionDetectionResult | null {
    if (this.seenSegmentIds.has(segment.id)) {
      return null;
    }

    this.seenSegmentIds.add(segment.id);
    const text = normalizeUtterance(segment.text);
    if (text) {
      this.finalSegments.push(text);
    }

    return segment.speechFinal ? this.flush() : null;
  }

  signalUtteranceEnd(): QuestionDetectionResult | null {
    return this.flush();
  }

  flush(): QuestionDetectionResult | null {
    const utterance = this.finalSegments.join(" ").trim();
    this.finalSegments.length = 0;
    return utterance ? detectQuestion(utterance) : null;
  }
}
