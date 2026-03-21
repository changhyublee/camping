import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envDir: "../..",
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
