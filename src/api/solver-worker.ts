import { parentPort } from "node:worker_threads";
import type { ProblemInstance, SolverConfig } from "../domain";
import { solve, type SolverProgress } from "../solver/aco";

type StartMessage = {
  type: "start";
  payload: {
    jobId: string;
    instance: ProblemInstance;
    config: Partial<SolverConfig>;
  };
};

type ProgressMessage = {
  type: "progress";
  payload: {
    jobId: string;
    progress: SolverProgress;
  };
};

type CompletedMessage = {
  type: "completed";
  payload: {
    jobId: string;
    result: ReturnType<typeof solve>;
  };
};

type FailedMessage = {
  type: "failed";
  payload: {
    jobId: string;
    error: string;
  };
};

if (!parentPort) {
  throw new Error("Solver worker started without parentPort");
}
const port = parentPort;

port.on("message", (message: StartMessage) => {
  if (message.type !== "start") {
    return;
  }

  const { jobId, instance, config } = message.payload;

  try {
    const result = solve(instance, config, (progress) => {
      const progressMessage: ProgressMessage = {
        type: "progress",
        payload: {
          jobId,
          progress
        }
      };
      port.postMessage(progressMessage);
    });

    const completedMessage: CompletedMessage = {
      type: "completed",
      payload: {
        jobId,
        result
      }
    };
    port.postMessage(completedMessage);
  } catch (error) {
    const failedMessage: FailedMessage = {
      type: "failed",
      payload: {
        jobId,
        error: error instanceof Error ? error.message : "Unknown solver error"
      }
    };
    port.postMessage(failedMessage);
  }
});
