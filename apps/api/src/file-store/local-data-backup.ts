import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const DATA_BACKUP_REASONS = ["manual", "startup", "seed-replace"] as const;

export type DataBackupReason = (typeof DATA_BACKUP_REASONS)[number];

export type DataBackupSnapshot = {
  created_at: string;
  reason: DataBackupReason;
  source_path: string;
  backup_path: string;
  data_path: string;
};

const BACKUP_METADATA_FILENAME = "backup.json";
const BACKUP_DATA_DIRNAME = "data";

type PersistedDataBackupSnapshot = DataBackupSnapshot & {
  version: 1;
};

export async function hasBackupSourceData(sourceDir: string): Promise<boolean> {
  try {
    const entries = await readdir(sourceDir, { withFileTypes: true });
    return entries.some((entry) => entry.name !== ".DS_Store");
  } catch {
    return false;
  }
}

export async function createTimestampedDataBackup(input: {
  sourceDir: string;
  backupRootDir: string;
  reason: DataBackupReason;
}): Promise<DataBackupSnapshot | null> {
  if (!(await hasBackupSourceData(input.sourceDir))) {
    return null;
  }

  const createdAt = new Date().toISOString();
  const backupDirName = sanitizeTimestampForPath(createdAt);
  const backupPath = await createUniqueBackupDirectory(
    input.backupRootDir,
    backupDirName,
  );
  const dataPath = path.join(backupPath, BACKUP_DATA_DIRNAME);

  await mkdir(dataPath, { recursive: true });

  const entries = await readdir(input.sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".DS_Store") {
      continue;
    }

    const sourcePath = path.join(input.sourceDir, entry.name);
    const targetPath = path.join(dataPath, entry.name);

    if (entry.isDirectory()) {
      await cp(sourcePath, targetPath, { recursive: true, force: true });
    } else {
      await cp(sourcePath, targetPath, { force: true });
    }
  }

  const snapshot: PersistedDataBackupSnapshot = {
    version: 1,
    created_at: createdAt,
    reason: input.reason,
    source_path: input.sourceDir,
    backup_path: backupPath,
    data_path: dataPath,
  };

  await writeFile(
    path.join(backupPath, BACKUP_METADATA_FILENAME),
    JSON.stringify(snapshot, null, 2),
    "utf8",
  );

  return {
    created_at: snapshot.created_at,
    reason: snapshot.reason,
    source_path: snapshot.source_path,
    backup_path: snapshot.backup_path,
    data_path: snapshot.data_path,
  };
}

export async function listTimestampedDataBackups(
  backupRootDir: string,
): Promise<DataBackupSnapshot[]> {
  try {
    const entries = await readdir(backupRootDir, { withFileTypes: true });
    const snapshots = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) =>
          readBackupSnapshot(path.join(backupRootDir, entry.name)),
        ),
    );

    return snapshots
      .filter((snapshot): snapshot is DataBackupSnapshot => snapshot !== null)
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
  } catch {
    return [];
  }
}

function sanitizeTimestampForPath(value: string) {
  return value.replaceAll(":", "-");
}

async function createUniqueBackupDirectory(
  backupRootDir: string,
  baseName: string,
): Promise<string> {
  await mkdir(backupRootDir, { recursive: true });

  let suffix = 0;

  while (true) {
    const directoryName = suffix === 0 ? baseName : `${baseName}-${suffix + 1}`;
    const backupPath = path.join(backupRootDir, directoryName);

    try {
      await mkdir(backupPath);
      return backupPath;
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
      suffix += 1;
    }
  }
}

async function readBackupSnapshot(
  backupPath: string,
): Promise<DataBackupSnapshot | null> {
  try {
    const raw = await readFile(path.join(backupPath, BACKUP_METADATA_FILENAME), "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedDataBackupSnapshot>;

    if (
      parsed.version !== 1 ||
      typeof parsed.created_at !== "string" ||
      typeof parsed.reason !== "string" ||
      !DATA_BACKUP_REASONS.includes(parsed.reason as DataBackupReason) ||
      typeof parsed.source_path !== "string" ||
      typeof parsed.backup_path !== "string" ||
      typeof parsed.data_path !== "string"
    ) {
      return null;
    }

    return {
      created_at: parsed.created_at,
      reason: parsed.reason as DataBackupReason,
      source_path: parsed.source_path,
      backup_path: parsed.backup_path,
      data_path: parsed.data_path,
    };
  } catch {
    return null;
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}
