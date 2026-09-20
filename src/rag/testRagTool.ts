import { ragSearch } from "../tools/ragSearch.js";

const result = await ragSearch.invoke({
  query: "什么是 RAG？",
});

console.log("🔍 RAG Tool 查询结果：");
console.log(result);