import type { Customer, Depot, ProblemInstance } from "../domain";
import { euclideanDistance } from "./math";

export type ProblemGraph = {
  depot: Depot;
  customers: Customer[];
  nodes: Array<Depot | Customer>;
  distances: number[][];
  idToIndex: Map<string, number>;
  customerIndexById: Map<string, number>;
};

export function createProblemGraph(instance: ProblemInstance): ProblemGraph {
  const nodes: Array<Depot | Customer> = [instance.depot, ...instance.customers];
  const distances = nodes.map((from) => nodes.map((to) => euclideanDistance(from, to)));
  const idToIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const customerIndexById = new Map(instance.customers.map((customer, index) => [customer.id, index]));

  return {
    depot: instance.depot,
    customers: instance.customers,
    nodes,
    distances,
    idToIndex,
    customerIndexById
  };
}
