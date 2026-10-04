import { createReadStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { ReepPlayerBridgeKeys } from "./reep-registry.js";

export interface ImportReepReleaseOptions {
  bridgesPath: string;
  redirectsPath: string;
  releaseStamp: string;
  outputPath: string;
  onProgress?: (message: string) => void;
}

export interface ImportReepReleaseResult {
  releaseStamp: string;
  indexedBridgeRows: number;
  redirectRows: number;
  outputPath: string;
}

interface Redirect {
  toId: string | null;
  reason: "merged" | "de_corroborated" | "withheld" | "target_not_published";
}

function parseCsvLine(line: string, filePath: string, lineNumber: number): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  let quoteClosed = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        quoteClosed = true;
      } else {
        cell += character;
      }
      continue;
    }
    if (quoteClosed) {
      if (character === ",") {
        cells.push(cell.trim());
        cell = "";
        quoteClosed = false;
      } else if (character !== " " && character !== "\t") {
        throw new Error(`${filePath} line ${lineNumber}: unexpected characters after a quoted CSV field.`);
      }
      continue;
    }
    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === '"') {
      throw new Error(`${filePath} line ${lineNumber}: unexpected quote in an unquoted CSV field.`);
    } else if (character === ",") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error(`${filePath} line ${lineNumber}: quoted fields cannot span physical lines in this identifier export.`);
  cells.push(cell.trim());
  return cells;
}

async function* readGzipCsv(pathname: string, requiredColumns: readonly string[]): AsyncGenerator<Record<string, string>> {
  const input = createReadStream(pathname).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  let headers: string[] | undefined;
  let lineNumber = 0;

  try {
    for await (const rawLine of lines) {
      lineNumber += 1;
      const line = lineNumber === 1 ? rawLine.replace(/^\uFEFF/, "") : rawLine;
      if (!line.trim()) continue;
      const cells = parseCsvLine(line, pathname, lineNumber);
      if (!headers) {
        if (cells.some((header) => !header) || new Set(cells).size !== cells.length) {
          throw new Error(`${pathname} has an empty or duplicate CSV header.`);
        }
        const missingColumns = requiredColumns.filter((column) => !cells.includes(column));
        if (missingColumns.length > 0) {
          throw new Error(`${pathname} is missing required CSV columns: ${missingColumns.join(", ")}.`);
        }
        headers = cells;
        continue;
      }
      if (cells.length !== headers.length) {
        throw new Error(`${pathname} line ${lineNumber} has ${cells.length} columns; expected ${headers.length}.`);
      }
      yield Object.fromEntries(headers.map((header, index) => [header, cells[index]!])) as Record<string, string>;
    }
  } finally {
    lines.close();
    if (!input.destroyed) input.destroy();
  }
  if (!headers) throw new Error(`${pathname} is empty or has no CSV header.`);
}

function required(row: Record<string, string>, key: string, pathname: string): string {
  const value = row[key];
  if (value === undefined) throw new Error(`${pathname} is missing required column ${key}.`);
  if (!value) throw new Error(`${pathname} contains an empty ${key} value.`);
  return value;
}

function optional(row: Record<string, string>, key: string): string | null {
  return row[key]?.trim() || null;
}

function canonicalize(sourceId: string, redirects: Map<string, Redirect>): { canonicalId: string | null; status: Redirect["reason"] | "resolved" } {
  let currentId = sourceId;
  const visited = new Set<string>([sourceId]);
  for (let depth = 0; depth < 64; depth += 1) {
    const redirect = redirects.get(currentId);
    if (!redirect) return { canonicalId: currentId, status: "resolved" };
    if (redirect.reason !== "merged") return { canonicalId: null, status: redirect.reason };
    const nextId = redirect.toId;
    if (!nextId) throw new Error(`Merged Reep redirect ${currentId} has no target ID.`);
    if (visited.has(nextId)) throw new Error(`Reep redirects contain a cycle at ${nextId}.`);
    visited.add(nextId);
    currentId = nextId;
  }
  throw new Error(`Reep redirects exceed the maximum chain length for ${sourceId}.`);
}

