import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const examplesDir = path.join(projectRoot, "docs", "examples");
const dataDir = path.join(projectRoot, ".camping-data");

async function main() {
  const entries = await readdir(examplesDir, { withFileTypes: true });

  await rm(dataDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(examplesDir, entry.name);
    const targetPath = path.join(dataDir, entry.name);

    if (entry.isDirectory()) {
      await cp(sourcePath, targetPath, { recursive: true, force: true });
    } else {
      await cp(sourcePath, targetPath, { force: true });
    }
  }

  await mkdir(path.join(dataDir, "cache", "weather"), { recursive: true });
  await mkdir(path.join(dataDir, "cache", "places"), { recursive: true });

  console.log(`Seeded local data into ${dataDir}`);
}

main().catch((error) => {
  console.error("Failed to seed local data:", error);
  process.exitCode = 1;
});
