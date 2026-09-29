import type { ScoutRequest, ScoutResponse } from "./types";

const storageKey = "tactiscout.recruitment-plans";

export interface SavedRecruitmentPlan {
  id: string;
  name: string;
  input: ScoutRequest;
  originalBrief: string;
  lastAnalysis: ScoutResponse | null;
  lastAnalyzedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface VersionedPlanStore {
  version: 1;
  plans: SavedRecruitmentPlan[];
}

type BrowserStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): BrowserStorage {
  if (typeof window === "undefined" || !window.localStorage) throw new Error("当前环境无法使用浏览器本地存储。");
  return window.localStorage;
}

export function loadRecruitmentPlans(storage = browserStorage()): SavedRecruitmentPlan[] {
  const stored = storage.getItem(storageKey);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as Partial<VersionedPlanStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.plans)) {
      throw new Error("招募计划存储版本不兼容。");
    }
    return parsed.plans;
  } catch (error) {
    if (error instanceof Error && error.message === "招募计划存储版本不兼容。") throw error;
    throw new Error("本地招募计划无法读取；原有数据仍保留在浏览器中。", { cause: error });
  }
}

export function saveRecruitmentPlans(plans: SavedRecruitmentPlan[], storage = browserStorage()): void {
  const store: VersionedPlanStore = { version: 1, plans };
  try {
    storage.setItem(storageKey, JSON.stringify(store));
  } catch (error) {
    throw new Error("计划未能写入浏览器存储。请检查可用空间后重试。", { cause: error });
  }
}
