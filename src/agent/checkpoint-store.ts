import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

const defaultCheckpointPath = ".data/recruitment-cases.sqlite";

export function resolveRecruitmentCheckpointPath(configuredPath = process.env.TACTISCOUT_CHECKPOINT_PATH): string {
  return resolve(configuredPath?.trim() || defaultCheckpointPath);
}

export interface RecruitmentCheckpointStore {
  path: string;
  checkpointer: BaseCheckpointSaver;
  close(): void;
}

export function createRecruitmentCheckpointStore(path?: string): RecruitmentCheckpointStore {
  const resolvedPath = resolveRecruitmentCheckpointPath(path);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  const saver = SqliteSaver.fromConnString(resolvedPath);
  let closed = false;

  return {
    path: resolvedPath,
    checkpointer: saver,
    close() {
      if (closed) return;
      closed = true;
      saver.db.close();
    },
  };
}
