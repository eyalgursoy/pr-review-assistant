import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/extension.ts"],
  format: ["cjs"],
  platform: "node",
  target: "node18",
  outDir: "dist",
  external: ["vscode"],
  sourcemap: true,
  minify: true,
  clean: true,
});
