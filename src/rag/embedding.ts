import "dotenv/config";
import { OpenAIEmbeddings } from "@langchain/openai";

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const text = "RAG 是一种检索增强生成技术。";

const vector = await embeddings.embedQuery(text);

console.log("原始文本：", text);
console.log("向量维度：", vector.length);
console.log("向量前 5 个元素：", vector.slice(0, 5));