import type { AppConfig } from "./config";
import { CampingRepository } from "./file-store/camping-repository";

export async function createStartupDataBackup(
  config: AppConfig,
  options?: {
    onError?: (error: unknown) => void;
  },
) {
  const repository = new CampingRepository(config);

  try {
    return await repository.createDataBackup("startup");
  } catch (error) {
    options?.onError?.(error);
    return null;
  }
}
