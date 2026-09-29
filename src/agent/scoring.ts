import type {
  InPossessionRole,
  OutOfPossessionRole,
  Per90,
  PlayerProfile,
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

export function toPer90(player: PlayerProfile): Per90 {
  const factor = player.minutes > 0 ? 90 / player.minutes : 0;
  return {
    goals: round(player.stats.goals * factor),
    assists: round(player.stats.assists * factor),
    passesAttempted: round(player.stats.passesAttempted * factor),
    passCompletionPct: player.stats.passesAttempted > 0 ? round(player.stats.passesCompleted / player.stats.passesAttempted * 100) : 0,
    longPasses: round(player.stats.longPasses * factor),
    carries: round(player.stats.carries * factor),
    pressures: round(player.stats.pressures * factor),
    tacklesInterceptions: round((player.stats.tackles + player.stats.interceptions) * factor),
    shotAssists: round(player.stats.shotAssists * factor),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function bounded(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function assessInPossessionRole(role: InPossessionRole, stats: Per90): RoleAssessment {
  switch (role) {
    case "progression":
      return {
        phase: "in_possession",
        role,
        fit: bounded(stats.carries * 2 + stats.longPasses * 8),
        evidence: [`每 90 分钟 ${stats.carries} 次带球（推进代理）`, `每 90 分钟 ${stats.longPasses} 次长传（推进代理）`],
        unsupportedAttributes: unsupportedByRole[role],
      };
    case "retention":
      return {
        phase: "in_possession",
        role,
        fit: bounded(stats.passCompletionPct),
        evidence: [`传球成功率 ${stats.passCompletionPct}%`],
        unsupportedAttributes: unsupportedByRole[role],
      };
    case "creation":
      return {
        phase: "in_possession",
        role,
        fit: bounded(stats.shotAssists * 15 + stats.assists * 8),
        evidence: [`每 90 分钟 ${stats.shotAssists} 次射门助攻`, `每 90 分钟 ${stats.assists} 次助攻`],
        unsupportedAttributes: unsupportedByRole[role],
      };
  }
}

function assessOutOfPossessionRole(role: OutOfPossessionRole, stats: Per90): RoleAssessment {
  switch (role) {
    case "pressing":
      return {
        phase: "out_of_possession",
        role,
        fit: bounded(stats.pressures * 4.5),
        evidence: [`每 90 分钟 ${stats.pressures} 次施压`],
        unsupportedAttributes: unsupportedByRole[role],
      };
    case "defensive_disruption":
      return {
        phase: "out_of_possession",
        role,
        fit: bounded(stats.tacklesInterceptions * 8),
        evidence: [`每 90 分钟 ${stats.tacklesInterceptions} 次抢断与拦截`],
        unsupportedAttributes: unsupportedByRole[role],
      };
  }
}

export function assessRoles(requirements: Requirements, stats: Per90): RoleAssessment[] {
  return [
    ...requirements.inPossessionRoles.map((role) => assessInPossessionRole(role, stats)),
    ...requirements.outOfPossessionRoles.map((role) => assessOutOfPossessionRole(role, stats)),
  ];
}

export function averageFit(assessments: RoleAssessment[]): number | null {
  if (assessments.length === 0) return null;
  return Math.round(assessments.reduce((sum, item) => sum + item.fit, 0) / assessments.length);
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
  risks.push("职责适配值由透明的规则启发式计算，尚未经过历史数据校准");
  if (requirements.maxAge !== undefined && player.age === null) risks.push("年龄未知的球员不满足年龄上限筛选");
  return { reasons, risks };
}
