import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";
import {
  KnowledgeDocumentInputSchema,
  KnowledgeSourceSchema,
  type KnowledgeDocumentInput,
  type KnowledgeSource,
} from "./schemas.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PlosResponseSchema = z.object({
  response: z.object({
    docs: z.array(z.object({
      id: z.string(),
      title_display: z.string().optional(),
      author_display: z.array(z.string()).optional(),
      publication_date: z.string().optional(),
      copyright: z.union([z.string(), z.array(z.string())]).optional(),
      abstract: z.union([z.string(), z.array(z.string())]).optional(),
      body: z.union([z.string(), z.array(z.string())]).optional(),
    }).passthrough()),
  }),
});

export interface PlosArticleCandidate {
  doi: string;
  title: string;
  authors: string[];
  publishedAt: string | null;
  license: string | null;
  articleUrl: string;
  registeredForIngestion: boolean;
}

function articleUrlForDoi(doi: string): string | null {
  const match = /^10\.1371\/journal\.(\w+)\./.exec(doi);
  if (!match) return null;
  const journalPaths: Record<string, string> = {
    pone: "plosone",
    pbio: "plosbiology",
    pmed: "plosmedicine",
    pcbi: "ploscompbiol",
    ppat: "plospathogens",
    pntd: "plosntd",
    pgen: "plosgenetics",
  };
  const journalPath = journalPaths[match[1]];
  if (!journalPath) return null;
  const url = new URL(`https://journals.plos.org/${journalPath}/article`);
  url.searchParams.set("id", doi);
  return url.toString();
}

function sourceAllowsArticle(source: KnowledgeSource, candidate: string): boolean {
  const article = new URL(candidate);
  return source.rights.automatedFetch
    && source.rights.persistentStorage
    && source.rights.aiProcessing
    && source.allowedUrlPrefixes.some((prefixValue) => {
      const prefix = new URL(prefixValue);
      if (article.origin !== prefix.origin || !article.pathname.startsWith(prefix.pathname)) return false;
      for (const [key, value] of prefix.searchParams) {
        if (article.searchParams.get(key) !== value) return false;
      }
      return true;
    });
}

function stringField(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  return value?.join("\n") ?? "";
}

function cleanArticleText(value: string): string {
  return value
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([\da-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

export class PlosDiscoveryProvider {
  private lastRequestAt = 0;

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async discover(query: string, options: { limit?: number; registryPath?: string } = {}): Promise<PlosArticleCandidate[]> {
    const searchText = query.trim();
    if (searchText.length < 2 || searchText.length > 300) throw new Error("PLOS 来源发现查询须为 2–300 个字符。");
    const limit = Math.min(20, Math.max(1, Math.floor(options.limit ?? 10)));
    const registryPath = path.resolve(options.registryPath ?? process.env.TACTISCOUT_KNOWLEDGE_SOURCES_FILE ?? path.join(projectRoot, "data", "knowledge", "sources.json"));
    const sourceRecords = KnowledgeSourceSchema.array().parse(JSON.parse(await readFile(registryPath, "utf8")) as unknown) as KnowledgeSource[];
    const url = new URL("https://api.plos.org/search");
    url.searchParams.set("q", searchText);
    url.searchParams.set("fl", "id,title_display,author_display,publication_date,copyright");
    url.searchParams.set("wt", "json");
    url.searchParams.set("rows", String(limit));
    const payload = await this.request(url);
    return payload.response.docs.map((document) => {
      const articleUrl = articleUrlForDoi(document.id);
      return {
        doi: document.id,
        title: document.title_display ?? document.id,
        authors: document.author_display ?? [],
        publishedAt: document.publication_date ?? null,
        license: /creative commons attribution|\bcc by\b/i.test(stringField(document.copyright)) ? "CC BY (按文章声明)" : null,
        articleUrl: articleUrl ?? `https://doi.org/${encodeURIComponent(document.id)}`,
        registeredForIngestion: articleUrl !== null && sourceRecords.some((source) => sourceAllowsArticle(source, articleUrl)),
      };
    });
  }

  async fetchRegisteredArticle(doi: string, options: { registryPath?: string } = {}): Promise<KnowledgeDocumentInput> {
    const sourceRecords = await this.readSources(options.registryPath);
    const articleUrl = articleUrlForDoi(doi);
    if (!articleUrl) throw new Error(`PLOS DOI ${doi} 暂不支持正文获取。`);
    const source = sourceRecords.find((candidate) => sourceAllowsArticle(candidate, articleUrl));
    if (!source) throw new Error(`PLOS DOI ${doi} 尚无允许自动抓取、保存和 AI/RAG 处理的来源登记；未发出正文请求。`);
    const url = new URL("https://api.plos.org/search");
    url.searchParams.set("q", `id:"${doi}"`);
    url.searchParams.set("fl", "id,title_display,author_display,publication_date,copyright,abstract,body");
    url.searchParams.set("wt", "json");
    url.searchParams.set("rows", "1");
    const payload = await this.request(url);
    const document = payload.response.docs.find((candidate) => candidate.id === doi);
    if (!document) throw new Error(`PLOS API 未返回 DOI ${doi} 的文章正文。`);
    const copyright = stringField(document.copyright);
    if (!/creative commons attribution|\bcc by\b/i.test(copyright)) {
      throw new Error(`PLOS API 未返回可核实的 CC BY 许可声明；${doi} 未入库。`);
    }
    const content = cleanArticleText(`${stringField(document.abstract)} ${stringField(document.body)}`);
    if (content.length < 40 || content.length > 200_000) throw new Error(`PLOS 正文长度 ${content.length} 超出当前自动入库范围。`);
    const title = document.title_display ?? doi;
    const authors = document.author_display ?? [];
    return KnowledgeDocumentInputSchema.parse({
      sourceId: source.id,
      corpus: source.allowedCorpora[0],
      title,
      url: articleUrl,
      author: authors.join(", ") || "PLOS 作者",
      publisher: source.publisher,
      publishedAt: document.publication_date ?? null,
      license: source.license,
      attribution: `${authors.join(", ") || "PLOS 作者"}. ${title}. ${articleUrl}. ${source.license}. Data provided by PLOS API.`,
      acquisition: "authorized_fetch",
      content,
    });
  }

  private async readSources(registryPath?: string): Promise<KnowledgeSource[]> {
    const resolvedRegistryPath = path.resolve(registryPath ?? process.env.TACTISCOUT_KNOWLEDGE_SOURCES_FILE ?? path.join(projectRoot, "data", "knowledge", "sources.json"));
    return KnowledgeSourceSchema.array().parse(JSON.parse(await readFile(resolvedRegistryPath, "utf8")) as unknown);
  }

  private async request(url: URL) {
    const waitMs = Math.max(0, 6_000 - (Date.now() - this.lastRequestAt));
    if (waitMs) await delay(waitMs);
    this.lastRequestAt = Date.now();
    const response = await this.fetcher(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`PLOS API 请求失败（HTTP ${response.status}）。`);
    return PlosResponseSchema.parse(await response.json() as unknown);
  }
}
