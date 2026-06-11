import type { ProblemInstance, SolverConfig, Solution } from "../domain";
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
    result: Solution;
  };
};

type FailedMessage = {
  type: "failed";
  payload: {
    jobId: string;
    error: string;
  };
};

function send(message: ProgressMessage | CompletedMessage | FailedMessage): void {
  if (typeof process.send === "function") {
    process.send(message);
  }
}

let started = false;
const keepAlive = setInterval(() => {
  // Keep child process alive until parent sends the start message.
}, 1000);

process.on("message", (message: StartMessage) => {
  if (!message || message.type !== "start") {
    return;
  }
  started = true;
  clearInterval(keepAlive);

  const { jobId, instance, config } = message.payload;

  try {
    const result = solve(instance, config, (progress) => {
      send({
        type: "progress",
        payload: {
          jobId,
          progress
        }
      });
    });

    send({
      type: "completed",
      payload: {
        jobId,
        result
      }
    });
  } catch (error) {
    send({
      type: "failed",
      payload: {
        jobId,
        error: error instanceof Error ? error.message : "Unknown solver error"
      }
    });
  }

  setTimeout(() => {
    process.exit(0);
  }, 0);
});

process.on("disconnect", () => {
  if (!started) {
    clearInterval(keepAlive);
    process.exit(0);
  }
});
