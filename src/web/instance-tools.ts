import type { Customer, ProblemInstance } from "../domain";

export type InstanceGeneratorConfig = {
  name: string;
  customerCount: number;
  vehicleCount: number;
  capacity: number;
  maxRouteDuration: number;
  mapSize: number;
  horizon: number;
  demandMin: number;
  demandMax: number;
  serviceMin: number;
  serviceMax: number;
  priorityMax: number;
  seed: number;
};

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(next: () => number, min: number, max: number): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.floor(next() * (high - low + 1)) + low;
}

function createCustomer(
  id: string,
  next: () => number,
  config: InstanceGeneratorConfig
): Customer {
  const x = randomInt(next, 8, config.mapSize - 8);
  const y = randomInt(next, 8, config.mapSize - 8);
  const demand = randomInt(next, config.demandMin, config.demandMax);
  const serviceTime = randomInt(next, config.serviceMin, config.serviceMax);
  const start = randomInt(next, 0, Math.max(0, Math.floor(config.horizon * 0.7)));
  const windowSpan = randomInt(next, 24, Math.max(24, Math.floor(config.horizon * 0.3)));
  const end = Math.min(config.horizon, start + windowSpan);

  return {
    id,
    x,
    y,
    demand,
    serviceTime,
    timeWindow: {
      start,
      end: Math.max(start + serviceTime + 8, end)
    },
    priority: randomInt(next, 1, config.priorityMax)
  };
}

export function generateInstance(config: InstanceGeneratorConfig): ProblemInstance {
  const next = createSeededRandom(config.seed);
  const safeName = config.name.trim() || `generated-${config.seed}`;
  const depotCoordinate = Math.round(config.mapSize / 2);

  return {
    name: safeName,
    depot: {
      id: "D0",
      x: depotCoordinate,
      y: depotCoordinate,
      timeWindow: {
        start: 0,
        end: config.horizon
      }
    },
    customers: Array.from({ length: config.customerCount }, (_, index) =>
      createCustomer(`G${index + 1}`, next, config)
    ),
    vehicles: {
      count: config.vehicleCount,
      capacity: config.capacity,
      maxRouteDuration: config.maxRouteDuration
    }
  };
}

function isProblemInstance(value: unknown): value is ProblemInstance {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === "string" &&
    Array.isArray(candidate.customers) &&
    typeof candidate.vehicles === "object" &&
    typeof candidate.depot === "object"
  );
}

export function parseProblemInstance(raw: string): ProblemInstance {
  const parsed = JSON.parse(raw) as unknown;

  if (!isProblemInstance(parsed)) {
    throw new Error("JSON does not match the expected problem instance shape.");
  }

  return parsed;
}

export function downloadInstance(instance: ProblemInstance): void {
  const blob = new Blob([JSON.stringify(instance, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${instance.name}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
