import { readFile } from "node:fs/promises";
import type { ExperimentConfig, ProblemInstance, SolverConfig } from "../domain/index.ts";
import { defaultSolverConfig } from "../domain/index.ts";
import { benchmark, solve } from "../solver/index.ts";

type ParsedArgs = {
  paths: string[];
  configPath?: string;
};

async function loadInstance(path: string): Promise<ProblemInstance> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as ProblemInstance;
}

async function loadSolverConfig(path?: string): Promise<Partial<SolverConfig>> {
  if (!path) {
    return {};
  }

  const raw = await readFile(path, "utf8");
  const config = JSON.parse(raw) as unknown;

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`Solver config must be a JSON object: ${path}`);
  }

  return config as Partial<SolverConfig>;
}

function parseArgs(args: string[]): ParsedArgs {
  const paths: string[] = [];
  let configPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--config" || arg === "-c") {
      const next = args[index + 1];

      if (!next) {
        throw new Error(`${arg} requires a solver config JSON path`);
      }

      configPath = next;
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    paths.push(arg);
  }

  return { paths, configPath };
}

function printUsage(): void {
  console.log("Usage:");
  console.log("  yarn cli solve <instance.json> [solver-config.json]");
  console.log("  yarn cli solve <instance.json> --config <solver-config.json>");
  console.log("  yarn cli benchmark <instance-a.json> <instance-b.json> ... [--config <solver-config.json>]");
}

export default async function run(argv = process.argv.slice(2)): Promise<void> {
  const [command, ...args] = argv;

  if (!command || args.length === 0) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  try {
    if (command === "solve") {
      const parsed = parseArgs(args);
      const [instancePath, positionalConfigPath, ...extraPaths] = parsed.paths;

      if (!instancePath || extraPaths.length > 0 || (parsed.configPath && positionalConfigPath)) {
        printUsage();
        process.exitCode = 1;
        return;
      }

      const instance = await loadInstance(instancePath);
      const solverConfig = await loadSolverConfig(parsed.configPath ?? positionalConfigPath);
      const solution = solve(instance, solverConfig);
      console.log(JSON.stringify(solution, null, 2));
      return;
    }

    if (command === "benchmark") {
      const parsed = parseArgs(args);

      if (parsed.paths.length === 0) {
        printUsage();
        process.exitCode = 1;
        return;
      }

      const solverConfig = await loadSolverConfig(parsed.configPath);
      const baseConfig = {
        ...defaultSolverConfig,
        ...solverConfig
      };
      const instances = await Promise.all(parsed.paths.map(loadInstance));
      const config: ExperimentConfig = {
        runsPerInstance: 3,
        seedBase: baseConfig.randomSeed,
        parameterSets: [{}]
      };
      const summary = benchmark(instances, config, baseConfig);
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unknown CLI error");
    process.exitCode = 1;
    return;
  }

  printUsage();
  process.exitCode = 1;
}
