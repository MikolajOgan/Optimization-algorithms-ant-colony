import { useEffect, useMemo, useState } from "react";
import type { ProblemInstance, Solution } from "../domain";
import { defaultSolverConfig } from "../domain";
import type { CreateJobResponse, JobStatusResponse } from "../api/contracts";
import { builtInInstances } from "./instances";
import {
  downloadInstance,
  generateInstance,
  parseProblemInstance,
  type InstanceGeneratorConfig
} from "./instance-tools";

const palette = ["#f97316", "#06b6d4", "#2563eb", "#e11d48", "#16a34a", "#8b5cf6"];

type SolverFormState = {
  instanceName: string;
  iterations: number;
  colonySize: number;
  minEvaporationRate: number;
  maxEvaporationRate: number;
  stagnationWindow: number;
};

type GeneratorFormState = InstanceGeneratorConfig;
type DifficultyPreset = "easy" | "balanced" | "hard";
type SavedSolutionSnapshot = {
  version: 1;
  savedAt: string;
  instance: ProblemInstance;
  applied: SolverFormState;
  solution: Solution;
};

function scalePoint(value: number, min: number, max: number, size: number): number {
  if (max === min) {
    return size / 2;
  }

  return 24 + ((value - min) / (max - min)) * (size - 48);
}

