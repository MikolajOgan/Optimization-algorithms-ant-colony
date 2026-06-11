import demoInstance from "../../assets/instances/demo.json";
import mediumEasyInstance from "../../assets/instances/medium-easy.json";
import bigData from "../../assets/instances/bigData.json";
import tightWindowsInstance from "../../assets/instances/tight-windows.json";
import type { ProblemInstance } from "../domain";

export const builtInInstances: ProblemInstance[] = [
  demoInstance as ProblemInstance,
  mediumEasyInstance as ProblemInstance,
  tightWindowsInstance as ProblemInstance,
  bigData as ProblemInstance
];
