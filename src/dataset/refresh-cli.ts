import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectWyscoutOpenData, DatasetCollectionError } from "./collect-wyscout.js";
import { buildWyscoutDataset, DatasetBuildError } from "./wyscout-dataset.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceDirectory = path.resolve(projectRoot, process.env.TACTISCOUT_WYSCOUT_DIR ?? ".data/wyscout-open-data");
const outputDirectory = path.resolve(projectRoot, process.env.TACTISCOUT_DATASET_OUTPUT_DIR ?? ".data/tactiscout-datasets");

try {
  const collection = await collectWyscoutOpenData(sourceDirectory);
  const built = await buildWyscoutDataset({ sourceDirectory, outputDirectory });
  console.log(JSON.stringify({
    datasetId: built.snapshot.datasetId,
    sourceDirectory: collection.sourceDirectory,
    outputPath: built.path,
    latestPath: built.latestPath,
    acquiredAt: collection.acquiredAt,
    upstreamFilesVerified: collection.verifiedFiles,
    upstreamFilesDownloaded: collection.downloadedFiles,
    upstreamFileFingerprints: collection.archives,
    coverage: built.snapshot.coverage,
    limitations: built.snapshot.limitations,
  }, null, 2));
} catch (error) {
  if (error instanceof DatasetCollectionError || error instanceof DatasetBuildError) {
    console.error(`Dataset refresh failed: ${error.message}`);
  } else {
    console.error("Dataset refresh failed unexpectedly.");
  }
  process.exitCode = 1;
}
