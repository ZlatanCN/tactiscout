import {
  RequirementsSchema,
  type Requirements,
  type ScoutInput,
} from "../domain/schemas.js";

export function parseRequirements(input: ScoutInput): Requirements {
  return RequirementsSchema.parse(input);
}
