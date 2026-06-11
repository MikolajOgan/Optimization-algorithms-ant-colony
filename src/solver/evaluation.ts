import type {
  ProblemInstance,
  RouteStop,
  Solution,
  SolutionMetrics,
  SolverConfig,
  VehicleRoute
} from "../domain";
import { createProblemGraph } from "./problem";

function createStops(
  instance: ProblemInstance,
  routeCustomerIds: string[]
): { stops: RouteStop[]; distance: number; duration: number; load: number; feasible: boolean; totalLateness: number; totalPriorityPenalty: number } {
  const graph = createProblemGraph(instance);
  const customersById = new Map(instance.customers.map((customer) => [customer.id, customer]));

  let currentNodeId = instance.depot.id;
  let currentTime = instance.depot.timeWindow.start;
  let load = 0;
  let distance = 0;
  let totalLateness = 0;
  let totalPriorityPenalty = 0;
  let feasible = true;
  const stops: RouteStop[] = [];

  for (const customerId of routeCustomerIds) {
    const customer = customersById.get(customerId);

    if (!customer) {
      feasible = false;
      continue;
    }

    const fromIndex = graph.idToIndex.get(currentNodeId)!;
    const toIndex = graph.idToIndex.get(customerId)!;
    const travel = graph.distances[fromIndex][toIndex];
    const arrivalTime = currentTime + travel;

    distance += travel;
    currentTime = arrivalTime;
    const serviceStartTime = Math.max(arrivalTime, customer.timeWindow.start);
    const lateness = Math.max(0, serviceStartTime - customer.timeWindow.end);
    currentTime = serviceStartTime + customer.serviceTime;
    load += customer.demand;
    totalLateness += lateness;
    totalPriorityPenalty += lateness * customer.priority;

    if (load > instance.vehicles.capacity) {
      feasible = false;
    }

    stops.push({
      customerId,
      arrivalTime,
      serviceStartTime,
      departureTime: currentTime,
      loadAfterService: load,
      lateness
    });

    currentNodeId = customerId;
  }

  const returnDistance = graph.distances[graph.idToIndex.get(currentNodeId)!][0];
  distance += returnDistance;
  const duration = currentTime + returnDistance - instance.depot.timeWindow.start;

  if (duration > instance.vehicles.maxRouteDuration) {
    feasible = false;
  }

  return {
    stops,
    distance,
    duration,
    load,
    feasible,
    totalLateness,
    totalPriorityPenalty
  };
}

export function buildRoute(instance: ProblemInstance, vehicleId: number, routeCustomerIds: string[]): VehicleRoute {
  const route = createStops(instance, routeCustomerIds);

  return {
    vehicleId,
    customerIds: [...routeCustomerIds],
    stops: route.stops,
    distance: route.distance,
    duration: route.duration,
    load: route.load,
    feasible: route.feasible
  };
}

export function calculateMetrics(
  instance: ProblemInstance,
  routes: VehicleRoute[],
  unservedCustomerIds: string[],
  config: SolverConfig
): SolutionMetrics {
  const customerLookup = new Map(instance.customers.map((customer) => [customer.id, customer]));

  let totalDistance = 0;
  let totalDuration = 0;
  let totalLateness = 0;
  let totalPriorityPenalty = 0;
  let feasible = true;

  for (const route of routes) {
    totalDistance += route.distance;
    totalDuration += route.duration;

    if (!route.feasible) {
      feasible = false;
    }

    for (const stop of route.stops) {
      totalLateness += stop.lateness;
      const customer = customerLookup.get(stop.customerId);

      if (customer) {
        totalPriorityPenalty += stop.lateness * customer.priority;
      }
    }
  }

  const objective =
    totalDistance +
    totalLateness * config.latePenalty +
    totalPriorityPenalty * config.priorityPenalty +
    unservedCustomerIds.length * config.unservedPenalty;

  if (unservedCustomerIds.length > 0) {
    feasible = false;
  }

  return {
    totalDistance,
    totalDuration,
    totalLateness,
    totalPriorityPenalty,
    unservedCount: unservedCustomerIds.length,
    objective,
    feasible
  };
}

export function evaluateSolution(
  instance: ProblemInstance,
  solution: Omit<Solution, "metrics" | "convergence">,
  config: SolverConfig
): Solution {
  const routes = solution.routes.map((route) => buildRoute(instance, route.vehicleId, route.customerIds));
  const metrics = calculateMetrics(instance, routes, solution.unservedCustomerIds, config);

  return {
    ...solution,
    routes,
    metrics,
    convergence: []
  };
}