function RouteMap({ instance, solution }: { instance: ProblemInstance; solution: Solution }) {
  const width = 720;
  const height = 420;
  const allPoints = [instance.depot, ...instance.customers];
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));
  const customerById = new Map(instance.customers.map((customer) => [customer.id, customer]));

  return (
    <svg className="route-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Route map">
      <rect x="0" y="0" width={width} height={height} rx="22" fill="#f8fafc" />
      {solution.routes.map((route, index) => {
        const points = [instance.depot, ...route.customerIds.map((id) => customerById.get(id)!), instance.depot]
          .map((point) => `${scalePoint(point.x, minX, maxX, width)},${height - scalePoint(point.y, minY, maxY, height)}`)
          .join(" ");

        return (
          <polyline
            key={route.vehicleId}
            points={points}
            fill="none"
            stroke={palette[index % palette.length]}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
      <circle
        cx={scalePoint(instance.depot.x, minX, maxX, width)}
        cy={height - scalePoint(instance.depot.y, minY, maxY, height)}
        r="10"
        fill="#10233c"
      />
      {instance.customers.map((customer) => (
        <g key={customer.id}>
          <circle
            cx={scalePoint(customer.x, minX, maxX, width)}
            cy={height - scalePoint(customer.y, minY, maxY, height)}
            r="7"
            fill={customer.priority >= 3 ? "#dc2626" : "#0f766e"}
          />
          <text
            x={scalePoint(customer.x, minX, maxX, width) + 9}
            y={height - scalePoint(customer.y, minY, maxY, height) - 8}
            fontSize="11"
            fill="#10233c"
          >
            {customer.id}
          </text>
        </g>
      ))}
    </svg>
  );
}

function ConvergenceChart({ solution }: { solution: Solution }) {
  const width = 720;
  const height = 220;
  const margin = {
    top: 56,
    right: 20,
    bottom: 36,
    left: 76
  };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const values = solution.convergence.map((entry) => entry.bestObjective);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const yRange = max - min;
  const yTicks = [0, 0.5, 1].map((ratio) => max - ratio * yRange);
  const lastIteration = solution.convergence[solution.convergence.length - 1]?.iteration ?? 1;
  const points = solution.convergence
    .map((entry, index) => {
      const x = margin.left + (index / Math.max(1, solution.convergence.length - 1)) * chartWidth;
      const y =
        max === min
          ? margin.top + chartHeight / 2
          : margin.top + ((entry.bestObjective - min) / (max - min)) * chartHeight;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="convergence-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Convergence chart">
      <rect x="0" y="0" width={width} height={height} rx="18" fill="#fff" />
      {yTicks.map((tickValue, index) => {
        const y =
          max === min
            ? margin.top + chartHeight / 2
            : margin.top + ((tickValue - min) / Math.max(1e-9, max - min)) * chartHeight;
        return (
          <g key={index}>
            <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="#e5edf5" strokeWidth="1" />
            <text x={margin.left - 8} y={y + 4} fontSize="11" textAnchor="end" fill="#58718a">
              {tickValue.toFixed(0)}
            </text>
          </g>
        );
      })}
      <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} stroke="#8ea4b8" strokeWidth="1.2" />
      <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} stroke="#8ea4b8" strokeWidth="1.2" />
      <polyline points={points} fill="none" stroke="#0f7c90" strokeWidth="3" />
      <circle
        cx={margin.left}
        cy={max === min ? margin.top + chartHeight / 2 : margin.top + ((values[0] - min) / Math.max(1e-9, max - min)) * chartHeight}
        r="3.5"
        fill="#0f7c90"
      />
      <circle
        cx={width - margin.right}
        cy={max === min ? margin.top + chartHeight / 2 : margin.top + ((values[values.length - 1] - min) / Math.max(1e-9, max - min)) * chartHeight}
        r="3.5"
        fill="#0f7c90"
      />
      <text x="22" y="24" fontSize="12" fill="#35506b">
        Best objective by iteration
      </text>
      <text x={margin.left} y={height - 12} fontSize="11" fill="#58718a">
        Iteration 1
      </text>
      <text x={width - margin.right} y={height - 12} fontSize="11" textAnchor="end" fill="#58718a">
        Iteration {lastIteration}
      </text>
      <text x="22" y="42" fontSize="11" fill="#58718a">
        Lower is better
      </text>
    </svg>
  );
}

function metricTooltip(description: string, formula: string): string {
  return `${description}\n${formula}`;
}

function runStatusText(
  isSubmitting: boolean,
  isRunning: boolean,
  hasPendingChanges: boolean,
  jobStatus: JobStatusResponse | null
): string {
  function formatSeconds(ms: number): string {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  if (isSubmitting) {
    return "Submitting solver job...";
  }

  if (isRunning && jobStatus) {
    const remainingMs = Math.max(0, jobStatus.estimatedExecutionTimeMs - jobStatus.executionTimeMs);
    return `Solver ${jobStatus.status} (${jobStatus.progress.percent}%) · elapsed ${formatSeconds(jobStatus.executionTimeMs)} · estimate ${formatSeconds(jobStatus.estimatedExecutionTimeMs)} · ETA ${formatSeconds(remainingMs)}`;
  }

  if (isRunning) {
    return "Solver job queued. Waiting for progress update...";
  }

  if (hasPendingChanges) {
    return "Parameters changed. Run solver to update results.";
  }

  return "Results are up to date.";
}

type AppProps = {
  autoRunOnMount?: boolean;
  pollIntervalMs?: number;
};

export function App({ autoRunOnMount = true, pollIntervalMs = 5000 }: AppProps) {
  const initialFormState: SolverFormState = {
    instanceName: builtInInstances[0].name,
    iterations: defaultSolverConfig.iterations,
    colonySize: defaultSolverConfig.colonySize,
    minEvaporationRate: defaultSolverConfig.minEvaporationRate,
    maxEvaporationRate: defaultSolverConfig.maxEvaporationRate,
    stagnationWindow: defaultSolverConfig.stagnationWindow
  };
  const initialGeneratorState: GeneratorFormState = {
    name: "generated-demo",
    customerCount: 12,
    vehicleCount: 3,
    capacity: 16,
    maxRouteDuration: 240,
    mapSize: 100,
    horizon: 300,
    demandMin: 1,
    demandMax: 5,
    serviceMin: 4,
    serviceMax: 12,
    priorityMax: 4,
    seed: 101
  };
  const [draft, setDraft] = useState<SolverFormState>(initialFormState);
  const [applied, setApplied] = useState<SolverFormState>(initialFormState);
  const [customInstances, setCustomInstances] = useState<ProblemInstance[]>([]);
  const [generator, setGenerator] = useState<GeneratorFormState>(initialGeneratorState);
  const [difficultyPreset, setDifficultyPreset] = useState<DifficultyPreset>("balanced");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [instanceMessage, setInstanceMessage] = useState("Built-in instances are ready. Generate or import another one when needed.");
  const [solution, setSolution] = useState<Solution | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);
  const [pendingApplied, setPendingApplied] = useState<SolverFormState | null>(null);

  const availableInstances = useMemo(
    () => [...builtInInstances, ...customInstances],
    [customInstances]
  );
  const currentInstance = useMemo(
    () =>
      availableInstances.find((instance) => instance.name === (solution?.instanceName ?? applied.instanceName)) ??
      availableInstances[0],
    [applied.instanceName, availableInstances, solution?.instanceName]
  );
  const selectedDraftInstance = useMemo(
    () => availableInstances.find((instance) => instance.name === draft.instanceName) ?? availableInstances[0],
    [availableInstances, draft.instanceName]
  );
  const hasPendingChanges =
    draft.instanceName !== applied.instanceName ||
    draft.iterations !== applied.iterations ||
    draft.colonySize !== applied.colonySize ||
    draft.minEvaporationRate !== applied.minEvaporationRate ||
    draft.maxEvaporationRate !== applied.maxEvaporationRate ||
    draft.stagnationWindow !== applied.stagnationWindow;

  function applyDifficultyPreset(preset: DifficultyPreset): void {
    setDifficultyPreset(preset);
    setGenerator((current) => {
      if (preset === "easy") {
        return {
          ...current,
          customerCount: 24,
          vehicleCount: 6,
          capacity: 24,
          maxRouteDuration: 320,
          mapSize: 80,
          horizon: 420,
          demandMin: 1,
          demandMax: 3,
          serviceMin: 3,
          serviceMax: 8
        };
      }

      if (preset === "hard") {
        return {
          ...current,
          customerCount: 60,
          vehicleCount: 4,
          capacity: 12,
          maxRouteDuration: 180,
          mapSize: 140,
          horizon: 220,
          demandMin: 2,
          demandMax: 7,
          serviceMin: 6,
          serviceMax: 18
        };
      }

      return {
        ...current,
        customerCount: 40,
        vehicleCount: 5,
        capacity: 16,
        maxRouteDuration: 240,
        mapSize: 100,
        horizon: 300,
        demandMin: 1,
        demandMax: 5,
        serviceMin: 4,
        serviceMax: 12
      };
    });
  }

  useEffect(() => {
    if (!currentJobId) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${currentJobId}`);

        if (!response.ok) {
          setIsSubmitting(false);
          setIsRunning(false);
          setCurrentJobId(null);
          setInstanceMessage("Failed to fetch job status.");
          return;
        }

        const status = (await response.json()) as JobStatusResponse;
        setJobStatus(status);

        if (status.status === "completed" && status.result) {
          setSolution(status.result);
          setApplied((current) => pendingApplied ?? current);
          setPendingApplied(null);
          setIsSubmitting(false);
          setIsRunning(false);
          setCurrentJobId(null);
        }

        if (status.status === "failed") {
          setInstanceMessage(status.error ?? "Solver job failed.");
          setPendingApplied(null);
          setIsSubmitting(false);
          setIsRunning(false);
          setCurrentJobId(null);
        }
      } catch (error) {
        setPendingApplied(null);
        setIsSubmitting(false);
        setIsRunning(false);
        setCurrentJobId(null);
        setInstanceMessage(error instanceof Error ? error.message : "Failed to fetch job status.");
      }
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentJobId, pollIntervalMs, pendingApplied]);

  useEffect(() => {
    if (autoRunOnMount) {
      void runSolver(initialFormState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunOnMount]);

  async function runSolver(nextState: SolverFormState): Promise<void> {
    const nextInstance =
      availableInstances.find((instance) => instance.name === nextState.instanceName) ?? availableInstances[0];

    setIsRunning(true);
    setIsSubmitting(true);
    setJobStatus(null);

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          instance: nextInstance,
          config: {
            ...defaultSolverConfig,
            iterations: nextState.iterations,
            colonySize: nextState.colonySize,
            minEvaporationRate: nextState.minEvaporationRate,
            maxEvaporationRate: nextState.maxEvaporationRate,
            stagnationWindow: nextState.stagnationWindow
          }
        })
      });

      if (!response.ok) {
        throw new Error("Job submission failed");
      }

      const data = (await response.json()) as CreateJobResponse;
      setCurrentJobId(data.jobId);
      setJobStatus({
        status: "queued",
        progress: {
          iteration: 0,
          totalIterations: Math.max(1, nextState.iterations),
          percent: 0
        },
        executionTimeMs: 0,
        estimatedExecutionTimeMs: data.estimatedExecutionTimeMs
      });
      setIsSubmitting(false);
      setPendingApplied(nextState);
    } catch (error) {
      setPendingApplied(null);
      setIsSubmitting(false);
      setIsRunning(false);
      setInstanceMessage(error instanceof Error ? error.message : "Job submission failed.");
    }
  }

  function registerCustomInstance(instance: ProblemInstance, message: string): void {
    setCustomInstances((current) => {
      const withoutDuplicate = current.filter((entry) => entry.name !== instance.name);
      return [...withoutDuplicate, instance];
    });
    setDraft((current) => ({
      ...current,
      instanceName: instance.name
    }));
    setInstanceMessage(message);
  }

  function handleGenerateInstance(): void {
    const instance = generateInstance(generator);
    registerCustomInstance(
      instance,
      `Generated instance "${instance.name}". Review it, run the solver, then download it as JSON if you want to keep it.`
    );
  }

  async function handleImportInstance(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const imported = parseProblemInstance(await file.text());
      registerCustomInstance(imported, `Imported instance "${imported.name}" from file.`);
    } catch (error) {
      setInstanceMessage(
        error instanceof Error ? `Import failed: ${error.message}` : "Import failed."
      );
    } finally {
      event.target.value = "";
    }
  }

  function handleDownloadSolution(): void {
    if (!solution) {
      return;
    }

    const snapshot: SavedSolutionSnapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      instance: currentInstance,
      applied,
      solution
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${solution.instanceName}-solution.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImportSolution(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as SavedSolutionSnapshot;

      if (parsed.version !== 1 || !parsed.instance?.name || !parsed.solution?.metrics || !parsed.applied) {
        throw new Error("Unsupported solution snapshot format.");
      }

      registerCustomInstance(parsed.instance, `Loaded saved solution for "${parsed.instance.name}".`);
      setApplied(parsed.applied);
      setDraft(parsed.applied);
      setSolution(parsed.solution);
      setPendingApplied(null);
      setCurrentJobId(null);
      setIsSubmitting(false);
      setIsRunning(false);
      setJobStatus(null);
    } catch (error) {
      setInstanceMessage(error instanceof Error ? `Solution import failed: ${error.message}` : "Solution import failed.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <main className="app-shell">
      <div className="app-grid">
        <section className="panel controls-panel">
          <h1 className="hero-title">VRP</h1>
          <p className="run-status" aria-live="polite">
            {runStatusText(isSubmitting, isRunning, hasPendingChanges, jobStatus)}
          </p>
          <label>
            Instance
            <select
              value={draft.instanceName}
              onChange={(event) => setDraft((current) => ({ ...current, instanceName: event.target.value }))}
              disabled={isRunning}
            >
              {availableInstances.map((instance) => (
                <option key={instance.name} value={instance.name}>
                  {instance.name}
                  {customInstances.some((entry) => entry.name === instance.name) ? " (custom)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Iterations
            <input
              type="text"
              min="10"
              max="300"
              value={draft.iterations}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  iterations: Number(event.target.value)
                }))
              }
              disabled={isRunning}
            />
          </label>
          <label>
            Colony size
            <input
              type="text"
              min="4"
              max="80"
              value={draft.colonySize}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  colonySize: Number(event.target.value)
                }))
              }
              disabled={isRunning}
            />
          </label>
          <label>
            Min evaporation rate
            <input
              type="text"
              min="0"
              max="1"
              step="0.01"
              value={draft.minEvaporationRate}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  minEvaporationRate: Number(event.target.value)
                }))
              }
              disabled={isRunning}
            />
          </label>
          <label>
            Max evaporation rate
            <input
              type="text"
              min="0"
              max="1"
              step="0.01"
              value={draft.maxEvaporationRate}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  maxEvaporationRate: Number(event.target.value)
                }))
              }
              disabled={isRunning}
            />
          </label>
          <label>
            Stagnation window
            <input
              type="text"
              min="1"
              max="50"
              value={draft.stagnationWindow}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  stagnationWindow: Number(event.target.value)
                }))
              }
              disabled={isRunning}
            />
          </label>
          <div className="button-row">
            <button
              type="button"
              onClick={() => {
                void runSolver(draft);
              }}
              disabled={isRunning || !hasPendingChanges}
            >
              {isRunning ? "Running..." : "Run solver"}
            </button>
            <button
              type="button"
              onClick={() => downloadInstance(selectedDraftInstance)}
              disabled={isRunning}
            >
              Download JSON
            </button>
            <label className="file-button">
              Import JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleImportInstance}
                disabled={isRunning}
              />
            </label>
          </div>
          <p className="instance-status">{instanceMessage}</p>
          <section className="generator-panel">
            <h2>Instance Generator</h2>
            <div className="preset-row">
              <label
                data-tooltip={"Easy: more vehicles/capacity, shorter travel, wider horizon.\nLower chance of unserved customers."}
              >
                <input
                  type="radio"
                  name="difficulty-preset"
                  checked={difficultyPreset === "easy"}
                  onChange={() => applyDifficultyPreset("easy")}
                  disabled={isRunning}
                />
                Easy
              </label>
              <label
                data-tooltip={"Balanced: moderate workload and constraints.\nGood default for quick comparisons."}
              >
                <input
                  type="radio"
                  name="difficulty-preset"
                  checked={difficultyPreset === "balanced"}
                  onChange={() => applyDifficultyPreset("balanced")}
                  disabled={isRunning}
                />
                Balanced
              </label>
              <label
                data-tooltip={"Hard: fewer resources, larger map, tighter timing.\nHigher chance of unserved customers and penalties."}
              >
                <input
                  type="radio"
                  name="difficulty-preset"
                  checked={difficultyPreset === "hard"}
                  onChange={() => applyDifficultyPreset("hard")}
                  disabled={isRunning}
                />
                Hard
              </label>
            </div>
            <div className="generator-grid">
              <label data-tooltip={"Name assigned to generated instance.\nUsed in instance selector and downloaded filenames."}>
                Generated name
                <input
                  type="text"
                  value={generator.name}
                  onChange={(event) =>
                    setGenerator((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                  disabled={isRunning}
                />
              </label>
              <label data-tooltip={"Random seed for reproducible generation.\nSame seed + same params => same instance."}>
                Seed
                <input
                  type="text"
                  value={generator.seed}
                  onChange={(event) =>
                    setGenerator((current) => ({
                      ...current,
                      seed: Number(event.target.value)
                    }))
                  }
                  disabled={isRunning}
                />
              </label>
              <label data-tooltip={"Number of generated customers.\nMore customers usually means harder routing."}>
                Customers
                <input
                  type="text"
                  min="3"
                  max="120"
                  value={generator.customerCount}
                  onChange={(event) =>
                    setGenerator((current) => ({
                      ...current,
                      customerCount: Number(event.target.value)
                    }))
                  }
                  disabled={isRunning}
                />
              </label>
              <label data-tooltip={"Number of available vehicles.\nMore vehicles usually reduces unserved customers."}>
                Vehicles
                <input
                  type="text"
                  min="1"
                  max="20"
                  value={generator.vehicleCount}
                  onChange={(event) =>
                    setGenerator((current) => ({
                      ...current,
                      vehicleCount: Number(event.target.value)
                    }))
                  }
                  disabled={isRunning}
                />
              </label>
              <label data-tooltip={"Vehicle load capacity.\nHigher capacity allows serving more demand per route."}>
                Capacity
                <input
                  type="text"
                  min="1"
                  max="200"
                  value={generator.capacity}
                  onChange={(event) =>
                    setGenerator((current) => ({
                      ...current,
                      capacity: Number(event.target.value)
                    }))
                  }
                  disabled={isRunning}
                />
              </label>
              <label data-tooltip={"Maximum allowed duration per vehicle route.\nHigher value gives more routing slack."}>
                Route duration
                <input
                  type="text"
                  min="30"
                  max="1000"
                  value={generator.maxRouteDuration}
                  onChange={(event) =>
                    setGenerator((current) => ({
                      ...current,
                      maxRouteDuration: Number(event.target.value)
                    }))
                  }
                  disabled={isRunning}
                />
              </label>
              <label data-tooltip={"Coordinate space size for point placement.\nLarger map generally increases travel distances."}>
                Map size
                <input
                  type="text"
                  min="40"
                  max="400"
                  value={generator.mapSize}
                  onChange={(event) =>
                    setGenerator((current) => ({
                      ...current,
                      mapSize: Number(event.target.value)
                    }))
                  }
                  disabled={isRunning}
                />
              </label>
              <label data-tooltip={"Global time-window horizon used by generator.\nLarger horizon usually means less timing pressure."}>
                Horizon
                <input
                  type="text"
                  min="60"
                  max="2000"
                  value={generator.horizon}
                  onChange={(event) =>
                    setGenerator((current) => ({
                      ...current,
                      horizon: Number(event.target.value)
                    }))
                  }
                  disabled={isRunning}
                />
              </label>
              <label data-tooltip={"Minimum customer demand in generated instances."}>
                Min demand
                <input
                  type="text"
                  min="1"
                  max="50"
                  value={generator.demandMin}
                  onChange={(event) =>
                    setGenerator((current) => ({
                      ...current,
                      demandMin: Number(event.target.value)
                    }))
                  }
                  disabled={isRunning}
                />
              </label>
              <label data-tooltip={"Maximum customer demand in generated instances.\nHigher max demand increases capacity pressure."}>
                Max demand
                <input
                  type="text"
                  min="1"
                  max="50"
                  value={generator.demandMax}
                  onChange={(event) =>
                    setGenerator((current) => ({
                      ...current,
                      demandMax: Number(event.target.value)
                    }))
                  }
                  disabled={isRunning}
                />
              </label>
              <label data-tooltip={"Minimum customer service time in generated instances."}>
                Min service
                <input
                  type="text"
                  min="1"
                  max="60"
                  value={generator.serviceMin}
                  onChange={(event) =>
                    setGenerator((current) => ({
                      ...current,
                      serviceMin: Number(event.target.value)
                    }))
                  }
                  disabled={isRunning}
                />
              </label>
              <label data-tooltip={"Maximum customer service time.\nHigher service times increase route-duration pressure."}>
                Max service
                <input
                  type="text"
                  min="1"
                  max="60"
                  value={generator.serviceMax}
                  onChange={(event) =>
                    setGenerator((current) => ({
                      ...current,
                      serviceMax: Number(event.target.value)
                    }))
                  }
                  disabled={isRunning}
                />
              </label>
              <label data-tooltip={"Maximum customer priority value.\nHigher priorities increase weighted lateness penalties."}>
                Max priority
                <input
                  type="text"
                  min="1"
                  max="10"
                  value={generator.priorityMax}
                  onChange={(event) =>
                    setGenerator((current) => ({
                      ...current,
                      priorityMax: Number(event.target.value)
                    }))
                  }
                  disabled={isRunning}
                />
              </label>
            </div>
            <div className="generator-actions">
              <button type="button" onClick={handleGenerateInstance} disabled={isRunning}>
                Generate instance
              </button>
            </div>
          </section>
        </section>

        <section className="panel viz-panel">
          <header>
            <h2>Solution Overview</h2>
            <p>
              Instance <strong>{currentInstance.name}</strong>
              {solution ? (
                <> · Objective <strong>{solution.metrics.objective.toFixed(2)}</strong></>
              ) : (
                <> · Objective <strong>--</strong></>
              )}
            </p>
            <div className="results-actions">
              <button type="button" onClick={handleDownloadSolution} disabled={!solution || isRunning}>
                Download solution
              </button>
              <label className="file-button">
                Import solution
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportSolution}
                  disabled={isRunning}
                />
              </label>
            </div>
          </header>
          <div className="metrics-grid">
            {solution ? (
              <>
                <article
                  className="metric-card"
                  data-tooltip={metricTooltip(
                    "Penalty part of objective for customers not served by any route.",
                    `unservedCount (${solution.metrics.unservedCount}) × unservedPenalty (${defaultSolverConfig.unservedPenalty})`
                  )}
                >
                  <h3>Unserved contribution</h3>
                  <strong>{(solution.metrics.unservedCount * defaultSolverConfig.unservedPenalty).toFixed(2)}</strong>
                </article>
                <article
                  className="metric-card"
                  data-tooltip={metricTooltip(
                    "Penalty part of objective for arriving after customer time-window end.",
                    `totalLateness (${solution.metrics.totalLateness.toFixed(2)}) × latePenalty (${defaultSolverConfig.latePenalty})`
                  )}
                >
                  <h3>Lateness contribution</h3>
                  <strong>{(solution.metrics.totalLateness * defaultSolverConfig.latePenalty).toFixed(2)}</strong>
                </article>
                <article
                  className="metric-card"
                  data-tooltip={metricTooltip(
                    "Priority-weighted lateness part of objective.",
                    `totalPriorityPenalty (${solution.metrics.totalPriorityPenalty.toFixed(2)}) × priorityPenalty (${defaultSolverConfig.priorityPenalty})`
                  )}
                >
                  <h3>Priority contribution</h3>
                  <strong>{(solution.metrics.totalPriorityPenalty * defaultSolverConfig.priorityPenalty).toFixed(2)}</strong>
                </article>
              </>
            ) : null}
            <article
              className="metric-card"
              data-tooltip={metricTooltip(
                "Main optimization score (lower is better).",
                "distance + lateness contribution + priority contribution + unserved contribution"
              )}
            >
              <h3>Objective</h3>
              <strong>{solution ? solution.metrics.objective.toFixed(2) : "--"}</strong>
            </article>
            <article
              className="metric-card"
              data-tooltip={metricTooltip(
                "Sum of traveled distances across all vehicle routes.",
                "Σ route distance"
              )}
            >
              <h3>Distance</h3>
              <strong>{solution ? solution.metrics.totalDistance.toFixed(2) : "--"}</strong>
            </article>
            <article
              className="metric-card"
              data-tooltip={metricTooltip(
                "Total route duration over all vehicles.",
                "Σ route duration (depot start to depot return)"
              )}
            >
              <h3>Duration</h3>
              <strong>{solution ? solution.metrics.totalDuration.toFixed(1) : "--"}</strong>
            </article>
            <article
              className="metric-card"
              data-tooltip={metricTooltip(
                "Raw lateness amount before multiplying by latePenalty.",
                "Σ max(0, serviceStartTime - customer.timeWindow.end)"
              )}
            >
              <h3>Late penalty</h3>
              <strong>{solution ? solution.metrics.totalLateness.toFixed(1) : "--"}</strong>
            </article>
            <article
              className="metric-card"
              data-tooltip={metricTooltip(
                "How many customers are not assigned to any route.",
                "Count of unservedCustomerIds"
              )}
            >
              <h3>Unserved</h3>
              <strong>{solution ? solution.metrics.unservedCount : "--"}</strong>
            </article>
            <article
              className="metric-card"
              data-tooltip={metricTooltip(
                "Solution is feasible only if no hard constraints are violated and no customers are unserved.",
                "capacity, route duration, and unservedCount checks"
              )}
            >
              <h3>Feasible</h3>
              <strong>{solution ? (solution.metrics.feasible ? "Yes" : "No") : "--"}</strong>
            </article>
          </div>
          {solution ? (
            <>
              <div className="canvas-card">
                <RouteMap instance={currentInstance} solution={solution} />
              </div>
              <div className="canvas-card">
                <ConvergenceChart solution={solution} />
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
