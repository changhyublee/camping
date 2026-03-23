import { buildServer } from "./server";
import { resolveConfig } from "./config";
import { createStartupDataBackup } from "./startup-backup";

async function main() {
  const config = resolveConfig();
  const app = await buildServer({ logger: true });
  const startupBackup = await createStartupDataBackup(config, {
    onError: (error) => {
      app.log.warn(
        {
          error,
          backupDir: config.backupDir,
          dataDir: config.dataDir,
        },
        "서버 시작 전 로컬 운영 데이터 백업 생성에 실패했습니다. 서버는 계속 시작합니다.",
      );
    },
  });

  if (startupBackup) {
    app.log.info(
      {
        backupPath: startupBackup.backup_path,
        reason: startupBackup.reason,
      },
      "서버 시작 전 로컬 운영 데이터 백업을 생성했습니다.",
    );
  }

  await app.listen({
    host: "0.0.0.0",
    port: config.apiPort,
  });
}

main().catch((error) => {
  console.error("Failed to start API server:", error);
  process.exitCode = 1;
});
