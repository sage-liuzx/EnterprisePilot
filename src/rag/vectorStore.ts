import "dotenv/config";

import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const text = `
RAG

RAG（Retrieval-Augmented Generation）是一种检索增强生成技术。
它通过从外部知识库中检索与用户问题相关的信息，并将检索结果提供给大语言模型，从而增强模型回答问题的准确性和知识覆盖范围。

Kubernetes

Kubernetes 是一个用于自动化部署、扩展和管理容器化应用的开源平台。
Kubernetes 可以管理容器、Pod、Service、Deployment 等资源。

LangGraph

LangGraph 是一个用于构建有状态 Agent 和工作流的框架。
它可以将 Agent 拆分为多个节点，并通过边连接这些节点，同时支持条件分支、循环和状态管理。
`;

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 200,
  chunkOverlap: 50,
});

const documents = await splitter.createDocuments([text]);

console.log("📄 文档切分结果：");
console.log("Chunk 数量：", documents.length);

documents.forEach((doc, index) => {
  console.log(`\n--- Chunk ${index + 1} ---`);
  console.log(doc.pageContent);
});

const vectorStore = await MemoryVectorStore.fromDocuments(
  documents,
  embeddings
);

const results = await vectorStore.similaritySearch(
  "什么是 RAG？",
  2
);

console.log("\n🔍 检索结果：");

results.forEach((doc, index) => {
  console.log(`\n--- Result ${index + 1} ---`);
  console.log(doc.pageContent);
});