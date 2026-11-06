import type { ConversationTurn } from "./prompt-builder.service.js";

export type FollowUpResolutionStatus = "RESOLVED" | "AMBIGUOUS" | "STANDALONE";

export type FollowUpResolution = {
  status: FollowUpResolutionStatus;
  originalQuestion: string;
  referencedTopic: string | null;
  resolvedQuestion: string | null;
  reason: string;
  relevantTurnIds: string[];
  relevantConversation: ConversationTurn[];
};

const MAX_RELEVANT_FOLLOW_UP_TURNS = 2;

const CONTEXTUAL_FOLLOW_UP_PATTERNS = [
  /^(?:why|how|what|and)[?.!]*$/i,
  /^(?:what about|what are|what were|and what about)\s+(?:its|their|those|these|them)\b/i,
  /^(?:how did you|how do you|how would you)\s+(?:implement|build|use|choose|apply|configure|design|solve|handle|approach)\b.*\b(?:it|that|this|them|those)\b/i,
  /^(?:can|could) you (?:explain|elaborate|expand)\s+(?:(?:further|more)|(?:that|this|it|them|those)(?:\s+(?:further|more))?)[?.!]*$/i,
  /^(?:tell me more|say more|go on)[?.!]*$/i,
];

const EXPLICIT_REFERENCE_PATTERNS = [
  /^(?:why did you choose|why choose|why use|why are you using|why did you use)\s+(.+?)[?.!]*$/i,
];

const TOPIC_PATTERNS = [
  /^(?:what|who)\s+(?:is|are|was|were)\s+(?:(?:a|an|the)\s+)?(.+?)[?.!]*$/i,
  /^how\s+(?:is|are)\s+(.+?)\s+(?:evaluated|measured|tested|deployed|implemented|used)[?.!]*$/i,
  /^how\s+(?:does|do|is|are)\s+(.+?)(?:\s+(?:work|works|function|functions))?[?.!]*$/i,
  /^(?:explain|describe|define)\s+(?:how\s+)?(.+?)[?.!]*$/i,
  /^(?:tell me about|walk me through)\s+(.+?)[?.!]*$/i,
  /^(?:why did you choose|why choose|why use|why are you using|why did you use)\s+(.+?)[?.!]*$/i,
  /^(?:what are|what is)\s+(?:the\s+)?(?:advantages|disadvantages|benefits|limitations|risks|drawbacks|pros|cons)\s+of\s+(.+?)[?.!]*$/i,
  /^(?:have you worked with|have you used|do you know)\s+(.+?)[?.!]*$/i,
];

const NON_SPECIFIC_TOPICS = new Set([
  "yourself",
  "your background",
  "your experience",
  "your career",
]);

function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ");
}

function normalizeTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+#.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:a|an|the)\s+/, "");
}

function extractTopic(question: string): string | null {
  for (const pattern of TOPIC_PATTERNS) {
    const topic = question.match(pattern)?.[1]?.trim().replace(/[?.!]+$/, "");
    if (topic) {
      return NON_SPECIFIC_TOPICS.has(normalizeTopic(topic)) ? null : topic;
    }
  }
  return null;
}

function doesTopicMatch(candidate: string, referencedTopic: string): boolean {
  const normalizedCandidate = normalizeTopic(candidate);
  const normalizedReference = normalizeTopic(referencedTopic);
  return (
    normalizedCandidate === normalizedReference ||
    normalizedCandidate.includes(normalizedReference) ||
    normalizedReference.includes(normalizedCandidate)
  );
}

function createResolution(
  status: FollowUpResolutionStatus,
  originalQuestion: string,
  relevantConversation: readonly ConversationTurn[],
  options: {
    referencedTopic?: string | null;
    resolvedQuestion?: string | null;
    reason: string;
  },
): FollowUpResolution {
  const turns = relevantConversation.map((turn) => ({ ...turn }));
  return {
    status,
    originalQuestion,
    referencedTopic: options.referencedTopic ?? null,
    resolvedQuestion: options.resolvedQuestion ?? null,
    reason: options.reason,
    relevantTurnIds: turns.map((turn) => turn.questionId),
    relevantConversation: turns,
  };
}

