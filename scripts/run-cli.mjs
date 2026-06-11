import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { build } from "esbuild";

const tempDir = await mkdtemp(path.join(tmpdir(), "marszrutyzacja-cli-"));
const outputFile = path.join(tempDir, "cli.mjs");

try {
  await build({
    entryPoints: ["src/cli/index.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    outfile: outputFile
  });

  const cliModule = await import(`file://${outputFile}`);

  if (typeof cliModule.default === "function") {
    await cliModule.default(process.argv.slice(2));
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
