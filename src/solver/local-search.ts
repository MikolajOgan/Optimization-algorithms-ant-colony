import type { ProblemInstance, VehicleRoute } from "../domain";
import { buildRoute, calculateMetrics } from "./evaluation";
import type { SolverConfig } from "../domain";

function routeObjective(instance: ProblemInstance, routes: VehicleRoute[], unserved: string[], config: SolverConfig): number {
  return calculateMetrics(instance, routes, unserved, config).objective;
}

function tryTwoOpt(instance: ProblemInstance, route: VehicleRoute): VehicleRoute {
  let best = route;

  for (let i = 0; i < route.customerIds.length - 1; i += 1) {
    for (let j = i + 1; j < route.customerIds.length; j += 1) {
      const candidateIds = [
        ...route.customerIds.slice(0, i),
        ...route.customerIds.slice(i, j + 1).reverse(),
        ...route.customerIds.slice(j + 1)
      ];
      const candidate = buildRoute(instance, route.vehicleId, candidateIds);

      if (candidate.feasible && candidate.distance < best.distance) {
        best = candidate;
      }
    }
  }

  return best;
}

function tryRelocate(
  instance: ProblemInstance,
  routes: VehicleRoute[],
  config: SolverConfig,
  unserved: string[]
): VehicleRoute[] {
  let bestRoutes = routes;
  let bestObjective = routeObjective(instance, routes, unserved, config);

  for (let fromIndex = 0; fromIndex < routes.length; fromIndex += 1) {
    for (let toIndex = 0; toIndex < routes.length; toIndex += 1) {
      if (fromIndex === toIndex) {
        continue;
      }

      const fromRoute = routes[fromIndex];
      const toRoute = routes[toIndex];

      for (let customerIndex = 0; customerIndex < fromRoute.customerIds.length; customerIndex += 1) {
        const movedCustomer = fromRoute.customerIds[customerIndex];

        for (let insertAt = 0; insertAt <= toRoute.customerIds.length; insertAt += 1) {
          const nextRoutes = routes.map((route) => ({ ...route, customerIds: [...route.customerIds] }));
          nextRoutes[fromIndex].customerIds.splice(customerIndex, 1);
          nextRoutes[toIndex].customerIds.splice(insertAt, 0, movedCustomer);

          const rebuilt = nextRoutes.map((route, vehicleId) => buildRoute(instance, vehicleId, route.customerIds));

          if (rebuilt.every((route) => route.feasible)) {
            const objective = routeObjective(instance, rebuilt, unserved, config);

            if (objective < bestObjective) {
              bestObjective = objective;
              bestRoutes = rebuilt;
            }
          }
        }
      }
    }
  }

  return bestRoutes;
}

function trySwap(
  instance: ProblemInstance,
  routes: VehicleRoute[],
  config: SolverConfig,
  unserved: string[]
): VehicleRoute[] {
  let bestRoutes = routes;
  let bestObjective = routeObjective(instance, routes, unserved, config);

  for (let leftRouteIndex = 0; leftRouteIndex < routes.length; leftRouteIndex += 1) {
    for (let rightRouteIndex = leftRouteIndex + 1; rightRouteIndex < routes.length; rightRouteIndex += 1) {
      const leftRoute = routes[leftRouteIndex];
      const rightRoute = routes[rightRouteIndex];

      for (let leftIndex = 0; leftIndex < leftRoute.customerIds.length; leftIndex += 1) {
        for (let rightIndex = 0; rightIndex < rightRoute.customerIds.length; rightIndex += 1) {
          const nextRoutes = routes.map((route) => ({ ...route, customerIds: [...route.customerIds] }));
          const leftCustomer = nextRoutes[leftRouteIndex].customerIds[leftIndex];
          nextRoutes[leftRouteIndex].customerIds[leftIndex] = nextRoutes[rightRouteIndex].customerIds[rightIndex];
          nextRoutes[rightRouteIndex].customerIds[rightIndex] = leftCustomer;

          const rebuilt = nextRoutes.map((route, vehicleId) => buildRoute(instance, vehicleId, route.customerIds));

          if (rebuilt.every((route) => route.feasible)) {
            const objective = routeObjective(instance, rebuilt, unserved, config);

            if (objective < bestObjective) {
              bestObjective = objective;
              bestRoutes = rebuilt;
            }
          }
        }
      }
    }
  }

  return bestRoutes;
}

export function improveRoutes(
  instance: ProblemInstance,
  routes: VehicleRoute[],
  unserved: string[],
  config: SolverConfig
): VehicleRoute[] {
  let improved = routes.map((route) => tryTwoOpt(instance, route));
  improved = tryRelocate(instance, improved, config, unserved);
  improved = trySwap(instance, improved, config, unserved);
  return improved;
}
