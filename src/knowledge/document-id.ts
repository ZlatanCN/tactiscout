import { createHash } from "node:crypto";
import type { KnowledgeDocumentInput } from "./schemas.js";

export function knowledgeDocumentId(input: Pick<KnowledgeDocumentInput, "sourceId" | "url" | "title">): string {
  return createHash("sha256").update(`${input.sourceId}\n${input.url}\n${input.title}`).digest("hex");
}
