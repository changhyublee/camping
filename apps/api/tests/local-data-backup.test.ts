import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTimestampedDataBackup,
  hasBackupSourceData,
  listTimestampedDataBackups,
} from "../src/file-store/local-data-backup";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("local data backup", () => {
  it("creates a timestamped snapshot under a separate backup root", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "camping-backup-test-"));
    tempDirs.push(tempRoot);

    const sourceDir = path.join(tempRoot, ".camping-data");
    const backupRootDir = path.join(tempRoot, ".camping-backups");
    await mkdir(path.join(sourceDir, "equipment"), { recursive: true });
    await writeFile(
      path.join(sourceDir, "equipment", "durable.yaml"),
      "version: 1\nitems: []\n",
      "utf8",
    );

    const snapshot = await createTimestampedDataBackup({
      sourceDir,
      backupRootDir,
      reason: "manual",
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.reason).toBe("manual");
    expect(snapshot?.backup_path.startsWith(backupRootDir)).toBe(true);
    expect(
      await readFile(path.join(snapshot!.data_path, "equipment", "durable.yaml"), "utf8"),
    ).toContain("version: 1");

    const backups = await listTimestampedDataBackups(backupRootDir);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toEqual(snapshot);
  });

  it("returns null when there is no source data to protect", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "camping-backup-empty-"));
    tempDirs.push(tempRoot);

    const sourceDir = path.join(tempRoot, ".camping-data");
    const backupRootDir = path.join(tempRoot, ".camping-backups");

    await mkdir(sourceDir, { recursive: true });

    await expect(hasBackupSourceData(sourceDir)).resolves.toBe(false);
    await expect(
      createTimestampedDataBackup({
        sourceDir,
        backupRootDir,
        reason: "startup",
      }),
    ).resolves.toBeNull();
  });
});
