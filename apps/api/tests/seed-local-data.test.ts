import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { seedLocalData } from "../src/local-data-seed";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createExampleDataset(rootDir: string) {
  const examplesDir = path.join(rootDir, "examples");
  await mkdir(path.join(examplesDir, "equipment"), { recursive: true });
  await writeFile(path.join(examplesDir, "profile.yaml"), "version: 1\nowner:\n  name: 테스트\n", "utf8");
  await writeFile(
    path.join(examplesDir, "equipment", "durable.yaml"),
    "version: 1\nitems:\n  - id: sample\n    name: 예시 텐트\n    category: shelter\n    status: ok\n    quantity: 1\n",
    "utf8",
  );
  return examplesDir;
}

describe("seedLocalData", () => {
  it("fills an empty local data directory with example data", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "camping-seed-empty-"));
    tempDirs.push(tempRoot);

    const examplesDir = await createExampleDataset(tempRoot);
    const dataDir = path.join(tempRoot, ".camping-data");
    const backupDir = path.join(tempRoot, ".camping-backups");

    const result = await seedLocalData({
      examplesPath: examplesDir,
      dataPath: dataDir,
      backupPath: backupDir,
    });

    expect(result.backup).toBeNull();
    expect(await readFile(path.join(dataDir, "profile.yaml"), "utf8")).toContain("테스트");
    expect(await readFile(path.join(dataDir, "equipment", "durable.yaml"), "utf8")).toContain(
      "예시 텐트",
    );
  });

  it("refuses to overwrite existing local data without --replace", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "camping-seed-protect-"));
    tempDirs.push(tempRoot);

    const examplesDir = await createExampleDataset(tempRoot);
    const dataDir = path.join(tempRoot, ".camping-data");
    const backupDir = path.join(tempRoot, ".camping-backups");
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, "profile.yaml"), "version: 1\nowner:\n  name: 실제 사용자\n", "utf8");

    await expect(
      seedLocalData({
        examplesPath: examplesDir,
        dataPath: dataDir,
        backupPath: backupDir,
      }),
    ).rejects.toThrow(/기존 \.camping-data 가 이미 있어/);
    expect(await readFile(path.join(dataDir, "profile.yaml"), "utf8")).toContain("실제 사용자");
  });

  it("backs up existing data before replacing it with examples", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "camping-seed-replace-"));
    tempDirs.push(tempRoot);

    const examplesDir = await createExampleDataset(tempRoot);
    const dataDir = path.join(tempRoot, ".camping-data");
    const backupDir = path.join(tempRoot, ".camping-backups");
    await mkdir(path.join(dataDir, "equipment"), { recursive: true });
    await writeFile(path.join(dataDir, "profile.yaml"), "version: 1\nowner:\n  name: 실제 사용자\n", "utf8");
    await writeFile(
      path.join(dataDir, "equipment", "durable.yaml"),
      "version: 1\nitems:\n  - id: real\n    name: 실제 텐트\n    category: shelter\n    status: ok\n    quantity: 1\n",
      "utf8",
    );

    const result = await seedLocalData({
      shouldReplace: true,
      examplesPath: examplesDir,
      dataPath: dataDir,
      backupPath: backupDir,
    });

    expect(result.backup).not.toBeNull();
    expect(result.backup?.reason).toBe("seed-replace");
    expect(
      await readFile(path.join(result.backup!.data_path, "profile.yaml"), "utf8"),
    ).toContain("실제 사용자");
    expect(await readFile(path.join(dataDir, "equipment", "durable.yaml"), "utf8")).toContain(
      "예시 텐트",
    );
  });
});
