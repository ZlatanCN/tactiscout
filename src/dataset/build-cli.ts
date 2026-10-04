import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildWyscoutDataset, DatasetBuildError } from "./wyscout-dataset.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceDirectory = path.resolve(projectRoot, process.env.TACTISCOUT_WYSCOUT_DIR ?? ".data/wyscout-open-data");
const outputDirectory = path.resolve(projectRoot, process.env.TACTISCOUT_DATASET_OUTPUT_DIR ?? ".data/tactiscout-datasets");

try {
  const { path: outputPath, latestPath, snapshot } = await buildWyscoutDataset({ sourceDirectory, outputDirectory });
  console.log(JSON.stringify({
    datasetId: snapshot.datasetId,
    outputPath,
    latestPath,
    playerSeasonRecords: snapshot.coverage.playerSeasonRecords,
    uniquePlayers: snapshot.coverage.uniquePlayers,
    teams: snapshot.coverage.teams,
    matches: snapshot.coverage.matches,
    competitions: snapshot.coverage.competitions,
    seasons: snapshot.coverage.seasons,
    completeEventRecords: snapshot.coverage.recordsWithCompleteEvents,
    metrics: snapshot.coverage.metrics.map(({ key, availableRecords, totalRecords, unit }) => ({ key, availableRecords, totalRecords, unit })),
  }, null, 2));
} catch (error) {
  if (error instanceof DatasetBuildError) {
    console.error(`Dataset build failed: ${error.message}`);
    process.exitCode = 1;
  } else {
    console.error("Dataset build failed unexpectedly.");
    process.exitCode = 1;
  }
}
