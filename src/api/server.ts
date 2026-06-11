import express from "express";
import { createJobManager, type JobManager } from "./job-manager";
import type { CreateJobRequest, CreateJobResponse } from "./contracts";

type ControllerRequest = {
  params?: Record<string, string>;
  body?: Partial<CreateJobRequest>;
};

type ControllerResponse = {
  status: number;
  body: unknown;
};

export function createJobsController(jobs: JobManager) {
  return {
    createJob(request: ControllerRequest): ControllerResponse {
      const body = request.body;

      if (!body?.instance || !body?.config || typeof body.instance.name !== "string") {
        return {
          status: 400,
          body: { error: "Invalid request body" }
        };
      }

      const jobId = jobs.createJob(body.instance, body.config);
      const response: CreateJobResponse = {
        jobId,
        estimatedExecutionTimeMs: jobs.getJobEstimate(jobId) ?? 0
      };
      return {
        status: 202,
        body: response
      };
    },
    getJobStatus(request: ControllerRequest): ControllerResponse {
      const jobId = request.params?.jobId;

      if (!jobId) {
        return {
          status: 400,
          body: { error: "Missing job id" }
        };
      }

      const status = jobs.getJobStatus(jobId);

      if (!status) {
        return {
          status: 404,
          body: { error: "Job not found" }
        };
      }

      return {
        status: 200,
        body: status
      };
    }
  };
}

export function createApiApp() {
  const app = express();
  const jobs = createJobManager();
  const controller = createJobsController(jobs);
  const lastLoggedSnapshotByJob = new Map<string, string>();

  app.use(express.json({ limit: "1mb" }));

  app.post("/api/jobs", (req, res) => {
    const response = controller.createJob({
      body: req.body as Partial<CreateJobRequest>
    });
    res.status(response.status).json(response.body);
  });

  app.get("/api/jobs/:jobId", (req, res) => {
    const response = controller.getJobStatus({
      params: req.params
    });

    if (response.status === 200) {
      const body = response.body as {
        status: string;
        progress: { percent: number; bestObjective?: number };
        executionTimeMs: number;
        estimatedExecutionTimeMs: number;
        error?: string;
      };
      const remainingMs = Math.max(0, body.estimatedExecutionTimeMs - body.executionTimeMs);
      const snapshot = `${body.status}|${body.progress.percent}|${body.progress.bestObjective ?? "n/a"}`;
      const previousSnapshot = lastLoggedSnapshotByJob.get(req.params.jobId);

      if (snapshot !== previousSnapshot) {
        // eslint-disable-next-line no-console
        console.log(
          `[jobs] ping jobId=${req.params.jobId} status=${body.status} progress=${body.progress.percent}% bestObjective=${body.progress.bestObjective ?? "n/a"} executionMs=${body.executionTimeMs} estMs=${body.estimatedExecutionTimeMs} etaMs=${remainingMs}${body.status === "failed" ? ` error=${body.error ?? "unknown"}` : ""}`
        );
        lastLoggedSnapshotByJob.set(req.params.jobId, snapshot);
      }

      if (body.status === "completed" || body.status === "failed") {
        lastLoggedSnapshotByJob.delete(req.params.jobId);
      }
    }

    res.status(response.status).json(response.body);
  });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 8787);
  createApiApp().listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`API server listening on http://localhost:${port}`);
  });
}
