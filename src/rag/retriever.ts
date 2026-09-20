import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";

import { Document } from "@langchain/core/documents";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const knowledgeDir = path.resolve(process.cwd(), "src/data/knowledge");

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

async function loadMarkdownDocuments() {
  const entries = await fs.readdir(knowledgeDir, { withFileTypes: true });
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const documents: Document[] = [];

  for (const fileName of markdownFiles) {
    const fullPath = path.join(knowledgeDir, fileName);
    const content = await fs.readFile(fullPath, "utf-8");

    documents.push(
      new Document({
        pageContent: content,
        metadata: { source: fileName },
      })
    );
  }

  return documents;
}

const documents = await loadMarkdownDocuments();

console.log("📄 原始文档数量：", documents.length);

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 200,
  chunkOverlap: 50,
});

const splitDocuments = await splitter.splitDocuments(documents);

console.log("✂️ 切分后的 Chunk 数量：", splitDocuments.length);

const vectorStore = await MemoryVectorStore.fromDocuments(
  splitDocuments,
  embeddings
);

export const retriever = vectorStore.asRetriever({
  k: 2,
});