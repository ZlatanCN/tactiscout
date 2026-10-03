import type {
  InPossessionRole,
  OutOfPossessionRole,
  Per90,
  PlayerProfile,
  RawStatKey,
  Requirements,
  RoleAssessment,
} from "../domain/schemas.js";

type Role = InPossessionRole | OutOfPossessionRole;

const unsupportedByRole: Record<Role, string[]> = {
  progression: ["带球推进的方向与距离", "推进动作产生的场地价值"],
  retention: ["接球压力", "失去球权的风险"],
  creation: ["机会质量", "传球线路难度"],
  pressing: ["施压成功率", "施压时队友的协同位置"],
  defensive_disruption: ["对抗成功率", "防线位置与防守职责"],
};

const statLabels: Record<RawStatKey, string> = {
  goals: "进球",
  assists: "助攻",
  passesAttempted: "传球尝试",
  passesCompleted: "成功传球",
  longPasses: "长传",
  carries: "带球",
  pressures: "施压",
  tackles: "抢断",
  interceptions: "拦截",
  shotAssists: "射门助攻",
};

function hasStat(player: PlayerProfile, key: RawStatKey): boolean {
  return player.availableStats === undefined || player.availableStats.includes(key);
}

function per90(player: PlayerProfile, key: RawStatKey, value: number): number | null {
  if (!hasStat(player, key) || player.minutes <= 0) return null;
  return round(value * 90 / player.minutes);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function bounded(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function toPer90(player: PlayerProfile): Per90 {
  const passesAttempted = per90(player, "passesAttempted", player.stats.passesAttempted);
  const hasPassCounts = hasStat(player, "passesAttempted") && hasStat(player, "passesCompleted");
  const passCompletionPct = hasPassCounts && player.stats.passesAttempted > 0
    ? round(player.stats.passesCompleted / player.stats.passesAttempted * 100)
    : null;
  const hasDefensiveCounts = hasStat(player, "tackles") && hasStat(player, "interceptions");
  return {
    goals: per90(player, "goals", player.stats.goals),
    assists: per90(player, "assists", player.stats.assists),
    passesAttempted,
    passCompletionPct,
    longPasses: per90(player, "longPasses", player.stats.longPasses),
    carries: per90(player, "carries", player.stats.carries),
    pressures: per90(player, "pressures", player.stats.pressures),
    tacklesInterceptions: hasDefensiveCounts && player.minutes > 0
      ? round((player.stats.tackles + player.stats.interceptions) * 90 / player.minutes)
      : null,
    shotAssists: per90(player, "shotAssists", player.stats.shotAssists),
  };
}

function missingReason(player: PlayerProfile, keys: RawStatKey[]): string {
  const unavailable = keys.filter((key) => !hasStat(player, key));
  if (unavailable.length) return `当前数据源未提供${unavailable.map((key) => statLabels[key]).join("、")}数据`;
  if (player.minutes <= 0) return "没有有效出场分钟样本，无法计算该职责的每 90 分钟表现";
  return "当前记录没有该职责所需的有效统计样本";
}

function assessInPossessionRole(role: InPossessionRole, stats: Per90, player: PlayerProfile): RoleAssessment {
  switch (role) {
    case "progression": {
      const evidence = [
        stats.carries === null ? null : `每 90 分钟 ${stats.carries} 次带球（推进代理）`,
        stats.longPasses === null ? null : `每 90 分钟 ${stats.longPasses} 次长传（推进代理）`,
      ].filter((item): item is string => item !== null);
      const complete = stats.carries !== null && stats.longPasses !== null;
      return {
        phase: "in_possession",
        role,
        fit: stats.carries !== null && stats.longPasses !== null
          ? bounded(stats.carries * 2 + stats.longPasses * 8)
          : null,
        evidence,
        unsupportedAttributes: complete ? unsupportedByRole[role] : [...unsupportedByRole[role], missingReason(player, ["carries", "longPasses"])],
      };
    }
    case "retention":
      if (stats.passCompletionPct === null) {
        return {
          phase: "in_possession",
          role,
          fit: null,
          evidence: [],
          unsupportedAttributes: [...unsupportedByRole[role], missingReason(player, ["passesAttempted", "passesCompleted"])],
        };
      }
      return {
        phase: "in_possession",
        role,
        fit: bounded(stats.passCompletionPct),
        evidence: [`传球成功率 ${stats.passCompletionPct}%`],
        unsupportedAttributes: unsupportedByRole[role],
      };
    case "creation": {
      const evidence = [
        stats.shotAssists === null ? null : `每 90 分钟 ${stats.shotAssists} 次射门助攻`,
        stats.assists === null ? null : `每 90 分钟 ${stats.assists} 次助攻`,
      ].filter((item): item is string => item !== null);
      const complete = stats.shotAssists !== null && stats.assists !== null;
      return {
        phase: "in_possession",
        role,
        fit: stats.shotAssists !== null && stats.assists !== null
          ? bounded(stats.shotAssists * 15 + stats.assists * 8)
          : null,
        evidence,
        unsupportedAttributes: complete ? unsupportedByRole[role] : [...unsupportedByRole[role], missingReason(player, ["shotAssists", "assists"])],
      };
    }
  }
}

function assessOutOfPossessionRole(role: OutOfPossessionRole, stats: Per90, player: PlayerProfile): RoleAssessment {
  switch (role) {
    case "pressing":
      return {
        phase: "out_of_possession",
        role,
        fit: stats.pressures === null ? null : bounded(stats.pressures * 4.5),
        evidence: stats.pressures === null ? [] : [`每 90 分钟 ${stats.pressures} 次施压`],
        unsupportedAttributes: stats.pressures === null
          ? [...unsupportedByRole[role], missingReason(player, ["pressures"])]
          : unsupportedByRole[role],
      };
    case "defensive_disruption":
      return {
        phase: "out_of_possession",
        role,
        fit: stats.tacklesInterceptions === null ? null : bounded(stats.tacklesInterceptions * 8),
        evidence: stats.tacklesInterceptions === null ? [] : [`每 90 分钟 ${stats.tacklesInterceptions} 次抢断与拦截`],
        unsupportedAttributes: stats.tacklesInterceptions === null
          ? [...unsupportedByRole[role], missingReason(player, ["tackles", "interceptions"])]
          : unsupportedByRole[role],
      };
  }
}

export function assessRoles(requirements: Requirements, player: PlayerProfile): RoleAssessment[] {
  const stats = toPer90(player);
  return [
    ...requirements.inPossessionRoles.map((role) => assessInPossessionRole(role, stats, player)),
    ...requirements.outOfPossessionRoles.map((role) => assessOutOfPossessionRole(role, stats, player)),
  ];
}

export function averageFit(assessments: RoleAssessment[]): number | null {
  const availableFits = assessments.flatMap((assessment) => assessment.fit === null ? [] : [assessment.fit]);
  if (availableFits.length === 0) return null;
  return Math.round(availableFits.reduce((sum, fit) => sum + fit, 0) / availableFits.length);
}

export function explainFit(
  requirements: Requirements,
  player: PlayerProfile,
  assessments: RoleAssessment[],
): { reasons: string[]; risks: string[] } {
  const reasons = assessments.flatMap((assessment) => assessment.evidence);
  const risks: string[] = [];
  if (player.age === null) risks.push("年龄未知；不能据此确认年龄门槛");
  if (player.minutes < 900) risks.push("样本少于 900 分钟，单赛季率值波动较大");
  if (player.source.includes("demo")) risks.push("演示数据为虚构数据，不代表真实球员表现");
  if (assessments.some((assessment) => assessment.fit === null)) risks.push("至少一项职责缺少来源指标或出场样本，未纳入适配计算");
  risks.push("职责适配值由透明的规则启发式计算，尚未经过历史数据校准");
  if (requirements.maxAge !== undefined && player.age === null) risks.push("年龄未知的球员不满足年龄上限筛选");
  return { reasons, risks };
}
