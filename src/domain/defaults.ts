import type { SolverConfig } from "./types";

export const defaultSolverConfig: SolverConfig = {
  colonySize: 10,
  iterations: 25,
  alpha: 1,
  beta: 3,
  evaporationRate: 0.4,
  evaporationRateStep: -0.005,
  minEvaporationRate: 0.08,
  maxEvaporationRate: 0.45,
  eliteWeight: 1.8,
  globalBestWeight: 2.4,
  stagnationPheromoneJitter: 0.02,
  latePenalty: 15,
  unservedPenalty: 400,
  priorityPenalty: 20,
  candidateWidth: 5,
  localSearch: true,
  stagnationWindow: 8,
  randomSeed: 42
};
