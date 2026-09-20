import { retriever } from "./retriever.js";

const query = "什么是 RAG？";

const documents = await retriever.invoke(query);

console.log("🔍 用户问题：", query);
console.log("\n📚 Retriever 检索结果：");

documents.forEach((doc, index) => {
  console.log(`\n--- Result ${index + 1} ---`);
  console.log(doc.pageContent);
});