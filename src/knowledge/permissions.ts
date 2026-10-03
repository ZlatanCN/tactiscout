import {
  KnowledgePermissionError,
  type KnowledgeDocumentInput,
  type KnowledgeSource,
} from "./schemas.js";

function allowedHttpsUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function matchesAllowedPrefix(candidateValue: string, prefixValue: string): boolean {
  const candidate = allowedHttpsUrl(candidateValue);
  const prefix = allowedHttpsUrl(prefixValue);
  if (!candidate || !prefix || candidate.origin !== prefix.origin) return false;
  const pathMatches = candidate.pathname === prefix.pathname
    || candidate.pathname.startsWith(prefix.pathname.endsWith("/") ? prefix.pathname : `${prefix.pathname}/`);
  if (!pathMatches) return false;
  for (const [key, value] of prefix.searchParams) {
    if (candidate.searchParams.get(key) !== value) return false;
  }
  return true;
}

export function sourceAllowsUrl(source: KnowledgeSource, candidate: string): boolean {
  return source.allowedUrlPrefixes.some((prefix) => matchesAllowedPrefix(candidate, prefix));
}

export function canAutomaticallyIngest(source: KnowledgeSource, candidate: string): boolean {
  return source.rights.automatedFetch
    && source.rights.persistentStorage
    && source.rights.aiProcessing
    && sourceAllowsUrl(source, candidate);
}

export function assertCanIngestDocument(source: KnowledgeSource, input: KnowledgeDocumentInput): void {
  if (!source.allowedCorpora.includes(input.corpus)) {
    throw new KnowledgePermissionError(`来源 ${source.name} 不允许进入 ${input.corpus} 语料。`);
  }
  if (!source.rights.persistentStorage || !source.rights.aiProcessing) {
    throw new KnowledgePermissionError(`来源 ${source.name} 未同时允许正文持久化和 AI/RAG 处理。`);
  }
  if (input.acquisition === "authorized_fetch" && !source.rights.automatedFetch) {
    throw new KnowledgePermissionError(`来源 ${source.name} 未获准自动抓取；已拒绝入库。`);
  }
  if (input.license !== source.license) {
    throw new KnowledgePermissionError(`文档许可与来源登记不一致（应为 ${source.license}）。`);
  }
  if (!sourceAllowsUrl(source, input.url)) {
    throw new KnowledgePermissionError(`文档 URL 不在来源 ${source.name} 的许可登记范围内。`);
  }
  if (!input.attribution.trim()) throw new KnowledgePermissionError("知识文档必须保留来源署名与许可信息。");
}
