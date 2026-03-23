import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { seedLocalData } from "../apps/api/src/local-data-seed";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const examplesDir = path.join(projectRoot, "docs", "examples");
const dataDir = path.join(projectRoot, ".camping-data");
const backupDir = path.join(projectRoot, ".camping-backups");

async function main() {
  const result = await seedLocalData({
    shouldReplace: process.argv.slice(2).includes("--replace"),
    examplesPath: examplesDir,
    dataPath: dataDir,
    backupPath: backupDir,
  });

  if (result.backup) {
    console.log(`Backed up existing local data into ${result.backup.backup_path}`);
  }
  console.log(`Seeded example data into ${result.dataPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Failed to seed local data:", error);
    process.exitCode = 1;
  });
}
