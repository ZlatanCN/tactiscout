import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";

const execFileAsync = promisify(execFile);
const FIGSHARE_API = "https://api.figshare.com/v2/articles";
const LICENSE_NAME = "CC BY 4.0";
const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
const PUBLICATION_DOI = "10.1038/s41597-019-0247-7";

interface FigshareFile {
  name: string;
  size: number;
  download_url: string;
  computed_md5: string;
}

interface FigshareArticle {
  id: number;
  doi: string;
  title: string;
  published_date: string;
  license: { name: string; url: string };
  files: FigshareFile[];
}

interface SourceDefinition {
  id: number;
  doi: string;
  title: string;
  fileName: string;
  expectedJsonPattern?: RegExp;
}

const sourceDefinitions: SourceDefinition[] = [
  { id: 7770599, doi: "10.6084/m9.figshare.7770599.v1", title: "Events", fileName: "events.zip", expectedJsonPattern: /^events_[A-Za-z_]+\.json$/ },
  { id: 7770422, doi: "10.6084/m9.figshare.7770422.v1", title: "Matches", fileName: "matches.zip", expectedJsonPattern: /^matches_[A-Za-z_]+\.json$/ },
  { id: 7765196, doi: "10.6084/m9.figshare.7765196.v3", title: "Players", fileName: "players.json" },
  { id: 7765310, doi: "10.6084/m9.figshare.7765310.v3", title: "Teams", fileName: "teams.json" },
  { id: 7765316, doi: "10.6084/m9.figshare.7765316.v4", title: "Competitions", fileName: "competitions.json" },
];

export class DatasetCollectionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DatasetCollectionError";
  }
}