export async function importReepRelease(options: ImportReepReleaseOptions): Promise<ImportReepReleaseResult> {
  if (!/^\d{8}T\d{6}Z$/.test(options.releaseStamp)) {
    throw new Error("Release stamp must use Reep's YYYYMMDDTHHMMSSZ format.");
  }
  const outputPath = path.resolve(options.outputPath);
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await rm(temporaryPath, { force: true });

  const redirects = new Map<string, Redirect>();
  const database = new DatabaseSync(temporaryPath);
  let databaseClosed = false;
  let inTransaction = false;
  let indexedBridgeRows = 0;
  let redirectRows = 0;
  const allowedKeys = new Set(ReepPlayerBridgeKeys.map(({ provider, namespace }) => `${provider}\0${namespace}`));

  try {
    database.exec(`
      PRAGMA journal_mode = OFF;
      PRAGMA synchronous = OFF;
      PRAGMA temp_store = MEMORY;
      CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE redirects (
        from_id TEXT PRIMARY KEY,
        to_id TEXT,
        reason TEXT NOT NULL CHECK (reason IN ('merged', 'de_corroborated', 'withheld', 'target_not_published'))
      );
      CREATE TABLE bridges (
        provider TEXT NOT NULL,
        namespace TEXT NOT NULL,
        external_id TEXT NOT NULL,
        source_reep_id TEXT NOT NULL,
        canonical_reep_id TEXT,
        redirect_status TEXT NOT NULL CHECK (redirect_status IN ('resolved', 'de_corroborated', 'withheld', 'target_not_published')),
        rung TEXT,
        upstream_status TEXT
      );
      BEGIN IMMEDIATE;
    `);
    inTransaction = true;
    const insertRedirect = database.prepare("INSERT INTO redirects (from_id, to_id, reason) VALUES (?, ?, ?)");
    for await (const row of readGzipCsv(options.redirectsPath, ["from_id", "to_id", "reason"])) {
      const fromId = required(row, "from_id", options.redirectsPath);
      const reason = required(row, "reason", options.redirectsPath);
      const toId = optional(row, "to_id");
      if (reason !== "merged" && reason !== "de_corroborated" && reason !== "withheld" && reason !== "target_not_published") {
        throw new Error(`${options.redirectsPath} contains unsupported redirect reason ${reason}.`);
      }
      if ((reason === "merged") !== Boolean(toId)) {
        throw new Error(`${options.redirectsPath} has an invalid target for ${reason} redirect ${fromId}.`);
      }
      const previous = redirects.get(fromId);
      if (previous && (previous.toId !== toId || previous.reason !== reason)) {
        throw new Error(`${options.redirectsPath} contains conflicting redirects for ${fromId}.`);
      }
      if (!previous) {
        redirects.set(fromId, { toId, reason });
        insertRedirect.run(fromId, toId, reason);
        redirectRows += 1;
      }
    }

    const insertBridge = database.prepare(
      `INSERT INTO bridges
       (provider, namespace, external_id, source_reep_id, canonical_reep_id, redirect_status, rung, upstream_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for await (const row of readGzipCsv(options.bridgesPath, ["provider", "namespace", "external_id", "reep_id"])) {
      const provider = required(row, "provider", options.bridgesPath);
      const namespace = required(row, "namespace", options.bridgesPath);
      if (!allowedKeys.has(`${provider}\0${namespace}`)) continue;
      const externalId = required(row, "external_id", options.bridgesPath);
      const sourceReepId = required(row, "reep_id", options.bridgesPath);
      const resolution = canonicalize(sourceReepId, redirects);
      insertBridge.run(
        provider,
        namespace,
        externalId,
        sourceReepId,
        resolution.canonicalId,
        resolution.status,
        optional(row, "rung"),
        optional(row, "upstream_status"),
      );
      indexedBridgeRows += 1;
      if (indexedBridgeRows % 500_000 === 0) options.onProgress?.(`已索引 ${indexedBridgeRows.toLocaleString()} 条球员身份映射…`);
    }
    if (indexedBridgeRows === 0) throw new Error("No supported player bridges were found in the supplied release.");

    const insertMetadata = database.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
    insertMetadata.run("release_stamp", options.releaseStamp);
    insertMetadata.run("indexed_bridge_rows", String(indexedBridgeRows));
    insertMetadata.run("redirect_rows", String(redirectRows));
    insertMetadata.run("created_at", new Date().toISOString());
    database.exec("COMMIT;");
    inTransaction = false;
    database.exec(`
      CREATE INDEX bridges_source_lookup ON bridges (provider, namespace, external_id);
      CREATE INDEX bridges_canonical_lookup ON bridges (canonical_reep_id, redirect_status);
      PRAGMA optimize;
    `);
    database.close();
    databaseClosed = true;
    await rename(temporaryPath, outputPath);
    options.onProgress?.(`Reep ${options.releaseStamp} 索引已写入 ${outputPath}。`);
    return { releaseStamp: options.releaseStamp, indexedBridgeRows, redirectRows, outputPath };
  } catch (error) {
    if (!databaseClosed) {
      if (inTransaction) database.exec("ROLLBACK;");
      database.close();
      databaseClosed = true;
    }
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
