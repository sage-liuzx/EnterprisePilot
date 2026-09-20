import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { retriever } from "../rag/retriever.js";

export const ragSearch = tool(
  async ({ query }) => {
    const documents = await retriever.invoke(query);

    if (documents.length === 0) {
      return "知识库中没有找到相关信息。";
    }

    return documents
      .map((doc, index) => {
        return `【文档 ${index + 1}】\n${doc.pageContent}`;
      })
      .join("\n\n");
  },
  {
    name: "rag_search",
    description:
      "用于查询 EnterprisePilot 的内部知识库。当用户询问 RAG、Kubernetes、LangGraph、HATS 等知识库相关内容时，使用这个工具进行语义检索。",
    schema: z.object({
      query: z.string().describe("需要从知识库中检索的用户问题"),
    }),
  }
);