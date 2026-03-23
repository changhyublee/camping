import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createTimestampedDataBackup } from "../apps/api/src/file-store/local-data-backup";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dataDir = path.join(projectRoot, ".camping-data");
const backupDir = path.join(projectRoot, ".camping-backups");

export async function backupLocalData(options?: {
  dataPath?: string;
  backupPath?: string;
}) {
  return createTimestampedDataBackup({
    sourceDir: options?.dataPath ?? dataDir,
    backupRootDir: options?.backupPath ?? backupDir,
    reason: "manual",
  });
}

async function main() {
  const backup = await backupLocalData();

  if (!backup) {
    console.log("백업할 로컬 운영 데이터가 아직 없습니다.");
    return;
  }

  console.log(`Backed up local data into ${backup.backup_path}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Failed to back up local data:", error);
    process.exitCode = 1;
  });
}
