import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config";
import { createStartupDataBackup } from "../src/startup-backup";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("createStartupDataBackup", () => {
  it("creates a startup snapshot when local data exists", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "camping-startup-backup-"));
    tempDirs.push(tempRoot);

    const dataDir = path.join(tempRoot, ".camping-data");
    const backupDir = path.join(tempRoot, ".camping-backups");

    await cp(path.join(projectRoot, "docs", "examples"), dataDir, { recursive: true });

    const snapshot = await createStartupDataBackup(
      resolveConfig({
        projectRoot,
        dataDir,
        backupDir,
      }),
    );

    expect(snapshot).not.toBeNull();
    expect(snapshot?.reason).toBe("startup");
    expect(
      await readFile(path.join(snapshot!.data_path, "equipment", "durable.yaml"), "utf8"),
    ).toContain("tunnel-tent-4p-khaki");
  });

  it("does not throw when startup backup creation fails", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "camping-startup-backup-error-"));
    tempDirs.push(tempRoot);

    const dataDir = path.join(tempRoot, ".camping-data");
    const backupDir = path.join(tempRoot, "backup-file");
    const capturedErrors: unknown[] = [];

    await cp(path.join(projectRoot, "docs", "examples"), dataDir, { recursive: true });
    await writeFile(backupDir, "backup root must be a directory", "utf8");

    await expect(
      createStartupDataBackup(
        resolveConfig({
          projectRoot,
          dataDir,
          backupDir,
        }),
        {
          onError: (error) => {
            capturedErrors.push(error);
          },
        },
      ),
    ).resolves.toBeNull();
    expect(capturedErrors).toHaveLength(1);
  });
});
