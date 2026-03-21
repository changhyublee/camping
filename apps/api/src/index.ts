import { buildServer } from "./server";
import { resolveConfig } from "./config";

async function main() {
  const config = resolveConfig();
  const app = await buildServer({ logger: true });

  await app.listen({
    host: "0.0.0.0",
    port: config.apiPort,
  });
}

main().catch((error) => {
  console.error("Failed to start API server:", error);
  process.exitCode = 1;
});
