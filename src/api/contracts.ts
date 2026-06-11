import type { ProblemInstance, Solution, SolverConfig } from "../domain";

export type JobStatus = "queued" | "running" | "completed" | "failed";

export type JobProgress = {
  iteration: number;
  totalIterations: number;
  percent: number;
  bestObjective?: number;
};

export type CreateJobRequest = {
  instance: ProblemInstance;
  config: Partial<SolverConfig>;
};

export type CreateJobResponse = {
  jobId: string;
  estimatedExecutionTimeMs: number;
};

export type JobStatusResponse = {
  status: JobStatus;
  progress: JobProgress;
  executionTimeMs: number;
  estimatedExecutionTimeMs: number;
  result?: Solution;
  error?: string;
};
