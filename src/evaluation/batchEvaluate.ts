import questions from "./questions.json" with { type: "json" };
import { evaluateConversation } from "./evaluator.js";

const dataset = questions as Array<{
  id: string;
  question: string;
  expectedTools?: string[];
  expectedKeywords?: string[];
}>;

function simulateAnswer(question: string) {
  if (question.includes("RAG") || question.includes("检索增强生成")) {
    return "RAG 是检索增强生成，它让模型先检索相关知识再生成答案。";
  }

  if (question.includes("Kubernetes")) {
    return "Kubernetes 是一个容器编排平台，用于自动部署和管理容器化应用。";
  }

  if (question.includes("123") && question.includes("456")) {
    return "123 × 456 = 56088";
  }

  if (question.includes("东京") || question.includes("几点")) {
    return "我无法直接获取你当前时区的系统时间。";
  }

  if (question.includes("张伟") || question.includes("赵敏") || question.includes("王强")) {
    return "我会查询员工信息。";
  }

  return "这是一个常规回答。";
}

function simulateToolCall(question: string) {
  if (question.includes("RAG") || question.includes("Kubernetes")) {
    return [{ name: "rag_search" }];
  }

  if (question.includes("123") && question.includes("456")) {
    return [{ name: "calculator" }];
  }

  if (question.includes("东京") || question.includes("几点")) {
    return [{ name: "date_time" }];
  }

  if (question.includes("张伟") || question.includes("赵敏") || question.includes("王强")) {
    return [{ name: "employee_lookup" }];
  }

  return [];
}

function simulateTrace(question: string) {
  const tools = simulateToolCall(question);
  const steps: Array<{ type: string; tool?: string; toolCalls?: Array<{ name: string }>; content?: string }> = [];

  if (tools.length > 0) {
    steps.push({
      type: "agent",
      toolCalls: tools,
    });

    for (const tool of tools) {
      steps.push({
        type: "tool_result",
        tool: tool.name,
        content: tool.name === "rag_search" ? "RAG 检索增强生成" : "已执行",
      });
    }
  }

  return {
    totalLatency: 600 + Math.floor(Math.random() * 700),
    steps,
  };
}

const results = await Promise.all(dataset.map(async (entry) => {
  const answer = simulateAnswer(entry.question);
  const toolCalls = simulateToolCall(entry.question);
  const trace = simulateTrace(entry.question);

  const evaluation = await evaluateConversation({
    question: entry.question,
    answer,
    toolCalls,
    trace,
  });

  return {
    id: entry.id,
    question: entry.question,
    expectedTools: entry.expectedTools ?? [],
    expectedKeywords: entry.expectedKeywords ?? [],
    actualTools: toolCalls.map((tool) => tool.name),
    toolPassed: evaluation.toolCallingAccuracy.passed,
    retrievalHit: evaluation.retrievalHitRate?.hit ?? false,
    latency: evaluation.latency,
    answerScore: evaluation.answerQuality.score,
  };
}));

const total = results.length;
const toolPassRate = results.filter((item) => item.toolPassed).length / total;
const retrievalHitRate = results.filter((item) => item.retrievalHit).length / total;
const averageLatency = Math.round(results.reduce((sum, item) => sum + (item.latency.currentLatency ?? 0), 0) / total);
const averageScore = results.reduce((sum, item) => sum + item.answerScore, 0) / total;

console.log(JSON.stringify({
  total,
  toolPassRate,
  retrievalHitRate,
  averageLatency,
  averageScore,
  results,
}, null, 2));