function resolveExplicitReference(
  question: string,
  originalQuestion: string,
  recentConversation: readonly ConversationTurn[],
): FollowUpResolution | null {
  const explicitTopic = EXPLICIT_REFERENCE_PATTERNS
    .map((pattern) => question.match(pattern)?.[1]?.trim())
    .find((topic): topic is string => Boolean(topic));

  if (!explicitTopic) {
    return null;
  }

  const matchingTurns = recentConversation.filter((turn) => {
    const previousTopic = extractTopic(turn.question);
    return previousTopic !== null && doesTopicMatch(previousTopic, explicitTopic);
  });

  if (matchingTurns.length === 0) {
    return createResolution("STANDALONE", originalQuestion, [], {
      reason: "The question names its subject and does not refer to a topic in recent history.",
    });
  }

  const matchedTopics = new Set(
    matchingTurns
      .map((turn) => extractTopic(turn.question))
      .filter((topic): topic is string => topic !== null)
      .map(normalizeTopic),
  );
  if (matchedTopics.size !== 1) {
    return createResolution("AMBIGUOUS", originalQuestion, matchingTurns, {
      reason: "The explicitly named subject matches multiple distinct recent topics.",
    });
  }

  const referencedTopic = extractTopic(matchingTurns.at(-1)!.question)!;
  return createResolution("RESOLVED", originalQuestion, matchingTurns, {
    referencedTopic,
    resolvedQuestion: `Answer the question about ${referencedTopic}, using the matching recent exchanges only for continuity.`,
    reason: "The question explicitly names one topic discussed in recent history.",
  });
}

function resolveContextualReference(
  question: string,
  originalQuestion: string,
  recentConversation: readonly ConversationTurn[],
): FollowUpResolution {
  const possibleTopics = recentConversation
    .map((turn) => ({ turn, topic: extractTopic(turn.question) }))
    .filter((entry): entry is { turn: ConversationTurn; topic: string } => entry.topic !== null);
  const topicGroups = new Map<string, { topic: string; turns: ConversationTurn[] }>();

  for (const { turn, topic } of possibleTopics) {
    const key = normalizeTopic(topic);
    const group = topicGroups.get(key) ?? { topic, turns: [] };
    group.turns.push(turn);
    topicGroups.set(key, group);
  }

  if (topicGroups.size !== 1 || possibleTopics.length !== recentConversation.length) {
    return createResolution(
      "AMBIGUOUS",
      originalQuestion,
      recentConversation,
      {
        reason:
          topicGroups.size === 0 || possibleTopics.length !== recentConversation.length
            ? "The question depends on a previous reference, but no clear antecedent is available."
            : "Multiple recent topics could be the antecedent; ask the interviewer which one they mean.",
      },
    );
  }

  const group = [...topicGroups.values()][0]!;
  const lowerQuestion = question.toLowerCase();
  const resolvedQuestion = lowerQuestion.startsWith("why")
    ? `Explain why ${group.topic} matters or was chosen, without assuming an unstated reason.`
    : lowerQuestion.startsWith("what about") || /\b(?:advantages|disadvantages|benefits|limitations|risks|drawbacks|pros|cons)\b/i.test(question)
      ? `Discuss the requested aspect of ${group.topic}.`
      : `Explain ${group.topic} in the context of the relevant previous exchange.`;

  return createResolution("RESOLVED", originalQuestion, group.turns, {
    referencedTopic: group.topic,
    resolvedQuestion,
    reason: "The contextual follow-up has one clear topic in recent history.",
  });
}

export function resolveFollowUpQuestion(
  question: string,
  recentConversation: readonly ConversationTurn[],
): FollowUpResolution {
  const originalQuestion = normalizeQuestion(question);
  const recentTurns = recentConversation.slice(-MAX_RELEVANT_FOLLOW_UP_TURNS);

  if (!originalQuestion) {
    return createResolution("STANDALONE", originalQuestion, [], {
      reason: "No interview question was provided.",
    });
  }

  const explicit = resolveExplicitReference(originalQuestion, originalQuestion, recentTurns);
  if (explicit) {
    return explicit;
  }

  if (CONTEXTUAL_FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(originalQuestion))) {
    return resolveContextualReference(originalQuestion, originalQuestion, recentTurns);
  }

  return createResolution("STANDALONE", originalQuestion, [], {
    reason: "The question is self-contained and does not refer to recent conversation.",
  });
}
