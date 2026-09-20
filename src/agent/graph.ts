import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, MessagesAnnotation, START, END,MemorySaver } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { SystemMessage } from "@langchain/core/messages";
import { calculator } from "../tools/calculator.js";
import { ragSearch } from "../tools/ragSearch.js";
import { dateTime } from "../tools/dateTime.js";
import { employeeLookup } from "../tools/employeeLookup.js";

// ==================== 1. 创建 LLM ====================

const model = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// ==================== 2. 注册 Tools ====================

const tools = [calculator, ragSearch, dateTime, employeeLookup];

const modelWithTools = model.bindTools(tools);

// ==================== 3. LLM Node ====================

async function callModel(state: typeof MessagesAnnotation.State) {
  const systemMessage = new SystemMessage(`
你是 EnterprisePilot，一个面向企业知识问答场景的智能助手。

你可以使用以下工具：

1. rag_search
用于查询 EnterprisePilot 企业知识库中的信息。

2. calculator
用于执行数学计算。

3. date_time
用于查询当前日期和时间。

4. employee_lookup
用于查询企业员工的基本信息。

请根据用户问题自主选择合适的工具。
如果一个问题需要多个工具，可以连续调用多个工具。
不要编造工具返回的信息。
如果知识库或工具中没有相关信息，应明确告诉用户。
`);

  const response = await modelWithTools.invoke([
    systemMessage,
    ...state.messages,
  ]);

  console.log("\n🧠 Agent 调用");

  if (response.tool_calls?.length) {
    console.log("🔧 Tool Calls:");

    for (const call of response.tool_calls) {
      console.log(`  - ${call.name}`);
      console.log(`    参数:`, call.args);
    }
  } else {
    console.log("💬 Agent 直接生成最终回答");
  }

  return { messages: [response] };
}

// ==================== 4. Tool Node ====================

const toolNode = new ToolNode(tools);

// ==================== 5. 判断下一步 ====================

function shouldContinue(
  state: typeof MessagesAnnotation.State
) {
  const lastMessage = state.messages[state.messages.length - 1];

  if (!lastMessage) {
    return END;
  }

  if (
    "tool_calls" in lastMessage &&
    Array.isArray(lastMessage.tool_calls) &&
    lastMessage.tool_calls.length > 0
  ) {
    return "tools";
  }

  return END;
}

// ==================== 6. 构建 Graph ====================

const workflow = new StateGraph(MessagesAnnotation)
  .addNode("agent", callModel)
  .addNode("tools", toolNode)

  .addEdge(START, "agent")

  .addConditionalEdges("agent", shouldContinue, [
    "tools",
    END,
  ])

  .addEdge("tools", "agent");

// ==================== 7. 编译 ====================
const checkpointer = new MemorySaver();

export const agent = workflow.compile({
  checkpointer
});