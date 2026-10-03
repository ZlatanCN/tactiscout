import type { Position } from "./schemas.js";

const positionFamilies: Partial<Record<Position, readonly Position[]>> = {
  DEF: ["DEF", "CB", "LB", "RB", "LWB", "RWB"],
  MID: ["MID", "DM", "CM", "AM"],
  ATT: ["ATT", "LW", "RW", "ST"],
};

export function positionMatches(actual: Position, requested: Position): boolean {
  return actual === requested || positionFamilies[requested]?.includes(actual) === true;
}
