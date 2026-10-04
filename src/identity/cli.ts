import "dotenv/config";
import path from "node:path";
import { importReepRelease } from "./import-reep-release.js";
import { ReepIdentityRegistry } from "./reep-registry.js";

const defaultDatabasePath = path.resolve(process.env.TACTISCOUT_REEP_IDENTITY_DB_PATH ?? ".data/reep/identity.sqlite");

function usage(): string {
  return [
    "Reep local identity registry",
    "",
    "Import a manually downloaded official snapshot:",
    "  pnpm identity:reep import <bridges.csv.gz> <redirects.csv.gz> <release-stamp> [index.sqlite]",
    "",
    "Resolve a provider-scoped ID:",
    "  pnpm identity:reep resolve <provider> <namespace> <external-id> [index.sqlite]",
    "",
    "Resolve one of TactiScout's source provider names:",
    "  pnpm identity:reep resolve-source <source-provider> <external-id> [index.sqlite]",
    "",
    `Default index: ${defaultDatabasePath}`,
  ].join("\n");
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "import") {
    const [bridgesPath, redirectsPath, releaseStamp, outputPath = defaultDatabasePath] = args;
    if (!bridgesPath || !redirectsPath || !releaseStamp) throw new Error(usage());
    const result = await importReepRelease({
      bridgesPath,
      redirectsPath,
      releaseStamp,
      outputPath,
      onProgress: (message) => process.stdout.write(`${message}\n`),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "resolve" || command === "resolve-source") {
    const [first, second, third, fourth] = args;
    if (!first || !second || (command === "resolve" && !third)) throw new Error(usage());
    const databasePath = command === "resolve" ? fourth ?? defaultDatabasePath : third ?? defaultDatabasePath;
    const registry = new ReepIdentityRegistry(databasePath);
    try {
      const result = command === "resolve"
        ? registry.resolveExact(first, second, third!)
        : registry.resolveSourceProvider(first, second);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result.status === "not_found" || result.status === "unsupported_provider" || result.status === "ambiguous"
        || result.status === "de_corroborated" || result.status === "withheld" || result.status === "target_not_published") {
        process.exitCode = 2;
      }
    } finally {
      registry.close();
    }
    return;
  }

  process.stdout.write(`${usage()}\n`);
  process.exitCode = command ? 2 : 0;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected Reep registry error.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