async function getArticle(definition: SourceDefinition): Promise<FigshareArticle> {
  const response = await fetch(`${FIGSHARE_API}/${definition.id}`, {
    headers: { "User-Agent": "TactiScout local dataset collector" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new DatasetCollectionError(`Figshare returned HTTP ${response.status} for article ${definition.id}.`);
  const value = await response.json() as Partial<FigshareArticle>;
  if (value.id !== definition.id || value.doi !== definition.doi || value.title !== definition.title) {
    throw new DatasetCollectionError(`Figshare article ${definition.id} no longer matches the pinned ${definition.title} release.`);
  }
  if (value.license?.name !== LICENSE_NAME || value.license.url !== LICENSE_URL) {
    throw new DatasetCollectionError(`Figshare article ${definition.id} does not report the expected ${LICENSE_NAME} license.`);
  }
  if (!Array.isArray(value.files) || value.files.length !== 1) {
    throw new DatasetCollectionError(`Figshare article ${definition.id} must contain exactly one source file.`);
  }
  const file = value.files[0];
  if (!file || file.name !== definition.fileName || !Number.isSafeInteger(file.size) || file.size <= 0
    || !/^[a-f\d]{32}$/i.test(file.computed_md5)) {
    throw new DatasetCollectionError(`Figshare article ${definition.id} does not contain the pinned ${definition.fileName} artifact.`);
  }
  const downloadUrl = new URL(file.download_url);
  if (downloadUrl.protocol !== "https:" || !downloadUrl.hostname.endsWith("figshare.com")) {
    throw new DatasetCollectionError(`Figshare article ${definition.id} returned an unexpected download host.`);
  }
  return value as FigshareArticle;
}

async function digestFile(filePath: string, algorithm: "md5" | "sha256"): Promise<string> {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function downloadAndVerify(file: FigshareFile, targetPath: string): Promise<boolean> {
  try {
    const existing = await stat(targetPath);
    if (existing.size === file.size && (await digestFile(targetPath, "md5")) === file.computed_md5.toLowerCase()) return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const response = await fetch(file.download_url, {
    headers: { "User-Agent": "TactiScout local dataset collector" },
    redirect: "follow",
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!response.ok || !response.body) throw new DatasetCollectionError(`Could not download ${file.name}: HTTP ${response.status}.`);
  const finalUrl = new URL(response.url);
  if (finalUrl.protocol !== "https:" || finalUrl.username || finalUrl.password) {
    throw new DatasetCollectionError(`The download for ${file.name} redirected to an unexpected URL.`);
  }

  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  const hash = createHash("md5");
  let bytes = 0;
  const verifier = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.byteLength;
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.from(response.body as AsyncIterable<Uint8Array>), verifier, createWriteStream(temporaryPath, { flags: "wx" }));
    if (bytes !== file.size || hash.digest("hex") !== file.computed_md5.toLowerCase()) {
      throw new DatasetCollectionError(`Downloaded ${file.name} did not match the pinned Figshare size and checksum.`);
    }
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return true;
}

async function extractArchive(archivePath: string, temporaryDirectory: string, pattern: RegExp, outputDirectory: string): Promise<string[]> {
  let listing: string;
  try {
    ({ stdout: listing } = await execFileAsync("unzip", ["-Z1", archivePath], { maxBuffer: 2 * 1024 * 1024 }));
  } catch (error) {
    throw new DatasetCollectionError(`Could not inspect ${path.basename(archivePath)}; the local unzip utility is required.`, { cause: error });
  }
  const entries = listing.split(/\r?\n/).filter(Boolean);
  if (!entries.length || entries.some((entry) => entry.includes("/") || entry.includes("\\") || !pattern.test(entry))) {
    throw new DatasetCollectionError(`${path.basename(archivePath)} contains an unexpected path or file name.`);
  }
  if (new Set(entries).size !== entries.length) throw new DatasetCollectionError(`${path.basename(archivePath)} contains duplicate file names.`);

  await mkdir(temporaryDirectory, { recursive: true });
  try {
    await execFileAsync("unzip", ["-o", "-q", archivePath, "-d", temporaryDirectory], { maxBuffer: 2 * 1024 * 1024 });
    for (const entry of entries) {
      const extractedPath = path.join(temporaryDirectory, entry);
      const details = await lstat(extractedPath);
      if (!details.isFile() || details.isSymbolicLink()) throw new DatasetCollectionError(`${entry} is not a regular archive file.`);
      await copyFile(extractedPath, path.join(outputDirectory, entry));
    }
  } catch (error) {
    if (error instanceof DatasetCollectionError) throw error;
    throw new DatasetCollectionError(`Could not extract ${path.basename(archivePath)}.`, { cause: error });
  }
  return entries;
}

async function readPreviousAcquisitionDate(sourceDirectory: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(path.join(sourceDirectory, "provenance.json"), "utf8")) as { retrievedAt?: unknown };
    return typeof parsed.retrievedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.retrievedAt) ? parsed.retrievedAt : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new DatasetCollectionError("Existing provenance.json cannot be read; refusing to replace it.", { cause: error });
  }
}

async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export interface CollectedWyscoutSource {
  sourceDirectory: string;
  acquiredAt: string;
  downloadedFiles: number;
  verifiedFiles: number;
  archives: Array<{ file: string; bytes: number; sha256: string }>;
}

export async function collectWyscoutOpenData(sourceDirectory: string): Promise<CollectedWyscoutSource> {
  const resolvedSourceDirectory = path.resolve(sourceDirectory);
  const downloadsDirectory = path.join(resolvedSourceDirectory, "downloads");
  await mkdir(downloadsDirectory, { recursive: true });
  const previousAcquisitionDate = await readPreviousAcquisitionDate(resolvedSourceDirectory);
  const provenanceItems: Array<Record<string, string>> = [];
  const verifiedFiles: Array<{ file: string; bytes: number; sha256: string }> = [];
  let downloadedFiles = 0;

  for (const definition of sourceDefinitions) {
    const article = await getArticle(definition);
    const file = article.files[0]!;
    const targetPath = path.join(downloadsDirectory, definition.fileName);
    const downloaded = await downloadAndVerify(file, targetPath);
    if (downloaded) downloadedFiles += 1;
    const sha256 = await digestFile(targetPath, "sha256");
    verifiedFiles.push({ file: definition.fileName, bytes: file.size, sha256 });
    provenanceItems.push({
      name: definition.title,
      url: `https://doi.org/${article.doi}`,
      doi: article.doi,
      file: `downloads/${definition.fileName}`,
      sha256,
      figshareFileUrl: file.download_url,
      figshareMd5: file.computed_md5.toLowerCase(),
      bytes: String(file.size),
    });

    if (definition.fileName.endsWith(".json")) {
      await copyFile(targetPath, path.join(resolvedSourceDirectory, definition.fileName));
      continue;
    }
    const extractionDirectory = await mkdtemp(path.join(downloadsDirectory, `.tactiscout-${definition.title.toLowerCase()}-`));
    try {
      await extractArchive(targetPath, extractionDirectory, definition.expectedJsonPattern!, resolvedSourceDirectory);
    } finally {
      await rm(extractionDirectory, { recursive: true, force: true });
    }
  }

  const acquiredAt = downloadedFiles === 0 && previousAcquisitionDate
    ? previousAcquisitionDate
    : new Date().toISOString().slice(0, 10);
  await writeJsonAtomically(path.join(resolvedSourceDirectory, "provenance.json"), {
    dataset: "Soccer match event dataset",
    publisher: "Pappalardo et al., Scientific Data (2019)",
    publicationDoi: PUBLICATION_DOI,
    retrievedAt: acquiredAt,
    license: LICENSE_NAME,
    licenseUrl: LICENSE_URL,
    scope: "2017/18 top-five club leagues, plus published 2016 UEFA Euro and 2018 FIFA World Cup samples; raw source files are kept outside version control.",
    acquisitionMethod: "Pinned Figshare API articles; each download is verified against the API-reported size and MD5 before extraction.",
    modelProcessing: "Use only after confirming the license and explicitly opting into local model processing.",
    items: provenanceItems,
  });

  return {
    sourceDirectory: resolvedSourceDirectory,
    acquiredAt,
    downloadedFiles,
    verifiedFiles: verifiedFiles.length,
    archives: verifiedFiles,
  };
}
