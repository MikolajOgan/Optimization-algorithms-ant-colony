import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ProblemInstance, Solution, SolverConfig } from "../domain";
import { solve } from "../solver";
import type { SolverProgress } from "../solver/aco";
import type { JobProgress, JobStatus, JobStatusResponse } from "./contracts";

type JobRecord = {
  id: string;
  instance: ProblemInstance;
  config: Partial<SolverConfig>;
  status: JobStatus;
  progress: JobProgress;
  result?: Solution;
  error?: string;
  createdAt: number;
  initialEstimatedExecutionTimeMs: number;
  estimatedExecutionTimeMs: number;
  startedAt?: number;
  completedAt?: number;
};

type RunnerProgressMessage = {
  type: "progress";
  payload: {
    jobId: string;
    progress: SolverProgress;
  };
};

type RunnerCompletedMessage = {
  type: "completed";
  payload: {
    jobId: string;
    result: Solution;
  };
};

type RunnerFailedMessage = {
  type: "failed";
  payload: {
    jobId: string;
    error: string;
  };
};

type RunnerMessage = RunnerProgressMessage | RunnerCompletedMessage | RunnerFailedMessage;

function toPercent(iteration: number, totalIterations: number): number {
  if (totalIterations <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((iteration / totalIterations) * 100)));
}

export class JobManager {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly queue: string[] = [];
  private activeJobId: string | null = null;

  createJob(instance: ProblemInstance, config: Partial<SolverConfig>): string {
    const jobId = crypto.randomUUID();
    const totalIterations = Math.max(1, config.iterations ?? 0);
    const estimatedExecutionTimeMs = this.estimateExecutionTimeMs(instance, config);

    this.jobs.set(jobId, {
      id: jobId,
      instance,
      config,
      status: "queued",
      progress: {
        iteration: 0,
        totalIterations,
        percent: 0
      },
      createdAt: Date.now(),
      initialEstimatedExecutionTimeMs: estimatedExecutionTimeMs,
      estimatedExecutionTimeMs
    });

    this.queue.push(jobId);
    queueMicrotask(() => {
      this.dispatchNext();
    });

    return jobId;
  }

  getJobStatus(jobId: string): JobStatusResponse | null {
    const job = this.jobs.get(jobId);

    if (!job) {
      return null;
    }

    this.refreshEstimate(job);

    return {
      status: job.status,
      progress: job.progress,
      executionTimeMs: this.getExecutionTimeMs(job),
      estimatedExecutionTimeMs: job.estimatedExecutionTimeMs,
      result: job.result,
      error: job.error
    };
  }

  getJobEstimate(jobId: string): number | null {
    const job = this.jobs.get(jobId);
    return job ? job.estimatedExecutionTimeMs : null;
  }

  private dispatchNext(): void {
    if (this.activeJobId) {
      return;
    }

    const nextJobId = this.queue.shift();

    if (!nextJobId) {
      return;
    }

    const job = this.jobs.get(nextJobId);

    if (!job) {
      this.dispatchNext();
      return;
    }

    this.activeJobId = nextJobId;
    job.status = "running";
    job.startedAt = Date.now();

    if (process.env.NODE_ENV === "test") {
      this.executeInProcess(job);
      return;
    }

    this.executeInChildProcess(job);
  }

