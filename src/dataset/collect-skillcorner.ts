import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_COMMIT = "4340d274572876239c154c90bc507a9b3250a656";
const SOURCE_COMMIT_DATE = "2026-09-14T11:48:41Z";
const SOURCE_BASE_URL = `https://raw.githubusercontent.com/SkillCorner/opendata/${SOURCE_COMMIT}/data/aggregates`;
const UPSTREAM_REPOSITORY = "https://github.com/SkillCorner/opendata";
const UPSTREAM_README = `${UPSTREAM_REPOSITORY}/blob/${SOURCE_COMMIT}/README.md`;
const UPSTREAM_LICENSE = `${UPSTREAM_REPOSITORY}/blob/${SOURCE_COMMIT}/LICENSE`;

const sourceFiles = [
  {
    fileName: "aus1league_physicalaggregates_20242025.csv",
    bytes: 167_312,
    sha256: "50e7d2cb5d08b1c53a726153e45468b9c0d398c2bfca6734270f65e45deb1a48",
  },
  {
    fileName: "aus1league_passingaggregates_20242025.csv",
    bytes: 124_039,
    sha256: "f9513abc29704613331f7647d7ec2e33137eb7145bdaae10ba3798ddd3a29c90",
  },
  {
    fileName: "aus1league_obraggregates_20242025.csv",
    bytes: 263_921,
    sha256: "1b5aeddceb4c120085357ca03d7ccb67c8aaeb3a0e9cf9439c96da2aa8b29736",
  },
] as const;

type SourceFile = (typeof sourceFiles)[number];

export class SkillCornerCollectionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SkillCornerCollectionError";
  }
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function hasVerifiedFile(filePath: string, sourceFile: SourceFile): Promise<boolean> {
  let details;
  try {
    details = await lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }

  if (!details.isFile() || details.isSymbolicLink()) {
    throw new SkillCornerCollectionError(`${sourceFile.fileName} exists but is not a regular file.`);
  }

  const bytes = await readFile(filePath);
  if (bytes.byteLength !== sourceFile.bytes || sha256(bytes) !== sourceFile.sha256) {
    throw new SkillCornerCollectionError(`${sourceFile.fileName} already exists but does not match the pinned upstream release. Move it aside before refreshing.`);
  }
  return true;
}

async function fetchAndVerify(sourceFile: SourceFile, targetPath: string): Promise<void> {
  const url = `${SOURCE_BASE_URL}/${sourceFile.fileName}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "TactiScout local dataset collector" },
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new SkillCornerCollectionError(`Could not download ${sourceFile.fileName} from the pinned SkillCorner release.`, { cause: error });
  }

  if (!response.ok) throw new SkillCornerCollectionError(`Could not download ${sourceFile.fileName}: HTTP ${response.status}.`);
  if (!response.url) throw new SkillCornerCollectionError(`The download for ${sourceFile.fileName} did not provide a final URL.`);
  const finalUrl = new URL(response.url);
  if (finalUrl.protocol !== "https:" || finalUrl.hostname !== "raw.githubusercontent.com") {
    throw new SkillCornerCollectionError(`The download for ${sourceFile.fileName} redirected to an unexpected host.`);
  }

  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) !== sourceFile.bytes) {
    throw new SkillCornerCollectionError(`${sourceFile.fileName} has an unexpected upstream Content-Length.`);
  }
  if (!response.body) throw new SkillCornerCollectionError(`${sourceFile.fileName} download returned an empty response body.`);
  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of response.body) {
    byteLength += chunk.byteLength;
    if (byteLength > sourceFile.bytes) {
      throw new SkillCornerCollectionError(`${sourceFile.fileName} exceeded its pinned byte limit.`);
    }
    chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks, byteLength);
  if (bytes.byteLength !== sourceFile.bytes || sha256(bytes) !== sourceFile.sha256) {
    throw new SkillCornerCollectionError(`${sourceFile.fileName} did not match the pinned upstream size and SHA-256.`);
  }

  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw new SkillCornerCollectionError(`Could not save ${sourceFile.fileName} to the configured local data directory.`, { cause: error });
  }
}

async function writeProvenance(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw new SkillCornerCollectionError("Could not write SkillCorner provenance.json.", { cause: error });
  }
}

async function previousAcquisitionDate(provenancePath: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(provenancePath, "utf8")) as { acquiredAt?: unknown };
    return typeof parsed.acquiredAt === "string" && !Number.isNaN(Date.parse(parsed.acquiredAt)) ? parsed.acquiredAt : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new SkillCornerCollectionError("Existing SkillCorner provenance.json cannot be read; refusing to replace it.", { cause: error });
  }
}

export interface CollectedSkillCornerSource {
  aggregatesDirectory: string;
  acquiredAt: string;
  downloadedFiles: number;
  verifiedFiles: number;
  files: Array<{ file: string; bytes: number; sha256: string }>;
}

export async function collectSkillCornerOpenData(aggregatesDirectory: string): Promise<CollectedSkillCornerSource> {
  const resolvedAggregatesDirectory = path.resolve(aggregatesDirectory);
  const sourceDirectory = path.dirname(resolvedAggregatesDirectory);
  await mkdir(resolvedAggregatesDirectory, { recursive: true });

  const provenancePath = path.join(sourceDirectory, "provenance.json");
  const previousDate = await previousAcquisitionDate(provenancePath);
  let downloadedFiles = 0;
  const files: CollectedSkillCornerSource["files"] = [];

  for (const sourceFile of sourceFiles) {
    const targetPath = path.join(resolvedAggregatesDirectory, sourceFile.fileName);
    const existsAndMatches = await hasVerifiedFile(targetPath, sourceFile);
    if (!existsAndMatches) {
      await fetchAndVerify(sourceFile, targetPath);
      downloadedFiles += 1;
    }
    files.push({ file: sourceFile.fileName, bytes: sourceFile.bytes, sha256: sourceFile.sha256 });
  }

  const checkedAt = new Date().toISOString();
  const acquiredAt = downloadedFiles === 0 && previousDate ? previousDate : checkedAt;
  await writeProvenance(provenancePath, {
    dataset: "SkillCorner Open Data season aggregates",
    publisher: "SkillCorner and PySport",
    sourceRepository: UPSTREAM_REPOSITORY,
    sourceCommit: SOURCE_COMMIT,
    sourceCommitUrl: `${UPSTREAM_REPOSITORY}/commit/${SOURCE_COMMIT}`,
    sourceCommitDate: SOURCE_COMMIT_DATE,
    upstreamReadmeUrl: UPSTREAM_README,
    upstreamLicenseUrl: UPSTREAM_LICENSE,
    retrievedAt: acquiredAt,
    verifiedAt: checkedAt,
    scope: "Australian A-League 2024/25 player-season aggregates for physical, passing, and off-ball runs. The upstream README says performances under 60 minutes are excluded.",
    attribution: "The upstream README asks users to credit SkillCorner.",
    licenseReview: "The repository README describes the data as open-sourced. The root MIT license is written for software and associated documentation files and does not separately define the CSV data, so verify intended display and model-processing use before enabling the app gates.",
    files: files.map((file) => ({ ...file, sourceUrl: `${SOURCE_BASE_URL}/${file.file}` })),
    storage: "By default files are stored in the local gitignored .data directory and are not committed by this command. A custom destination can be set with TACTISCOUT_SKILLCORNER_AGGREGATES_DIR.",
  });

  return {
    aggregatesDirectory: resolvedAggregatesDirectory,
    acquiredAt,
    downloadedFiles,
    verifiedFiles: files.length,
    files,
  };
}
