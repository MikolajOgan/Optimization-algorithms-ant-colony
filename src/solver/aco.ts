import type {
  Customer,
  IterationSnapshot,
  ProblemInstance,
  Solution,
  SolverConfig,
  VehicleRoute
} from "../domain";
import { defaultSolverConfig } from "../domain";
import { buildRoute, calculateMetrics } from "./evaluation";
import { clamp, mean } from "./math";
import { createProblemGraph } from "./problem";
import { createRandom, type Random } from "./random";
import { improveRoutes } from "./local-search";

type AntSolution = {
  routes: VehicleRoute[];
  unservedCustomerIds: string[];
};

export type SolverProgress = {
  iteration: number;
  totalIterations: number;
  bestObjective: number;
};

function mergedConfig(config?: Partial<SolverConfig>): SolverConfig {
  return {
    ...defaultSolverConfig,
    ...config
  };
}

function heuristicValue(customer: Customer, travel: number, currentLoad: number, currentTime: number, vehicleCapacity: number): number {
  const slack = Math.max(1, customer.timeWindow.end - currentTime);
  const urgency = 1 / slack;
  const distanceScore = 1 / Math.max(1, travel);
  const capacityFit = 1 - Math.abs(vehicleCapacity - (currentLoad + customer.demand)) / vehicleCapacity;
  const priorityScore = customer.priority / 10;
  return distanceScore * 0.5 + urgency * 0.2 + capacityFit * 0.15 + priorityScore * 0.15;
}

function pickByWeight(entries: Array<{ id: string; weight: number }>, random: Random): string {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);

  if (totalWeight <= 0) {
    return entries[random.int(entries.length)].id;
  }

  const threshold = random.next() * totalWeight;
  let cumulative = 0;

  for (const entry of entries) {
    cumulative += entry.weight;

    if (cumulative >= threshold) {
      return entry.id;
    }
  }

  return entries[entries.length - 1].id;
}

function constructAntSolution(
  instance: ProblemInstance,
  config: SolverConfig,
  pheromone: number[][],
  random: Random
): AntSolution {
  const graph = createProblemGraph(instance);
  const unvisited = new Set(instance.customers.map((customer) => customer.id));
  const routes: VehicleRoute[] = [];

  for (let vehicleId = 0; vehicleId < instance.vehicles.count; vehicleId += 1) {
    let routeCustomerIds: string[] = [];
    let currentNodeIndex = 0;
    let currentTime = instance.depot.timeWindow.start;
    let currentLoad = 0;

    while (unvisited.size > 0) {
      const candidates = instance.customers
        .filter((customer) => unvisited.has(customer.id))
        .map((customer) => {
          const customerNodeIndex = graph.idToIndex.get(customer.id)!;
          const travel = graph.distances[currentNodeIndex][customerNodeIndex];
          const projectedLoad = currentLoad + customer.demand;
          const arrival = currentTime + travel;
          const serviceStart = Math.max(arrival, customer.timeWindow.start);
          const departure = serviceStart + customer.serviceTime;
          const returnToDepot = graph.distances[customerNodeIndex][0];
          const projectedDuration = departure + returnToDepot - instance.depot.timeWindow.start;

          return {
            customer,
            travel,
            projectedLoad,
            projectedDuration,
            pheromone: pheromone[currentNodeIndex][customerNodeIndex],
            visibility: heuristicValue(
              customer,
              travel,
              currentLoad,
              currentTime,
              instance.vehicles.capacity
            )
          };
        })
        .filter(
          (candidate) =>
            candidate.projectedLoad <= instance.vehicles.capacity &&
            candidate.projectedDuration <= instance.vehicles.maxRouteDuration
        )
        .sort((left, right) => left.travel - right.travel)
        .slice(0, Math.max(1, config.candidateWidth));

      if (candidates.length === 0) {
        break;
      }

      const pickedId = pickByWeight(
        candidates.map((candidate) => ({
          id: candidate.customer.id,
          weight:
            Math.pow(candidate.pheromone, config.alpha) *
            Math.pow(candidate.visibility, config.beta)
        })),
        random
      );
      const picked = candidates.find((candidate) => candidate.customer.id === pickedId)!;

      routeCustomerIds = [...routeCustomerIds, picked.customer.id];
      unvisited.delete(picked.customer.id);
      currentLoad += picked.customer.demand;
      currentTime = Math.max(currentTime + picked.travel, picked.customer.timeWindow.start) + picked.customer.serviceTime;
      currentNodeIndex = graph.idToIndex.get(picked.customer.id)!;
    }

    routes.push(buildRoute(instance, vehicleId, routeCustomerIds));
  }

  return {
    routes,
    unservedCustomerIds: [...unvisited]
  };
}

function cloneRoutes(routes: VehicleRoute[]): VehicleRoute[] {
  return routes.map((route) => ({
    ...route,
    customerIds: [...route.customerIds],
    stops: route.stops.map((stop) => ({ ...stop }))
  }));
}

function evaporate(pheromone: number[][], evaporationRate: number): void {
  for (let row = 0; row < pheromone.length; row += 1) {
    for (let column = 0; column < pheromone[row].length; column += 1) {
      pheromone[row][column] = Math.max(0.05, pheromone[row][column] * (1 - evaporationRate));
    }
  }
}

