export type Point = {
  x: number;
  y: number;
};

export type TimeWindow = {
  start: number;
  end: number;
};

export type Depot = Point & {
  id: string;
  timeWindow: TimeWindow;
};

export type Customer = Point & {
  id: string;
  demand: number;
  serviceTime: number;
  timeWindow: TimeWindow;
  priority: number;
};

export type VehicleSpec = {
  count: number;
  capacity: number;
  maxRouteDuration: number;
};

export type ProblemInstance = {
  name: string;
  depot: Depot;
  customers: Customer[];
  vehicles: VehicleSpec;
};

export type SolverConfig = {
  colonySize: number;
  iterations: number;
  alpha: number;
  beta: number;
  evaporationRate: number;
  evaporationRateStep: number;
  minEvaporationRate: number;
  maxEvaporationRate: number;
  eliteWeight: number;
  globalBestWeight: number;
  stagnationPheromoneJitter: number;
  latePenalty: number;
  unservedPenalty: number;
  priorityPenalty: number;
  candidateWidth: number;
  localSearch: boolean;
  stagnationWindow: number;
  randomSeed: number;
};

export type RouteStop = {
  customerId: string;
  arrivalTime: number;
  serviceStartTime: number;
  departureTime: number;
  loadAfterService: number;
  lateness: number;
};

export type VehicleRoute = {
  vehicleId: number;
  customerIds: string[];
  stops: RouteStop[];
  distance: number;
  duration: number;
  load: number;
  feasible: boolean;
};

export type SolutionMetrics = {
  totalDistance: number;
  totalDuration: number;
  totalLateness: number;
  totalPriorityPenalty: number;
  unservedCount: number;
  objective: number;
  feasible: boolean;
};

export type IterationSnapshot = {
  iteration: number;
  bestObjective: number;
  averageObjective: number;
  evaporationRate: number;
  beta: number;
};

export type Solution = {
  instanceName: string;
  routes: VehicleRoute[];
  unservedCustomerIds: string[];
  metrics: SolutionMetrics;
  convergence: IterationSnapshot[];
};

export type BenchmarkRun = {
  instanceName: string;
  bestObjective: number;
  meanObjective: number;
  worstObjective: number;
  feasibilityRate: number;
  meanRuntimeMs: number;
};

export type ExperimentConfig = {
  runsPerInstance: number;
  seedBase: number;
  parameterSets: Array<Partial<SolverConfig>>;
};

export type ExperimentSummary = {
  runs: BenchmarkRun[];
};
