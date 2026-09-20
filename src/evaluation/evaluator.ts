import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import groundTruthQuestions from "./questions.json" with { type: "json" };

export interface GroundTruthQuestion {
  id: string;
  question: string;
  expectedTools?: string[];
  expectedKeywords?: string[];
}

export interface ToolCallLike {
  name?: string;
  tool?: string;
}

export interface TraceLike {
  totalLatency?: number;
  steps?: Array<{
    type?: string;
    tool?: string;
    content?: unknown;
    toolCalls?: Array<ToolCallLike>;
  }>;
}

export interface ToolCallingAccuracyMetric {
  expected: string[];
  actual: string[];
  passed: boolean;
  details: Array<{
    expected: string;
    actual: string;
    result: "✓" | "✗";
  }>;
}

export interface RetrievalHitRateMetric {
  expectedKeywords: string[];
  actualText: string;
  matched: string[];
  hit: boolean;
  summary: string;
}

export interface LatencyMetric {
  currentLatency: number;
  averageLatency: number;
  p95Latency: number;
  historyCount: number;
}

export interface AnswerQualityMetric {
  question: string;
  answer: string;
  score: number;
  method: "heuristic-fallback" | "llm-as-a-judge";
  summary: string;
}

export interface EvaluationResult {
  toolCallingAccuracy: ToolCallingAccuracyMetric;
  retrievalHitRate: RetrievalHitRateMetric | null;
  latency: LatencyMetric;
  answerQuality: AnswerQualityMetric;
}

const QUESTION_LIBRARY = groundTruthQuestions as GroundTruthQuestion[];

function normalizeToolName(name: string | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[？?！!。.,，；;:："“”'‘’()\[\]{}\-_/+=@#%&*<>\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeText(value: string): string[] {
  const matches = value.match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) ?? [];
  return [...new Set(matches.map((token) => token.trim().toLowerCase()).filter((token) => token.length > 1))];
}

function buildKeywordVariants(keyword: string): string[] {
  const cleaned = normalizeText(keyword);
  const variants = new Set<string>([cleaned]);

  if (!cleaned) {
    return [];
  }

  variants.add(cleaned.replace(/\s+/g, ""));

  const tokens = tokenizeText(cleaned);
  for (const token of tokens) {
    variants.add(token);
  }

  if (cleaned.includes("检索增强生成")) {
    variants.add("检索增强");
    variants.add("检索增强生成");
    variants.add("retrieval augmented generation");
  }

  if (cleaned.includes("容器")) {
    variants.add("容器编排");
    variants.add("容器化");
  }

  return [...variants].filter(Boolean);
}

function keywordMatches(keyword: string, text: string): boolean {
  const normalizedText = normalizeText(text);
  const variants = buildKeywordVariants(keyword);

  if (!normalizedText || variants.length === 0) {
    return false;
  }

  const textTokens = tokenizeText(normalizedText);

  for (const variant of variants) {
    const normalizedVariant = normalizeText(variant);
    if (!normalizedVariant) continue;

    if (normalizedText.includes(normalizedVariant)) {
      return true;
    }

    const variantTokens = tokenizeText(normalizedVariant);
    if (variantTokens.length === 0) continue;

    const overlap = variantTokens.filter((token) => textTokens.includes(token));
    if (overlap.length > 0 && overlap.length / variantTokens.length >= 0.4) {
      return true;
    }
  }

  return false;
}

function pickGroundTruth(question: string): GroundTruthQuestion | undefined {
  const normalized = normalizeText(question);
  const questionTokens = tokenizeText(normalized);

  if (!normalized) {
    return undefined;
  }

  const directMatch = QUESTION_LIBRARY.find((item) => normalizeText(item.question) === normalized);
  if (directMatch) {
    return directMatch;
  }

  const containsMatch = QUESTION_LIBRARY.find((item) => {
    const itemQuestion = normalizeText(item.question);
    return itemQuestion.includes(normalized) || normalized.includes(itemQuestion);
  });
  if (containsMatch) {
    return containsMatch;
  }

  return QUESTION_LIBRARY.find((item) => {
    const itemQuestion = normalizeText(item.question);
    const itemTokens = tokenizeText(itemQuestion);

    if (!itemTokens.length || !questionTokens.length) {
      return false;
    }

    const overlap = questionTokens.filter((token) => itemTokens.includes(token));
    if (overlap.length === 0) {
      return false;
    }

    const minLen = Math.min(questionTokens.length, itemTokens.length);
    return overlap.length / minLen >= 0.4;
  });
}

function flattenToolNames(toolCalls: Array<ToolCallLike> = []): string[] {
  const names = toolCalls
    .map((call) => normalizeToolName(call.name ?? call.tool))
    .filter(Boolean);

  return [...new Set(names)];
}

function flattenTraceToolNames(trace?: TraceLike): string[] {
  if (!trace?.steps) {
    return [];
  }

  const names: string[] = [];

  for (const step of trace.steps) {
    if (step.type === "agent" && step.toolCalls?.length) {
      names.push(...flattenToolNames(step.toolCalls));
    }

    if (step.type === "tool_result") {
      const toolName = normalizeToolName(step.tool);
      if (toolName) {
        names.push(toolName);
      }
    }
  }

  return [...new Set(names)];
}

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => toText(item)).join(" ");
  if (value && typeof value === "object") {
    if ("content" in (value as Record<string, unknown>)) {
      return toText((value as Record<string, unknown>).content);
    }

    if ("text" in (value as Record<string, unknown>)) {
      return toText((value as Record<string, unknown>).text);
    }

    return JSON.stringify(value);
  }

  return String(value ?? "");
}

