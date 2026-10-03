import { readFile } from "node:fs/promises";
import path from "node:path";
import { KnowledgeDocumentInputSchema } from "./schemas.js";
import { createLocalKnowledgeBase } from "./index.js";
import { PlosDiscoveryProvider } from "./plos-discovery.js";

const argumentsList = process.argv.slice(2).filter((argument) => argument !== "--");
const [command, fileArgument] = argumentsList;

if (command === "discover") {
  const query = argumentsList.slice(1).join(" ").trim();
  if (query.length < 2) {
    console.error("用法：pnpm knowledge:discover -- <搜索词>");
    process.exitCode = 2;
  } else {
    try {
      const candidates = await new PlosDiscoveryProvider().discover(query);
      console.log(JSON.stringify({ discoveryOnly: true, results: candidates }, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : "PLOS 来源发现失败。";
      console.error(message);
      process.exitCode = 1;
    }
  }
} else if (command === "ingest" && fileArgument) {
  try {
    const inputFile = path.resolve(fileArgument);
    const document = KnowledgeDocumentInputSchema.parse(JSON.parse(await readFile(inputFile, "utf8")) as unknown);
    const result = await createLocalKnowledgeBase().ingest(document);
    console.log(`已写入 ${result.chunkCount} 个片段（文档 ${result.documentId}）。`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "文档无法入库。";
    console.error(message);
    process.exitCode = 1;
  }
} else if (command === "crawl" && fileArgument) {
  try {
    const provider = new PlosDiscoveryProvider();
    const document = await provider.fetchRegisteredArticle(fileArgument);
    const result = await createLocalKnowledgeBase().ingest(document);
    console.log(`已核验来源许可并写入 ${result.chunkCount} 个片段（文档 ${result.documentId}）。`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "许可范围内的 PLOS 正文采集失败。";
    console.error(message);
    process.exitCode = 1;
  }
} else if (command === "purge-source" && fileArgument) {
  try {
    const removedChunks = await createLocalKnowledgeBase().purgeSourceData(fileArgument);
    console.log(`已从本地知识索引清除来源 ${fileArgument.trim()} 的 ${removedChunks} 个片段。`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "来源索引清除失败。";
    console.error(message);
    process.exitCode = 1;
  }
} else {
  console.error("用法：pnpm knowledge:discover -- <搜索词>\n      pnpm knowledge:crawl -- <已获准 PLOS DOI>\n      pnpm knowledge:ingest -- <已获准来源的文档 JSON 文件>\n      pnpm knowledge:purge-source -- <来源 ID>");
  process.exitCode = 2;
}
