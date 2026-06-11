import type { ExperimentConfig, ExperimentSummary, ProblemInstance, SolverConfig } from "../domain";
import { defaultSolverConfig } from "../domain";
import { mean } from "./math";
import { solve } from "./aco";

export function benchmark(
  instances: ProblemInstance[],
  experimentConfig: ExperimentConfig,
  baseConfig?: Partial<SolverConfig>
): ExperimentSummary {
  const runs = instances.flatMap((instance, instanceIndex) =>
    experimentConfig.parameterSets.map((parameterSet, parameterIndex) => {
      const outcomes = [];
      const runtimes = [];

      for (let runIndex = 0; runIndex < experimentConfig.runsPerInstance; runIndex += 1) {
        const startedAt = performance.now();
        const solution = solve(instance, {
          ...defaultSolverConfig,
          ...baseConfig,
          ...parameterSet,
          randomSeed: experimentConfig.seedBase + instanceIndex * 100 + parameterIndex * 10 + runIndex
        });
        runtimes.push(performance.now() - startedAt);
        outcomes.push(solution);
      }

      return {
        instanceName:
          experimentConfig.parameterSets.length > 1
            ? `${instance.name}#set-${parameterIndex + 1}`
            : instance.name,
        bestObjective: Math.min(...outcomes.map((outcome) => outcome.metrics.objective)),
        meanObjective: mean(outcomes.map((outcome) => outcome.metrics.objective)),
        worstObjective: Math.max(...outcomes.map((outcome) => outcome.metrics.objective)),
        feasibilityRate:
          outcomes.filter((outcome) => outcome.metrics.feasible).length / outcomes.length,
        meanRuntimeMs: mean(runtimes)
      };
    })
  );

  return { runs };
}
