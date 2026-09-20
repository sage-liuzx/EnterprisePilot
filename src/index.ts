import "dotenv/config";
import { HumanMessage } from "@langchain/core/messages";

import { agent } from "./agent/graph.js";

const userQuestion = "什么是 RAG？";

console.log("================================");
console.log("🤖 EnterprisePilot");
console.log("================================");
console.log("👤 用户：", userQuestion);

const result = await agent.invoke({
  messages: [
    new HumanMessage(userQuestion),
  ],
});

const lastMessage = result.messages[
  result.messages.length - 1
];

console.log("\n🤖 最终回答：");
console.log(lastMessage.content);