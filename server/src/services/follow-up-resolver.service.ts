import type { ConversationTurn } from "./prompt-builder.service.js";

export type FollowUpInterpretation = {
  originalQuestion: string;
  resolvedQuestion: string;
  reason: string;
  relevantConversation: ConversationTurn[];
};

function getPreviousSubject(turn: ConversationTurn): string {
  const question = turn.question.trim().replace(/\s+/g, " ");
  const subjectPatterns = [
    /^(?:what|who)\s+(?:is|are|was|were)\s+(?:(?:a|an|the)\s+)?(.+?)[?.!]*$/i,
    /^how\s+(?:does|do|did)\s+(.+?)\s+(?:work|works|function|functions)[?.!]*$/i,
    /^(?:explain|describe|define)\s+(?:how\s+)?(.+?)[?.!]*$/i,
    /^(?:tell me about|walk me through)\s+(.+?)[?.!]*$/i,
  ];

  for (const pattern of subjectPatterns) {
    const subject = question.match(pattern)?.[1]?.trim();
    if (subject) {
      return subject.replace(/[?.!]+$/, "");
    }
  }

  return `the subject discussed in the previous exchange ("${question.slice(0, 120)}")`;
}

const FOLLOW_UP_PATTERNS: readonly {
  pattern: RegExp;
  resolve: (question: string, previousTurn: ConversationTurn) => string;
  reason: string;
}[] = [
  {
    pattern: /^(?:why|how|what|and)[?.!]*$/i,
    resolve: (question, previousTurn) => {
      const subject = getPreviousSubject(previousTurn);
      return question.toLowerCase().startsWith("why")
        ? `Explain why ${subject} matters or was chosen, using the previous exchange without assuming an unstated reason.`
        : `Explain ${subject} in the context of the immediately preceding exchange.`;
    },
    reason: "Short follow-up referring to the immediately preceding exchange.",
  },
  {
    pattern: /^(?:what about|what are|what were|and what about)\s+(?:its|their|those|these|them)\b/i,
    resolve: (question, previousTurn) => {
      const aspect =
        question.match(/\b(disadvantages|advantages|benefits|limitations|risks|drawbacks|pros|cons)\b/i)?.[1] ??
        "the aspect asked about";
      return `Discuss the ${aspect} of ${getPreviousSubject(previousTurn)}.`;
    },
    reason: "The follow-up contains a pronoun referring to the preceding exchange.",
  },
  {
    pattern:
      /^(?:how did you|how do you|how would you)\s+(?:implement|build|use|choose|apply|configure|design|solve|handle|approach)\b.*\b(?:it|that|this|them|those)\b/i,
    resolve: (_question, previousTurn) =>
      `Explain how to implement or apply the approach discussed in the immediately preceding exchange about ${getPreviousSubject(previousTurn)}. Do not assume the candidate personally implemented it unless supported by the resume.`,
    reason: "The follow-up asks about implementing or applying a previously discussed subject.",
  },
  {
    pattern:
      /^(?:can|could) you (?:explain|elaborate|expand)\s+(?:(?:further|more)|(?:that|this|it|them|those)(?:\s+(?:further|more))?)[?.!]*$/i,
    resolve: (_question, previousTurn) =>
      `Explain ${getPreviousSubject(previousTurn)} in more detail, using the immediately preceding exchange.`,
    reason: "The follow-up explicitly asks to elaborate on the preceding exchange.",
  },
  {
    pattern: /^(?:tell me more|say more|go on)[?.!]*$/i,
    resolve: (_question, previousTurn) =>
      `Continue explaining ${getPreviousSubject(previousTurn)} based on the immediately preceding exchange.`,
    reason: "The request to continue depends on the preceding exchange.",
  },
];

const MAX_RELEVANT_FOLLOW_UP_TURNS = 2;

export function resolveFollowUpQuestion(
  question: string,
  recentConversation: readonly ConversationTurn[],
): FollowUpInterpretation | null {
  const originalQuestion = question.trim().replace(/\s+/g, " ");
  if (!originalQuestion || recentConversation.length === 0) {
    return null;
  }

  const match = FOLLOW_UP_PATTERNS.find(({ pattern }) => pattern.test(originalQuestion));
  if (!match) {
    return null;
  }

  const relevantConversation = recentConversation
    .slice(-MAX_RELEVANT_FOLLOW_UP_TURNS)
    .map((turn) => ({ ...turn }));
  const previousTurn = relevantConversation.at(-1);
  if (!previousTurn) {
    return null;
  }

  return {
    originalQuestion,
    resolvedQuestion: match.resolve(originalQuestion, previousTurn),
    reason: match.reason,
    relevantConversation,
  };
}