function buildToolCallingAccuracy(
  actualTools: string[],
  expectedTools: string[] = []
): ToolCallingAccuracyMetric {
  const normalizedActual = [...new Set(actualTools.map((item) => normalizeToolName(item)).filter(Boolean))];
  const normalizedExpected = [...new Set(expectedTools.map((item) => normalizeToolName(item)).filter(Boolean))];

  const details: Array<{ expected: string; actual: string; result: "✓" | "✗" }> = normalizedExpected.map((expected) => ({
    expected,
    actual: normalizedActual.includes(expected) ? expected : "missing",
    result: normalizedActual.includes(expected) ? "✓" : "✗",
  }));

  const passed = details.every((item) => item.result === "✓");

  return {
    expected: normalizedExpected,
    actual: normalizedActual,
    passed,
    details,
  };
}

function buildRetrievalHitRate(
  expectedKeywords: string[] = [],
  actualText: string
): RetrievalHitRateMetric {
  const normalizedKeywords = expectedKeywords
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  const matched = normalizedKeywords.filter((keyword) => keywordMatches(keyword, actualText));
  const hit = matched.length > 0 || normalizedKeywords.length === 0;

  return {
    expectedKeywords: normalizedKeywords,
    actualText,
    matched,
    hit,
    summary: hit
      ? `Hit: ${matched.join(", ") || normalizedKeywords.join(", ")}`
      : `Miss: expected ${normalizedKeywords.join(", ")}`,
  };
}

function calculateP95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return Math.round(sorted[index] ?? 0);
}

function evaluateAnswerQuality(question: string, answer: string): AnswerQualityMetric {
  const lowerAnswer = answer.toLowerCase();
  const lowerQuestion = question.toLowerCase();

  let score = 3;
  const questionStem = lowerQuestion.split("?")[0]?.trim() ?? "";

  if (!answer || answer.trim().length < 10) {
    score = 1;
  } else if (lowerAnswer.includes("无法") || lowerAnswer.includes("not enough") || lowerAnswer.includes("没有相关")) {
    score = 2;
  } else if (questionStem && (lowerAnswer.includes(questionStem.slice(0, 12)) || lowerAnswer.length > 60)) {
    score = 4;
  } else {
    score = 5;
  }

  return {
    question,
    answer,
    score,
    method: "heuristic-fallback",
    summary: `Heuristic score ${score}/5`,
  };
}

function parseScoreFromJudgeResponse(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/\b([1-5])\b/);
  if (match) {
    return Number(match[1]);
  }

  return null;
}

async function judgeAnswerQualityWithLLM(question: string, answer: string): Promise<AnswerQualityMetric> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return evaluateAnswerQuality(question, answer);
  }

  try {
    const model = new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0,
      apiKey,
      configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
      },
    });

    const response = await model.invoke([
      new SystemMessage("You are a strict evaluator. Judge the answer quality for the user's question on a 1-5 scale. Return only a single integer 1-5. Consider correctness, completeness, usefulness, and clarity. Do not explain."),
      new HumanMessage(`Question:\n${question}\n\nAnswer:\n${answer}`),
    ]);

    const text = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    const score = parseScoreFromJudgeResponse(text);
    if (score === null) {
      return evaluateAnswerQuality(question, answer);
    }

    return {
      question,
      answer,
      score,
      method: "llm-as-a-judge",
      summary: `LLM judge score ${score}/5`,
    };
  } catch (error) {
    console.warn("LLM judge unavailable, falling back to heuristic scoring:", error);
    return evaluateAnswerQuality(question, answer);
  }
}

export async function evaluateConversation({
  question,
  answer,
  toolCalls,
  trace,
  history = [],
}: {
  question: string;
  answer: string;
  toolCalls?: ToolCallLike[];
  trace?: TraceLike;
  history?: Array<{ trace?: TraceLike }>;
}): Promise<EvaluationResult> {
  const groundTruth = pickGroundTruth(question);
  const actualToolNames = flattenTools(toolCalls, trace);
  const expectedTools = groundTruth?.expectedTools ?? [];

  const toolCallingAccuracy = buildToolCallingAccuracy(actualToolNames, expectedTools);

  const retrievalKeywords = groundTruth?.expectedKeywords ?? [];
  const retrievalActualText = trace?.steps
    ?.filter((step) => step.type === "tool_result")
    .map((step) => toText(step.content))
    .join(" ") || answer;

  const retrievalHitRate = retrievalKeywords.length > 0
    ? buildRetrievalHitRate(retrievalKeywords, retrievalActualText)
    : null;

  const latencyHistory = [
    ...(history ?? []).map((entry) => Number(entry?.trace?.totalLatency ?? 0)),
    Number(trace?.totalLatency ?? 0),
  ].filter((value) => Number.isFinite(value) && value >= 0);

  const averageLatency = latencyHistory.length > 0
    ? Math.round(latencyHistory.reduce((sum, value) => sum + value, 0) / latencyHistory.length)
    : 0;

  const p95Latency = latencyHistory.length > 0
    ? calculateP95(latencyHistory)
    : 0;

  const answerQuality = await judgeAnswerQualityWithLLM(question, answer);

  return {
    toolCallingAccuracy,
    retrievalHitRate,
    latency: {
      currentLatency: Number(trace?.totalLatency ?? 0),
      averageLatency,
      p95Latency,
      historyCount: latencyHistory.length,
    },
    answerQuality,
  };
}

function flattenTools(
  toolCalls?: ToolCallLike[],
  trace?: TraceLike
): string[] {
  const namesFromCalls = flattenToolNames(toolCalls ?? []);
  const namesFromTrace = flattenTraceToolNames(trace);
  return [...new Set([...namesFromCalls, ...namesFromTrace])];
}

export function getGroundTruthQuestion(question: string): GroundTruthQuestion | undefined {
  return pickGroundTruth(question);
}