function jitterPheromone(pheromone: number[][], jitter: number, random: Random): void {
  if (jitter <= 0) {
    return;
  }

  const minMultiplier = 1 - jitter;
  const maxMultiplier = 1 + jitter;

  for (let row = 0; row < pheromone.length; row += 1) {
    for (let column = 0; column < pheromone[row].length; column += 1) {
      const multiplier = minMultiplier + (maxMultiplier - minMultiplier) * random.next();
      pheromone[row][column] = Math.max(0.05, pheromone[row][column] * multiplier);
    }
  }
}

function reinforce(
  pheromone: number[][],
  routes: VehicleRoute[],
  weight: number,
  objective: number,
  idToIndex: Map<string, number>
): void {
  const deposit = weight / Math.max(1, objective);

  for (const route of routes) {
    let previousNode = 0;

    for (const customerId of route.customerIds) {
      const currentNode = idToIndex.get(customerId)!;
      pheromone[previousNode][currentNode] += deposit;
      pheromone[currentNode][previousNode] += deposit;
      previousNode = currentNode;
    }

    pheromone[previousNode][0] += deposit;
    pheromone[0][previousNode] += deposit;
  }
}

export function solve(
  instance: ProblemInstance,
  partialConfig?: Partial<SolverConfig>,
  onProgress?: (progress: SolverProgress) => void
): Solution {
  const config = mergedConfig(partialConfig);
  const graph = createProblemGraph(instance);
  const pheromone = graph.nodes.map(() => graph.nodes.map(() => 1));
  const random = createRandom(config.randomSeed);

  let evaporationRate = config.evaporationRate;
  let beta = config.beta;
  let stagnantIterations = 0;
  let globalBest: Solution | null = null;
  const convergence: IterationSnapshot[] = [];

  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    const candidateSolutions: Solution[] = [];

    for (let ant = 0; ant < config.colonySize; ant += 1) {
      const antResult = constructAntSolution(instance, { ...config, beta }, pheromone, random);
      let routes = antResult.routes;

      if (config.localSearch) {
        routes = improveRoutes(instance, routes, antResult.unservedCustomerIds, config);
      }

      const metrics = calculateMetrics(instance, routes, antResult.unservedCustomerIds, config);
      candidateSolutions.push({
        instanceName: instance.name,
        routes,
        unservedCustomerIds: antResult.unservedCustomerIds,
        metrics,
        convergence: []
      });
    }

    candidateSolutions.sort((left, right) => left.metrics.objective - right.metrics.objective);
    const iterationBest = candidateSolutions[0];
    const averageObjective = mean(candidateSolutions.map((candidate) => candidate.metrics.objective));

    if (!globalBest || iterationBest.metrics.objective < globalBest.metrics.objective) {
      globalBest = {
        ...iterationBest,
        routes: cloneRoutes(iterationBest.routes),
        convergence: []
      };
      stagnantIterations = 0;
    } else {
      stagnantIterations += 1;
    }

    evaporate(pheromone, evaporationRate);
    reinforce(
      pheromone,
      iterationBest.routes,
      config.eliteWeight,
      iterationBest.metrics.objective,
      graph.idToIndex
    );

    if (globalBest) {
      reinforce(
        pheromone,
        globalBest.routes,
        config.globalBestWeight,
        globalBest.metrics.objective,
        graph.idToIndex
      );
    }

    if (config.evaporationRateStep !== 0) {
      evaporationRate = clamp(
        evaporationRate + config.evaporationRateStep,
        config.minEvaporationRate,
        config.maxEvaporationRate
      );
    }

    if (stagnantIterations >= config.stagnationWindow) {
      jitterPheromone(pheromone, config.stagnationPheromoneJitter, random);
      evaporationRate = clamp(evaporationRate + 0.04, config.minEvaporationRate, config.maxEvaporationRate);
      beta = clamp(beta + 0.2, 1.5, 5);
      stagnantIterations = 0;
    } else {
      evaporationRate = clamp(evaporationRate - 0.01, config.minEvaporationRate, config.maxEvaporationRate);
      beta = clamp(beta - 0.05, 1.5, 5);
    }

    convergence.push({
      iteration: iteration + 1,
      bestObjective: iterationBest.metrics.objective,
      averageObjective,
      evaporationRate,
      beta
    });

    onProgress?.({
      iteration: iteration + 1,
      totalIterations: config.iterations,
      bestObjective: globalBest?.metrics.objective ?? iterationBest.metrics.objective
    });
  }

  if (!globalBest) {
    const emptyRoutes = Array.from({ length: instance.vehicles.count }, (_, vehicleId) => buildRoute(instance, vehicleId, []));
    const metrics = calculateMetrics(instance, emptyRoutes, instance.customers.map((customer) => customer.id), config);

    return {
      instanceName: instance.name,
      routes: emptyRoutes,
      unservedCustomerIds: instance.customers.map((customer) => customer.id),
      metrics,
      convergence
    };
  }

  return {
    ...globalBest,
    convergence
  };
}
