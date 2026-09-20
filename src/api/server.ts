import "dotenv/config";
import express from "express";
import cors from "cors";
import { HumanMessage,AIMessage, ToolMessage } from "@langchain/core/messages";
import { agent } from "../agent/graph.js";
import { evaluateConversation } from "../evaluation/evaluator.js";

const server = express();

server.use(cors());
server.use(express.json());

server.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "EnterprisePilot",
  });
});

function isAiMessageLike(message: any) {
  return !!message && (
    message instanceof AIMessage ||
    message.type === "ai" ||
    message.constructor?.name === "AIMessage" ||
    Array.isArray(message.tool_calls)
  );
}

function isToolMessageLike(message: any) {
  return !!message && (
    message instanceof ToolMessage ||
    message.type === "tool" ||
    message.constructor?.name === "ToolMessage" ||
    (!!message.name && !!message.tool_call_id)
  );
}

function buildTrace(messages: any[]) {
  const steps: any[] = [];

  for (const message of messages) {
    if (!message) continue;

    if (isAiMessageLike(message)) {
      if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        steps.push({
          type: "agent",
          status: "tool_call",
          toolCalls: message.tool_calls.map((call: any) => ({
            name: call.name,
            args: call.args,
            id: call.id,
          })),
        });
      } else if (message.content) {
        steps.push({
          type: "agent",
          status: "final_answer",
        });
      }
    }

    if (isToolMessageLike(message)) {
      steps.push({
        type: "tool_result",
        tool: message.name,
        toolCallId: message.tool_call_id,
        content: message.content,
      });
    }
  }

  return steps;
}

server.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "message 必须是字符串",
      });
    }

    console.log("\n================================");
    console.log("🤖 EnterprisePilot API");
    console.log("================================");
    console.log("👤 用户：", message);

    const startTime = Date.now();

    const result = await agent.invoke({
      messages: [new HumanMessage(message)],
    });

    const totalLatency = Date.now() - startTime;

    const messages = result.messages;

    const lastMessage = messages[messages.length - 1];

    const answer =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    const toolCalls = messages
      .filter((msg: any) => msg.tool_calls?.length)
      .flatMap((msg: any) => msg.tool_calls);

    const traceSteps = buildTrace(messages);

    console.log("💬 最终回答：", answer);
    console.log("⏱️ 总耗时：", totalLatency, "ms");
    console.log("🧭 Trace steps:", traceSteps);

    const trace = {
      totalLatency,
      steps: traceSteps.length > 0 ? traceSteps : (
        toolCalls.length > 0
          ? [{
              type: "agent",
              status: "tool_call",
              toolCalls: toolCalls.map((call: any) => ({
                name: call.name,
                args: call.args,
                id: call.id,
              })),
            }]
          : []
      ),
    };

    const evaluation = await evaluateConversation({
      question: message,
      answer,
      toolCalls: toolCalls.map((call: any) => ({
        name: call.name,
        args: call.args,
        id: call.id,
      })),
      trace,
    });

    console.log("📊 Evaluation:", JSON.stringify(evaluation, null, 2));

    res.json({
      answer,
      toolCalls,
      trace,
      evaluation,
    });
  } catch (error) {
    console.error("❌ Agent 执行失败：", error);

    res.status(500).json({
      error: "Agent 执行失败",
    });
  }
});

const PORT = 3000;

server.listen(PORT, () => {
  console.log(`🚀 EnterprisePilot API running at http://localhost:${PORT}`);
});