  private executeInChildProcess(job: JobRecord): void {
    const runnerPath = fileURLToPath(new URL("./solver-runner.ts", import.meta.url));
    const child = this.spawnRunner(runnerPath);
    let completed = false;
    let receivedRunnerMessage = false;

    child.on("message", (message: RunnerMessage) => {
      receivedRunnerMessage = true;

      if (!message?.payload || message.payload.jobId !== job.id) {
        return;
      }

      if (message.type === "progress") {
        job.progress = {
          iteration: message.payload.progress.iteration,
          totalIterations: message.payload.progress.totalIterations,
          percent: toPercent(message.payload.progress.iteration, message.payload.progress.totalIterations),
          bestObjective: message.payload.progress.bestObjective
        };
        return;
      }

      if (message.type === "completed") {
        completed = true;
        job.status = "completed";
        job.result = message.payload.result;
        job.progress = {
          iteration: job.progress.totalIterations,
          totalIterations: job.progress.totalIterations,
          percent: 100,
          bestObjective: message.payload.result.metrics.objective
        };
        job.completedAt = Date.now();
        this.completeActiveJob(job.id);
        return;
      }

      if (message.type === "failed") {
        completed = true;
        job.status = "failed";
        job.error = message.payload.error;
        job.completedAt = Date.now();
        this.completeActiveJob(job.id);
      }
    });

    child.on("error", (error) => {
      if (completed) {
        return;
      }

      // eslint-disable-next-line no-console
      console.warn(`[jobs] child-process startup failed for jobId=${job.id}, falling back to in-process execution: ${error instanceof Error ? error.message : "unknown error"}`);
      this.executeInProcess(job);
    });

    child.on("exit", (code) => {
      if (completed) {
        return;
      }

      if (receivedRunnerMessage) {
        return;
      }

      // eslint-disable-next-line no-console
      console.warn(`[jobs] child-process exited before completion for jobId=${job.id} code=${code ?? "null"}, falling back to in-process execution`);
      this.executeInProcess(job);
    });

    child.send({
      type: "start",
      payload: {
        jobId: job.id,
        instance: job.instance,
        config: job.config
      }
    });
  }

  private spawnRunner(runnerPath: string): ChildProcess {
    return fork(runnerPath, {
      execPath: process.execPath,
      execArgv: ["--import", "tsx"],
      stdio: ["inherit", "inherit", "inherit", "ipc"]
    });
  }

  private executeInProcess(job: JobRecord): void {
    try {
      const result = solve(job.instance, job.config, (snapshot) => {
        job.progress = {
          iteration: snapshot.iteration,
          totalIterations: snapshot.totalIterations,
          percent: toPercent(snapshot.iteration, snapshot.totalIterations),
          bestObjective: snapshot.bestObjective
        };
      });

      job.status = "completed";
      job.result = result;
      job.progress = {
        iteration: job.progress.totalIterations,
        totalIterations: job.progress.totalIterations,
        percent: 100,
        bestObjective: result.metrics.objective
      };
      job.completedAt = Date.now();
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Unknown solver error";
      job.completedAt = Date.now();
    }

    this.completeActiveJob(job.id);
  }

  private completeActiveJob(jobId: string): void {
    if (this.activeJobId === jobId) {
      this.activeJobId = null;
    }

    this.dispatchNext();
  }

  private getExecutionTimeMs(job: JobRecord): number {
    if (!job.startedAt) {
      return 0;
    }

    if (job.completedAt) {
      return Math.max(0, job.completedAt - job.startedAt);
    }

    return Math.max(0, Date.now() - job.startedAt);
  }

  private refreshEstimate(job: JobRecord): void {
    const elapsed = this.getExecutionTimeMs(job);

    if (job.status === "completed" || job.status === "failed") {
      if (elapsed > 0) {
        job.estimatedExecutionTimeMs = elapsed;
      }
      return;
    }

    const completedIterations = job.progress.iteration;
    const totalIterations = job.progress.totalIterations;

    if (elapsed <= 0 || completedIterations <= 0 || totalIterations <= 0) {
      return;
    }

    const projectedTotalByIterationRate = Math.round((elapsed / completedIterations) * totalIterations);
    const minUsefulEstimate = elapsed + 1000;
    const lowerBound = Math.max(minUsefulEstimate, Math.round(job.initialEstimatedExecutionTimeMs * 0.5));
    const upperBound = Math.round(job.initialEstimatedExecutionTimeMs * 8);
    const boundedProjection = Math.min(upperBound, Math.max(lowerBound, projectedTotalByIterationRate));

    // Exponential smoothing to avoid jittering estimates between pings.
    const nextEstimate = Math.round(job.estimatedExecutionTimeMs * 0.6 + boundedProjection * 0.4);
    job.estimatedExecutionTimeMs = Math.max(minUsefulEstimate, nextEstimate);
  }

  private estimateExecutionTimeMs(instance: ProblemInstance, config: Partial<SolverConfig>): number {
    const iterations = Math.max(1, config.iterations ?? 70);
    const colonySize = Math.max(1, config.colonySize ?? 24);
    const customerCount = Math.max(1, instance.customers.length);
    const workloadUnits = iterations * colonySize * customerCount;

    return Math.max(500, Math.round(200 + workloadUnits * 0.12));
  }
}

export function createJobManager(): JobManager {
  return new JobManager();
}
