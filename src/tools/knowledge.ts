import { tool } from "@langchain/core/tools";
import { z } from "zod";

const knowledgeBase = [
  {
    title: "Kubernetes",
    content:
      "Kubernetes 是一个用于自动化部署、扩展和管理容器化应用的开源平台。",
  },
  {
    title: "LangGraph",
    content:
      "LangGraph 是一个用于构建有状态、可控工作流和 Agent 的框架，可以管理 Agent 的节点、状态和循环。",
  },
  {
    title: "RAG",
    content:
      "RAG（Retrieval-Augmented Generation）是一种通过检索外部知识，并将检索结果提供给大语言模型，从而增强模型回答能力的方法。",
  },
];

export const knowledgeSearch = tool(
  async ({ query }) => {
    const keyword = query.toLowerCase();

    const results = knowledgeBase.filter((item) => {
      return (
        item.title.toLowerCase().includes(keyword) ||
        item.content.toLowerCase().includes(keyword)
      );
    });

    if (results.length === 0) {
      return "知识库中没有找到相关信息。";
    }

    return results
      .map((item) => `${item.title}：${item.content}`)
      .join("\n");
  },
  {
    name: "knowledge_search",
    description:
      "用于查询 EnterprisePilot 内部知识库。当用户询问 Kubernetes、LangGraph、RAG 等相关知识时，可以使用这个工具。",
    schema: z.object({
      query: z.string().describe("要查询的知识关键词"),
    }),
  }
);