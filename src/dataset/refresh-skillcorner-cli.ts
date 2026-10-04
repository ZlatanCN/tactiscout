import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectSkillCornerOpenData, SkillCornerCollectionError } from "./collect-skillcorner.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const aggregatesDirectory = path.resolve(projectRoot, process.env.TACTISCOUT_SKILLCORNER_AGGREGATES_DIR ?? ".data/skillcorner-open-data/aggregates");

try {
  const collection = await collectSkillCornerOpenData(aggregatesDirectory);
  console.log(JSON.stringify(collection, null, 2));
} catch (error) {
  if (error instanceof SkillCornerCollectionError) {
    console.error(`SkillCorner dataset refresh failed: ${error.message}`);
  } else {
    console.error("SkillCorner dataset refresh failed unexpectedly.");
  }
  process.exitCode = 1;
}
