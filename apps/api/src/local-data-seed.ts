import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { createTimestampedDataBackup } from "./file-store/local-data-backup";

export async function seedLocalData(options: {
  shouldReplace?: boolean;
  examplesPath: string;
  dataPath: string;
  backupPath: string;
}) {
  const shouldReplace = options.shouldReplace ?? false;
  const entries = await readdir(options.examplesPath, { withFileTypes: true });
  const hasExistingData = await hasEntries(options.dataPath);

  if (hasExistingData && !shouldReplace) {
    throw new Error(
      [
        "기존 .camping-data 가 이미 있어 예시 데이터로 덮어쓰지 않았습니다.",
        "pnpm seed 는 새 환경에서 예시 데이터를 처음 채울 때만 사용하세요.",
        "기존 데이터를 예시로 교체하려면 pnpm seed -- --replace 를 사용하세요.",
        "이 경우 현재 데이터는 .camping-backups/<timestamp>/ 아래에 먼저 백업됩니다.",
      ].join(" "),
    );
  }

  const backup = hasExistingData
    ? await createTimestampedDataBackup({
        sourceDir: options.dataPath,
        backupRootDir: options.backupPath,
        reason: "seed-replace",
      })
    : null;

  await rm(options.dataPath, { recursive: true, force: true });
  await mkdir(options.dataPath, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(options.examplesPath, entry.name);
    const targetPath = path.join(options.dataPath, entry.name);

    if (entry.isDirectory()) {
      await cp(sourcePath, targetPath, { recursive: true, force: true });
    } else {
      await cp(sourcePath, targetPath, { force: true });
    }
  }

  await mkdir(path.join(options.dataPath, "cache", "weather"), { recursive: true });
  await mkdir(path.join(options.dataPath, "cache", "places"), { recursive: true });

  return {
    backup,
    dataPath: options.dataPath,
  };
}

async function hasEntries(directory: string): Promise<boolean> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.some((entry) => entry.name !== ".DS_Store");
  } catch {
    return false;
  }
}
